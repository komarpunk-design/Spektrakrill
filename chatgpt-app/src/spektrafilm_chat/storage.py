"""GPLv3. Expiring output links; originals live only in the worker's temporary directory."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import threading
import time
from .config import Config

FILES = {"result.jpg": "image/jpeg", "result.png": "image/png", "result.tiff": "image/tiff", "preview.jpg": "image/jpeg", "recipe.json": "application/json"}

class Store:
    def __init__(self, config: Config):
        self.config = config
        self.lock = threading.RLock()
        config.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root = config.data / "results"
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        secret = config.data / "signing.key"
        try:
            with secret.open("xb") as out:
                os.chmod(secret, 0o600)
                out.write(secrets.token_bytes(32))
        except FileExistsError:
            pass
        self.key = secret.read_bytes()
        if len(self.key) != 32:
            raise RuntimeError("Invalid result signing key")

    def new(self) -> tuple[str, Path]:
        token = secrets.token_hex(16)
        directory = self.root / token
        directory.mkdir(mode=0o700)
        return token, directory

    def signature(self, token: str, name: str, expires: int) -> str:
        return hmac.new(self.key, f"{token}/{name}/{expires}".encode(), hashlib.sha256).hexdigest()

    def link(self, token: str, name: str, expires: int) -> str:
        return f"{self.config.public_url}/results/{token}/{name}?expires={expires}&signature={self.signature(token, name, expires)}"

    def resolve(self, token: str, name: str, expires: int, signature: str) -> Path | None:
        if not re.fullmatch("[a-f0-9]{32}", token) or name not in FILES or expires < time.time():
            return None
        if not hmac.compare_digest(signature, self.signature(token, name, expires)):
            return None
        directory = self.root / token
        if not (directory / "complete.json").is_file():
            return None
        path = directory / name
        return path if path.is_file() and not path.is_symlink() else None

    def cleanup(self):
        with self.lock:
            self._cleanup()

    def _cleanup(self):
        entries = []
        for directory in self.root.iterdir():
            manifest = directory / "complete.json"
            if not directory.is_dir():
                continue
            if not manifest.is_file():
                if directory.stat().st_mtime < time.time() - max(900, self.config.timeout * 2):
                    shutil.rmtree(directory)
                continue
            try:
                expires = json.loads(manifest.read_text())["expires"]
                if expires <= time.time():
                    shutil.rmtree(directory)
                else:
                    entries.append((expires, directory, sum(p.stat().st_size for p in directory.iterdir() if p.is_file())))
            except (OSError, ValueError, KeyError, TypeError):
                continue
        total = sum(x[2] for x in entries)
        for _, directory, size in sorted(entries):
            if total <= self.config.stored_bytes:
                break
            shutil.rmtree(directory)
            total -= size

    def publish(self, token: str, details: dict) -> dict:
        with self.lock:
            return self._publish(token, details)

    def _publish(self, token: str, details: dict) -> dict:
        directory = self.root / token
        expires = int(time.time()) + self.config.ttl
        files = {}
        for name in FILES:
            path = directory / name
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            files[name] = {"url": self.link(token, name, expires), "bytes": path.stat().st_size, "sha256": digest, "mime_type": FILES[name]}
        manifest = {**details, "expires": expires, "files": files}
        temporary = directory / "complete.tmp"
        temporary.write_text(json.dumps(manifest, ensure_ascii=False))
        temporary.replace(directory / "complete.json")
        self.cleanup()
        if not (directory / "complete.json").is_file():
            raise ValueError("Результат превышает доступное хранилище сервера")
        return manifest
