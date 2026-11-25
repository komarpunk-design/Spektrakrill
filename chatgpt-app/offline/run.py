#!/usr/bin/env python3
"""GPLv3. Offline launcher: Python standard library only; actual native film processing."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zipfile
import zlib

BASE = Path(__file__).resolve().parent
RAW_SUFFIXES = {".raw", ".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".raf", ".orf", ".rw2", ".pef", ".srw", ".iiq", ".3fr", ".fff", ".rwl", ".mos", ".mef", ".erf"}
MAX_INPUT = 256 << 20

def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            value.update(block)
    return value.hexdigest()

def verify_bundle(base=BASE):
    path = base / "manifest.json"
    if path.stat().st_size > 1 << 20:
        raise ValueError("Invalid package manifest size")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "spektrafilm.offline.v1":
        raise ValueError("Unsupported package manifest")
    for name, expected in manifest["files"].items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name:
            raise ValueError("Invalid package path")
        file = base / name
        if not file.resolve().is_relative_to(base.resolve()) or file.is_symlink() or not file.is_file():
            raise ValueError("Missing or unsafe package file: " + name)
        if file.stat().st_size != expected["bytes"] or digest(file) != expected["sha256"]:
            raise ValueError("Package checksum mismatch: " + name)
    return manifest

def input_raw(source, work):
    if source.stat().st_size > MAX_INPUT:
        raise ValueError("RAW/archive exceeds 256 MiB")
    if not zipfile.is_zipfile(source):
        return source
    with zipfile.ZipFile(source) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        if len(members) != 1 or Path(members[0].filename).suffix.lower() not in RAW_SUFFIXES:
            raise ValueError("The photo ZIP must contain exactly one camera RAW")
        item = members[0]
        if item.flag_bits & 1 or item.file_size > MAX_INPUT:
            raise ValueError("Encrypted or oversized RAW archive")
        target = work / "camera.raw"
        written = 0
        with archive.open(item) as incoming, target.open("xb") as outgoing:
            while True:
                block = incoming.read(65536)
                if not block:
                    break
                written += len(block)
                if written > MAX_INPUT:
                    raise ValueError("Extracted RAW exceeds 256 MiB")
                outgoing.write(block)
        return target

def check_png(path, width, height):
    with path.open("rb") as file:
        if file.read(8) != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Invalid PNG signature")
        first = True
        idat = False
        while True:
            head = file.read(8)
            if len(head) != 8:
                raise ValueError("Truncated PNG")
            size, kind = struct.unpack(">I4s", head)
            if size > 512 << 20:
                raise ValueError("Invalid PNG chunk size")
            crc = zlib.crc32(kind)
            remaining = size
            header = b""
            while remaining:
                block = file.read(min(65536, remaining))
                if not block:
                    raise ValueError("Truncated PNG chunk")
                crc = zlib.crc32(block, crc)
                if kind == b"IHDR":
                    header += block
                remaining -= len(block)
            stored_crc = file.read(4)
            if len(stored_crc) != 4 or struct.unpack(">I", stored_crc)[0] != crc & 0xffffffff:
                raise ValueError("PNG checksum mismatch")
            if first:
                if kind != b"IHDR" or len(header) != 13 or struct.unpack(">IIBB", header[:10]) != (width, height, 16, 2):
                    raise ValueError("PNG is not the expected 16-bit RGB image")
                first = False
            if kind == b"IDAT":
                idat = True
            if kind == b"IEND":
                if size != 0 or not idat or file.read(1):
                    raise ValueError("Invalid PNG end")
                return

def check_tiff(path, width, height):
    with path.open("rb") as file:
        header = file.read(8)
        if len(header) != 8 or header[:4] != b"II*\x00":
            raise ValueError("Invalid TIFF header")
        length = path.stat().st_size
        file.seek(struct.unpack("<I", header[4:])[0])
        count_data = file.read(2)
        if len(count_data) != 2:
            raise ValueError("Truncated TIFF directory")
        count = struct.unpack("<H", count_data)[0]
        if count > 128:
            raise ValueError("Invalid TIFF directory")
        tags = {}
        for _ in range(count):
            entry = file.read(12)
            if len(entry) != 12:
                raise ValueError("Truncated TIFF entry")
            tag, kind, number, value = struct.unpack("<HHII", entry)
            tags[tag] = (kind, number, value)
        if tags.get(256) != (4, 1, width) or tags.get(257) != (4, 1, height):
            raise ValueError("Unexpected TIFF dimensions")
        if tags.get(258, ())[:2] != (3, 3) or tags.get(259, (0, 0, 0))[2] != 1:
            raise ValueError("Unexpected TIFF sample format")
        file.seek(tags[258][2])
        if file.read(6) != struct.pack("<3H", 16, 16, 16):
            raise ValueError("TIFF does not contain three 16-bit channels")
        if tags.get(277, (0, 0, 0))[2] != 3 or tags.get(262, (0, 0, 0))[2] != 2:
            raise ValueError("TIFF is not RGB")
        strip = tags.get(273, (0, 0, 0))[2]
        size = tags.get(279, (0, 0, 0))[2]
        if size != width * height * 6 or strip + size > length:
            raise ValueError("TIFF pixels are incomplete")
        profile = tags.get(34675)
        if not profile or profile[1] < 128 or profile[2] + profile[1] > length:
            raise ValueError("Missing TIFF ICC profile")

def check_jpeg(path, width, height):
    with path.open("rb") as file:
        if file.read(2) != b"\xff\xd8":
            raise ValueError("Invalid JPEG header")
        dimensions = None
        while True:
            marker = file.read(2)
            if len(marker) != 2 or marker[0] != 255:
                raise ValueError("Invalid JPEG marker")
            if marker[1] == 0xda:
                break
            count = file.read(2)
            if len(count) != 2:
                raise ValueError("Truncated JPEG")
            size = struct.unpack(">H", count)[0]
            if size < 2:
                raise ValueError("Invalid JPEG segment")
            data = file.read(size - 2)
            if len(data) != size - 2:
                raise ValueError("Truncated JPEG segment")
            if marker[1] in (0xc0, 0xc1, 0xc2):
                dimensions = struct.unpack(">BHHB", data[:6])
        file.seek(-2, 2)
        if file.read(2) != b"\xff\xd9" or dimensions != (8, height, width, 3):
            raise ValueError("JPEG is incomplete or has wrong dimensions")

def run_command(arguments, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Processing time limit reached")
    completed = subprocess.run(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        timeout=remaining, env={**os.environ, "SPK_NUM_THREADS": "2", "OMP_NUM_THREADS": "2"})
    if completed.returncode:
        if completed.returncode < 0:
            raise RuntimeError("The environment stopped the worker (possibly memory or execution restrictions). No replacement JPEG was used.")
        raise RuntimeError(completed.stderr.decode("utf-8", errors="replace")[-2000:])

def develop(source, output, look="natural", edge=1536, timeout=90):
    manifest = verify_bundle()
    if platform.system() != "Linux" or platform.machine().lower() not in ("x86_64", "amd64"):
        raise RuntimeError("This experimental package requires a Linux x86-64 execution environment")
    if not source.is_file():
        raise ValueError("RAW file does not exist")
    if edge != 0 and not 512 <= edge <= 6000:
        raise ValueError("Size must be 0 (full resolution) or 512..6000")
    if look not in ("natural", "warm", "bw") or not 5 <= timeout <= 240:
        raise ValueError("Invalid style or time limit")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Output must be a new or empty directory; existing work is never overwritten")
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    deadline = time.monotonic() + timeout
    written = []
    try:
        with tempfile.TemporaryDirectory(prefix="spektrafilm-work-") as temporary:
            work = Path(temporary)
            raw = input_raw(source, work)
            for name in ("spektrafilm-develop", "spektrafilm-export"):
                executable = BASE / "bin" / name
                executable.chmod(executable.stat().st_mode | 0o100)
            run_command([str(BASE / "bin/spektrafilm-develop"), str(raw), str(BASE / "assets"), str(work), look, str(edge)], deadline)
            run_command([str(BASE / "bin/spektrafilm-export"), str(work), str(BASE / "assets")], deadline)
            details = json.loads((work / "render.json").read_text())
            width, height = details["width"], details["height"]
            check_png(work / "result.png", width, height)
            check_tiff(work / "result.tiff", width, height)
            check_jpeg(work / "result.jpg", width, height)
            files = []
            for name in ("result.jpg", "result.png", "result.tiff", "render.json"):
                target = output / name
                with target.open("xb") as dst, (work / name).open("rb") as src:
                    written.append(target)
                    shutil.copyfileobj(src, dst, 1 << 20)
                if digest(target) != digest(work / name):
                    raise RuntimeError("Output copy checksum mismatch")
                files.append({"path": str(target.resolve()), "bytes": target.stat().st_size, "sha256": digest(target)})
            receipt = {"status": "complete", "width": width, "height": height, "look": look,
                "film": details["film"], "scanner": details["scanner"], "max_edge": edge,
                "package_source": manifest["source_commit"], "png_bits": 16, "tiff_bits": 16,
                "files": files, "processing": "native RAW, full demosaic; no network, no generated image"}
            receipt_path = output / "receipt.json"
            with receipt_path.open("x", encoding="utf-8") as dst:
                written.append(receipt_path)
                json.dump(receipt, dst, ensure_ascii=False, indent=2)
            return receipt
    except BaseException:
        for path in written:
            path.unlink(missing_ok=True)
        raise

def main():
    parser = argparse.ArgumentParser(description="Spektrafilm offline — real RAW film processing without a server")
    parser.add_argument("input", type=Path, nargs="?")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--look", choices=("natural", "warm", "bw"), default="natural")
    parser.add_argument("--size", type=int, default=1536)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    try:
        if args.verify_only:
            manifest = verify_bundle()
            print(json.dumps({"status": "verified", "files": len(manifest["files"]), "source_commit": manifest["source_commit"]}))
            return 0
        if args.input is None:
            parser.error("a camera RAW or a ZIP with one RAW is required")
        source = args.input.resolve()
        output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="spektrafilm-result-", dir=str(source.parent)))
        print(json.dumps(develop(source, output, args.look, args.size, args.timeout), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, TimeoutError, subprocess.TimeoutExpired, zipfile.BadZipFile) as error:
        print(json.dumps({"status": "error", "message": str(error), "note": "If this ChatGPT environment blocks native executables or lacks resources, this offline method is unavailable there. No synthetic substitute was created."}, ensure_ascii=False), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
