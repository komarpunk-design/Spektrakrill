#!/usr/bin/env python3
"""GPLv3. Build the self-contained upload ZIP from verified native binaries and existing assets."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent

def sha(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            value.update(block)
    return value.hexdigest()

def build(output, native, allow_dirty=False):
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True).strip())
    if dirty and not allow_dirty:
        raise ValueError("Commit the source before building a release package (or use --allow-dirty for a private test)")
    if not output.parent.exists():
        output.parent.mkdir(parents=True)
    if output.exists():
        raise ValueError("Existing archive is never overwritten")
    with tempfile.TemporaryDirectory(prefix="spektrafilm-package-") as temporary:
        package = Path(temporary) / "spektrafilm-offline"
        (package / "bin").mkdir(parents=True)
        for name in ("spektrafilm-develop", "spektrafilm-export"):
            target = package / "bin" / name
            shutil.copy2(native / name, target)
            subprocess.run(["strip", "--strip-unneeded", str(target)], check=True)
            program = subprocess.check_output(["readelf", "-lW", str(target)], text=True)
            dynamic = subprocess.check_output(["readelf", "-dW", str(target)], text=True)
            if "INTERP" in program or "NEEDED" in dynamic:
                raise ValueError("Native binary still needs external shared libraries")
            head = target.read_bytes()[:20]
            if head[:6] != b"\x7fELF\x02\x01" or head[18:20] != b"\x3e\x00":
                raise ValueError("This package must contain Linux x86-64 little-endian executables")
        assets = REPO / "native-android/engine/spektra-core/src/main/assets/spektra"
        shutil.copytree(assets, package / "assets")
        for name in ("run.py", "START-HERE-RU.md", "CHATGPT-PROMPT-RU.md"):
            shutil.copy2(ROOT / "offline" / name, package / name)
        shutil.copy2(REPO / "LICENSE", package / "LICENSE")
        shutil.copy2(REPO / "THIRD_PARTY_NOTICES.md", package / "THIRD_PARTY_NOTICES.md")
        licenses = package / "licenses"
        licenses.mkdir()
        for name, path in (("glibc-copyright.txt", "/usr/share/doc/libc6/copyright"),
                           ("libstdcxx-copyright.txt", "/usr/share/doc/libstdc++6/copyright"),
                           ("zlib-copyright.txt", "/usr/share/doc/zlib1g/copyright")):
            if not Path(path).is_file():
                raise ValueError("Missing static runtime notice: " + path)
            shutil.copy2(path, licenses / name)
        vendor = native / "_deps/sfraw_libraw_0_22_2-src"
        for name in ("LICENSE.LGPL", "LICENSE.CDDL", "COPYRIGHT"):
            if (vendor / name).is_file():
                shutil.copy2(vendor / name, licenses / ("LibRaw-" + name))
        jpeg = native / "raw/sfraw-libjpeg-turbo/src/sfraw_libjpeg_turbo_build"
        jpeg_notices = 0
        for name in ("LICENSE.md", "README.ijg", "LICENSE-BSD.txt", "LICENSE-zlib.txt"):
            if (jpeg / name).is_file():
                shutil.copy2(jpeg / name, licenses / ("libjpeg-turbo-" + name))
                jpeg_notices += 1
        if not jpeg_notices:
            raise ValueError("Missing libjpeg-turbo license notices")
        files = {}
        for path in sorted(package.rglob("*")):
            if path.is_symlink():
                raise ValueError("Package may not contain symlinks")
            if path.is_file():
                if path.stat().st_size < 256 and path.read_bytes().startswith(b"version https://git-lfs.github.com/spec/"):
                    raise ValueError("Missing Git LFS payload: " + str(path))
                files[path.relative_to(package).as_posix()] = {"bytes": path.stat().st_size, "sha256": sha(path)}
        manifest = {"schema": "spektrafilm.offline.v1", "version": "0.1.0", "source_commit": commit,
            "source_url": "https://github.com/komarpunk-design/Spektrakrill/tree/" + commit,
            "runtime": "Linux x86-64; statically linked native executables; Python 3.9+ standard library",
            "default_max_edge": 1536, "source_tree_dirty": dirty, "actual_chatgpt_session_tested": False, "files": files}
        (package / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(package.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(package.parent).as_posix())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Package ZIP CRC failed")
    return {"archive": str(output), "bytes": output.stat().st_size, "sha256": sha(output), "source_commit": commit}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--native", type=Path, default=ROOT / "build-offline")
    parser.add_argument("--allow-dirty", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build(args.output.resolve(), args.native.resolve(), args.allow_dirty), indent=2))
