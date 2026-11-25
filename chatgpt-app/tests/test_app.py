"""GPLv3. Attachment contract, lifecycle, downloads, image integrity and actual MCP/native flow."""
import asyncio
from dataclasses import replace
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, patch
import zipfile
import httpx
import numpy as np
from PIL import Image
import tifffile
from starlette.testclient import TestClient
from spektrafilm_chat.config import Config
from spektrafilm_chat.download import download_file, permitted_url, public_dns, unwrap_raw
from spektrafilm_chat.processor import export_images, run_native
from spektrafilm_chat.server import create_server
from spektrafilm_chat.storage import FILES, Store

class ConfigurationTests(unittest.TestCase):
    def test_only_local_http_or_public_https(self):
        for url in ("http://example.com", "https://user:secret@example.com", "file:///tmp/test", "https://example.com/path", "https://example.com/?secret=x"):
            with self.assertRaises(ValueError):
                Config(public_url=url)
        self.assertTrue(Config().binary.name == "spektrafilm-develop")
        self.assertTrue(Config(public_url="https://photos.example.com"))
        Config().validate_listener("127.0.0.1")
        with self.assertRaises(ValueError):Config().validate_listener("0.0.0.0")
        Config(local_test=True).validate_listener("0.0.0.0")

class DownloadTests(unittest.IsolatedAsyncioTestCase):
    def test_sources_are_attached_https_files_not_arbitrary_urls(self):
        allowed=("files.oaiusercontent.com", "*.oaiusercontent.com")
        for url in ("http://files.oaiusercontent.com/x", "https://files.oaiusercontent.com.evil.test/x", "https://files.oaiusercontent.com@127.0.0.1/x", "https://files.oaiusercontent.com:123/x", "file:///etc/passwd"):
            with self.assertRaises(ValueError):permitted_url(url, allowed)
        self.assertEqual("files.oaiusercontent.com",permitted_url("https://files.oaiusercontent.com/a?sig=secret",allowed))

    async def test_private_dns_is_refused(self):
        loop=asyncio.get_running_loop()
        for address in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"):
            with patch.object(loop,"getaddrinfo",AsyncMock(return_value=[(2,1,6,"",(address,443))])):
                with self.assertRaises(ValueError):await public_dns("files.oaiusercontent.com")

    async def test_bounded_real_stream_and_redirect_validation(self):
        seen=[]
        def respond(request):
            seen.append(request.url.host)
            return httpx.Response(302,headers={"location":"https://127.0.0.1/private"}) if request.url.path=="/redirect" else httpx.Response(200,content=b"raw-content")
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with tempfile.TemporaryDirectory() as td:
                target=Path(td)/"raw"
                await download_file("https://files.oaiusercontent.com/file",target,("files.oaiusercontent.com",),50,client=client,resolve=AsyncMock())
                self.assertEqual(target.read_bytes(),b"raw-content")
                with self.assertRaises(ValueError):await download_file("https://files.oaiusercontent.com/redirect",Path(td)/"other",("files.oaiusercontent.com",),50,client=client,resolve=AsyncMock())
                self.assertNotIn("127.0.0.1",seen)
                with self.assertRaises(ValueError):await download_file("https://files.oaiusercontent.com/file",Path(td)/"too-large",("files.oaiusercontent.com",),2,client=client,resolve=AsyncMock())

    def test_single_raw_zip_is_path_independent_and_multiple_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/"attachment"
            with zipfile.ZipFile(path,"w") as z:z.writestr("../../camera.NEF",b"actual-raw")
            raw=unwrap_raw(path,100)
            self.assertEqual(raw.parent,Path(td));self.assertEqual(raw.read_bytes(),b"actual-raw")
            raw.unlink()
            with self.assertRaises(ValueError):unwrap_raw(path,2)
            with zipfile.ZipFile(path,"w") as z:z.writestr("one.NEF",b"1");z.writestr("two.ARW",b"2")
            with self.assertRaises(ValueError):unwrap_raw(path,100)

class ExportStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def pixels(self):
        work=self.root/"work";work.mkdir()
        data=np.linspace(0,1,96,dtype="<f4").reshape(4,8,3)
        (work/"render.json").write_text(json.dumps({"width":8,"height":4,"format":"f32le-srgb","film":"kodak_portra_400","scanner":"noritsu-ls600"}))
        data.tofile(work/"result.f32")
        return work,data
    def test_exports_preserve_16_bits_and_icc_and_are_complete(self):
        work,data=self.pixels();result=self.root/"result";result.mkdir()
        details=export_images(work,result)
        np.testing.assert_array_equal(tifffile.imread(result/"result.tiff"),np.rint(data*65535).astype(np.uint16))
        with tifffile.TiffFile(result/"result.tiff") as t:self.assertIn(34675,t.pages[0].tags)
        for name in ("result.jpg","result.png"):
            with Image.open(result/name) as image:
                image.load();self.assertEqual(image.size,(8,4));self.assertTrue(image.info.get("icc_profile"))
        self.assertEqual(details["format"],"f32le-srgb")
    def test_truncated_or_nonfinite_engine_output_is_not_exported(self):
        work,data=self.pixels();result=self.root/"result";result.mkdir()
        (work/"result.f32").write_bytes(b"x")
        with self.assertRaises(ValueError):export_images(work,result)
        data[0,0,0]=np.nan;data.tofile(work/"result.f32")
        with self.assertRaises(ValueError):export_images(work,result)
        self.assertEqual(list(result.iterdir()),[])
    def test_result_links_expire_and_cannot_read_another_file_or_partial_result(self):
        store=Store(Config(data=self.root/"data"));token,directory=store.new()
        for name in FILES:(directory/name).write_bytes(name.encode())
        expires=int(time.time())+60;sig=store.signature(token,"result.jpg",expires)
        self.assertIsNone(store.resolve(token,"result.jpg",expires,sig))
        manifest=store.publish(token,{})
        expires=manifest["expires"];sig=store.signature(token,"result.jpg",expires)
        self.assertEqual(store.resolve(token,"result.jpg",expires,sig),directory/"result.jpg")
        self.assertIsNone(store.resolve(token,"recipe.json",expires,sig))
        self.assertIsNone(store.resolve(token,"../signing.key",expires,sig))
        self.assertIsNone(store.resolve(token,"result.jpg",int(time.time())-1,sig))
        self.assertIsNone(store.resolve(token,"result.jpg",expires,"bad"))
    def test_expired_and_over_quota_results_are_removed(self):
        config=Config(data=self.root/"data",stored_bytes=1);store=Store(config);token,directory=store.new()
        for name in FILES:(directory/name).write_bytes(b"large")
        with self.assertRaises(ValueError):store.publish(token,{})
        self.assertFalse(directory.exists())
        token,directory=store.new();(directory/"complete.json").write_text('{"expires":0}')
        store.cleanup();self.assertFalse(directory.exists())

class NativeLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_terminates_the_isolated_worker(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);worker=root/"worker";worker.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(60)\n");worker.chmod(0o700)
            config=Config(data=root/"data",binary=worker,assets=root,timeout=.1)
            started=time.monotonic()
            with self.assertRaises(TimeoutError):await run_native(config,root/"input",root,"natural",512)
            self.assertLess(time.monotonic()-started,5)

def rpc(client,method,params=None,headers=None):
    response=client.post("/mcp",headers={"Accept":"application/json, text/event-stream",**(headers or {})},json={"jsonrpc":"2.0","id":7,"method":method,"params":params or {}})
    if response.headers.get("content-type","").startswith("text/event-stream"):
        messages=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        result=next(item for item in messages if item.get("id")==7)
    else:result=response.json()
    if "error" in result:raise AssertionError(result)
    return result["result"]

class McpTests(unittest.TestCase):
    def test_wire_schema_and_widget_match_official_file_contract(self):
        with tempfile.TemporaryDirectory() as td:
            server=create_server(Config(data=Path(td)))
            with TestClient(server.streamable_http_app()) as client:
                rpc(client,"initialize",{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"qualification","version":"1"}})
                tool=rpc(client,"tools/list")["tools"][0]
                self.assertEqual(tool["_meta"]["openai/fileParams"],["file"])
                file=tool["inputSchema"]["$defs"]["OpenAIFile"]
                self.assertEqual(set(file["properties"]),{"download_url","file_id","mime_type","file_name"})
                self.assertEqual(set(file["required"]),{"download_url","file_id"})
                resource=rpc(client,"resources/read",{"uri":tool["_meta"]["ui"]["resourceUri"]})["contents"][0]
                self.assertIn("mcp-app",resource["mimeType"]);self.assertIn("ui/initialize",resource["text"])
                self.assertEqual(resource["_meta"]["openai/widgetCSP"]["resource_domains"],["http://127.0.0.1:8765"])

    @unittest.skipUnless(os.getenv("SPEKTRA_TEST_RAW_FILE"),"Set SPEKTRA_TEST_RAW_FILE to a real camera RAW")
    def test_real_raw_through_mcp_native_engine_and_full_downloads(self):
        fixture=Path(os.environ["SPEKTRA_TEST_RAW_FILE"])
        with tempfile.TemporaryDirectory() as td:
            config=Config(data=Path(td));server=create_server(config);sources=[]
            async def attached(_url,destination,*_args):
                sources.append(destination.parent)
                await asyncio.to_thread(shutil.copyfile,fixture,destination)
            with patch("spektrafilm_chat.server.download_file",attached),TestClient(server.streamable_http_app()) as client:
                result=rpc(client,"tools/call",{"name":"develop_raw","arguments":{"file":{"download_url":"https://files.oaiusercontent.com/attached","file_id":"fixture"},"max_edge":512}})
                self.assertFalse(result.get("isError"),result)
                details=result["structuredContent"]
                self.assertEqual(max(details["width"],details["height"]),512)
                self.assertEqual(details["scanner"],"noritsu-ls600")
                for name,item in details["files"].items():
                    downloaded=client.get(item["url"])
                    self.assertEqual(downloaded.status_code,200,name)
                    self.assertEqual(len(downloaded.content),item["bytes"])
                    self.assertEqual(hashlib.sha256(downloaded.content).hexdigest(),item["sha256"])
                self.assertTrue(all(not path.exists() for path in sources))
                bad=details["files"]["result.jpg"]["url"].replace("signature=","signature=bad")
                self.assertEqual(client.get(bad).status_code,404)
