"""GPLv3. Standard OAuth resource-server validation with PyJWT and the MCP SDK.

The existing identity provider handles login, PKCE, registration, refresh and revocation.
No passwords, client secrets or home-grown authorization server are stored here.
"""
import asyncio
import json
import time
import httpx
import jwt
from mcp.server.auth.provider import AccessToken
from .config import Config

SCOPE = "photos:develop"

class JwtVerifier:
    def __init__(self, config: Config, *, client: httpx.AsyncClient | None = None):
        if not config.oauth_issuer or not config.oauth_jwks_url:
            raise ValueError("OAuth issuer and JWKS URL required")
        self.config = config
        self.client = client
        self.keys = {}
        self.expires = 0.0
        self.refreshed = -float("inf")
        self.lock = asyncio.Lock()

    async def signing_key(self, kid: str):
        now = time.monotonic()
        if now < self.expires and kid in self.keys:
            return self.keys[kid]
        async with self.lock:
            now = time.monotonic()
            if now < self.expires and kid in self.keys:
                return self.keys[kid]
            # An attacker cannot trigger a new JWKS request for every arbitrary kid.
            if now - self.refreshed < 5:
                return None
            self.refreshed = now
            owned = self.client is None
            client = self.client or httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False)
            try:
                async with client.stream("GET", self.config.oauth_jwks_url) as response:
                    response.raise_for_status()
                    body = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=16 << 10):
                        body.extend(chunk)
                        if len(body) > 1 << 20:
                            return None
                document = json.loads(body)
                if not isinstance(document, dict):
                    return None
                items = document.get("keys")
                if not isinstance(items, list) or not 1 <= len(items) <= 32:
                    return None
                keys = {}
                for item in items:
                    if not isinstance(item, dict) or item.get("kty") != "RSA" or item.get("alg", "RS256") != "RS256" or item.get("use", "sig") != "sig" or "d" in item:
                        continue
                    identifier = item.get("kid")
                    if isinstance(identifier, str) and 0 < len(identifier) <= 256:
                        if identifier in keys:
                            return None
                        keys[identifier] = jwt.PyJWK.from_dict(item, algorithm="RS256").key
                self.keys = keys
                self.expires = now + 300
                return keys.get(kid)
            except (httpx.HTTPError, ValueError, TypeError, jwt.PyJWTError):
                return None
            finally:
                if owned:
                    await client.aclose()

    async def verify_token(self, token: str) -> AccessToken | None:
        if len(token) > 16384:
            return None
        try:
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            if header.get("alg") != "RS256" or not isinstance(kid, str) or not 0 < len(kid) <= 256:
                return None
            key = await self.signing_key(kid)
            if key is None:
                return None
            claims = jwt.decode(token, key=key, algorithms=["RS256"],
                audience=self.config.resource_url, issuer=self.config.oauth_issuer,
                options={"require": ["exp", "iss", "aud", "sub"]})
            subject = claims["sub"]
            if not subject or (self.config.allowed_subjects and subject not in self.config.allowed_subjects):
                return None
            raw_scopes = claims.get("scope", claims.get("scp", []))
            scopes = raw_scopes.split() if isinstance(raw_scopes, str) else raw_scopes
            if not isinstance(scopes, list) or not all(isinstance(scope, str) for scope in scopes) or SCOPE not in scopes:
                return None
            client_id = claims.get("azp") or claims.get("client_id") or subject
            if not isinstance(client_id, str):
                return None
            return AccessToken(token=token, client_id=client_id, scopes=scopes,
                expires_at=int(claims["exp"]), resource=self.config.resource_url, subject=subject)
        except (jwt.PyJWTError, ValueError, TypeError, KeyError):
            return None
