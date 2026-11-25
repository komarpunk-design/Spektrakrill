"""GPLv3. OAuth resource metadata and rejection of wrong or forged bearer tokens."""
import asyncio
from dataclasses import replace
import json
from pathlib import Path
import re
import tempfile
import time
import unittest
from unittest.mock import patch
import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from starlette.testclient import TestClient
from spektrafilm_chat.auth import JwtVerifier, SCOPE
from spektrafilm_chat.config import Config
from spektrafilm_chat.server import create_server
from test_app import rpc

ISSUER="https://identity.example.com"
ORIGIN="https://photos.example.com"
CONFIG=Config(public_url=ORIGIN,oauth_issuer=ISSUER,oauth_jwks_url=ISSUER+"/jwks",allowed_subjects=("owner",))
PRIVATE=rsa.generate_private_key(public_exponent=65537,key_size=2048)
PUBLIC={**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(PRIVATE.public_key())),"kid":"key-one","alg":"RS256","use":"sig"}

def token(*,key=PRIVATE,kid="key-one",**overrides):
    claims={"iss":ISSUER,"aud":CONFIG.resource_url,"sub":"owner","scope":SCOPE,"exp":int(time.time())+900,"client_id":"chatgpt"}
    claims.update(overrides)
    return jwt.encode(claims,key,algorithm="RS256",headers={"kid":kid})

class JwtTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_owner_token_is_verified_and_keys_are_cached(self):
        calls=[]
        def handler(request):calls.append(str(request.url));return httpx.Response(200,json={"keys":[PUBLIC]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            verifier=JwtVerifier(CONFIG,client=client)
            value=await verifier.verify_token(token())
            self.assertEqual(value.subject,"owner");self.assertEqual(value.resource,CONFIG.resource_url)
            self.assertEqual(value.scopes,[SCOPE]);self.assertEqual(value.client_id,"chatgpt")
            self.assertIsNotNone(await verifier.verify_token(token()))
            self.assertEqual(len(calls),1)

    async def test_wrong_signature_issuer_audience_scope_expiry_and_account_are_refused(self):
        other=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={"keys":[PUBLIC]}))) as client:
            verifier=JwtVerifier(CONFIG,client=client)
            for bad in (token(key=other),token(iss="https://evil.example.com"),token(aud="another-app"),token(scope="unrelated"),token(exp=int(time.time())-1),token(sub="another-user"),"not-a-token", "x"*20000):
                self.assertIsNone(await verifier.verify_token(bad))
            forged=jwt.encode({"iss":ISSUER,"aud":CONFIG.resource_url,"sub":"owner","scope":SCOPE,"exp":int(time.time())+900},"not-the-private-key-12345678901234567890",algorithm="HS256",headers={"kid":"key-one"})
            self.assertIsNone(await verifier.verify_token(forged))

    async def test_unknown_key_ids_do_not_force_unbounded_network_requests(self):
        calls=[]
        def handler(request):calls.append(request);return httpx.Response(200,json={"keys":[PUBLIC]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            verifier=JwtVerifier(CONFIG,client=client)
            self.assertIsNotNone(await verifier.verify_token(token()))
            for i in range(20):self.assertIsNone(await verifier.verify_token(token(kid=f"unknown-{i}")))
            self.assertEqual(len(calls),1)

    async def test_key_rotation_is_picked_up_from_the_configured_provider(self):
        new_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        new_public={**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(new_key.public_key())),"kid":"key-two"}
        keys=[PUBLIC]
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={"keys":keys}))) as client:
            verifier=JwtVerifier(CONFIG,client=client)
            self.assertIsNotNone(await verifier.verify_token(token()))
            keys[:]=[new_public];verifier.refreshed-=6
            self.assertIsNotNone(await verifier.verify_token(token(key=new_key,kid="key-two")))

    async def test_provider_failure_or_malformed_keys_never_authorize_a_request(self):
        for status,body in ((500,{}),(200,[]),(200,{"keys":[]}),(200,{"keys":[PUBLIC,PUBLIC]})):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _,s=status,b=body:httpx.Response(s,json=b))) as client:
                self.assertIsNone(await JwtVerifier(CONFIG,client=client).verify_token(token()))

class ProtectedHttpTests(unittest.TestCase):
    def test_public_instance_cannot_start_without_oauth_configuration(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError):create_server(Config(data=Path(td),public_url=ORIGIN))
            with self.assertRaises(ValueError):Config(oauth_issuer=ISSUER)
            with self.assertRaises(ValueError):replace(CONFIG,oauth_jwks_url="http://identity.example.com/keys")

    def test_challenge_metadata_and_authenticated_mcp_discovery(self):
        with tempfile.TemporaryDirectory() as td:
            config=replace(CONFIG,data=Path(td))
            client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={"keys":[PUBLIC]})))
            verifier=JwtVerifier(config,client=client)
            try:
                with patch("spektrafilm_chat.server.JwtVerifier",return_value=verifier):server=create_server(config)
                with TestClient(server.streamable_http_app(),base_url=ORIGIN) as http:
                    response=http.post("/mcp",json={"jsonrpc":"2.0","id":7,"method":"tools/list"})
                    self.assertEqual(response.status_code,401)
                    challenge=response.headers["www-authenticate"]
                    metadata_url=re.search('resource_metadata="([^"]+)"',challenge).group(1)
                    metadata=http.get(metadata_url).json()
                    self.assertEqual(metadata["resource"],config.resource_url)
                    self.assertEqual(metadata["authorization_servers"],[ISSUER])
                    self.assertEqual(metadata["scopes_supported"],[SCOPE])
                    unauthorized=http.post("/mcp",headers={"Authorization":"Bearer forged"},json={"jsonrpc":"2.0","id":7,"method":"tools/list"})
                    self.assertEqual(unauthorized.status_code,401)
                    tools=rpc(http,"tools/list",headers={"Authorization":"Bearer "+token()})["tools"]
                    self.assertEqual(tools[0]["_meta"]["securitySchemes"],[{"type":"oauth2","scopes":[SCOPE]}])
            finally:asyncio.run(client.aclose())
