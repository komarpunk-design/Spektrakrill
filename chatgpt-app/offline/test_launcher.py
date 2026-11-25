"""GPLv3. Standard-library tests for the no-install package launcher."""
import importlib.util
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
import zlib

spec = importlib.util.spec_from_file_location("offline_run", Path(__file__).with_name("run.py"))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

class LauncherTests(unittest.TestCase):
    def test_manifest_detects_modified_or_missing_payload(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);data=b"native-payload";(root/"payload").write_bytes(data)
            manifest={"schema":"spektrafilm.offline.v1","files":{"payload":{"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}}}
            (root/"manifest.json").write_text(json.dumps(manifest))
            self.assertEqual(launcher.verify_bundle(root),manifest)
            (root/"payload").write_bytes(b"tampered")
            with self.assertRaises(ValueError):launcher.verify_bundle(root)
    def test_manifest_cannot_access_paths_outside_the_package(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for path in ("../outside","/etc/passwd","..\\outside"):
                (root/"manifest.json").write_text(json.dumps({"schema":"spektrafilm.offline.v1","files":{path:{"bytes":1,"sha256":"x"}}}))
                with self.assertRaises(ValueError):launcher.verify_bundle(root)
    def test_zip_filename_is_never_used_as_an_extraction_path(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);path=root/"input.zip"
            with zipfile.ZipFile(path,"w") as z:z.writestr("../../camera.NEF",b"raw")
            result=launcher.input_raw(path,root)
            self.assertEqual(result,root/"camera.raw");self.assertEqual(result.read_bytes(),b"raw")
    def test_zip_requires_one_raw(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);path=root/"input.zip"
            with zipfile.ZipFile(path,"w") as z:z.writestr("one.nef",b"1");z.writestr("two.cr2",b"2")
            with self.assertRaises(ValueError):launcher.input_raw(path,root)
    def test_png_crc_and_dimensions_are_checked(self):
        def chunk(kind,data):return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
        png=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",2,1,16,2,0,0,0))+chunk(b"IDAT",zlib.compress(b"\0"+b"\0"*12))+chunk(b"IEND",b"")
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/"result.png";path.write_bytes(png);launcher.check_png(path,2,1)
            with self.assertRaises(ValueError):launcher.check_png(path,3,1)
            path.write_bytes(png[:-1]+b"x")
            with self.assertRaises(ValueError):launcher.check_png(path,2,1)
    def test_truncated_tiff_and_jpeg_are_refused(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/"bad"
            path.write_bytes(b"II*\0\x08\0\0\0")
            with self.assertRaises(ValueError):launcher.check_tiff(path,2,1)
            path.write_bytes(b"\xff\xd8\xff")
            with self.assertRaises(ValueError):launcher.check_jpeg(path,2,1)

if __name__ == "__main__":unittest.main()
