"""GPLv3. Server-side configuration; tool arguments cannot override paths or hosts."""
from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent

@dataclass(frozen=True)
class Config:
    data: Path = ROOT / "data"
    binary: Path = ROOT / "build/spektrafilm-develop"
    assets: Path = REPO / "native-android/engine/spektra-core/src/main/assets/spektra"
    public_url: str = "http://127.0.0.1:8765"
    upload_hosts: tuple[str, ...] = ("files.oaiusercontent.com", "files.openai.com", "*.oaiusercontent.com")
    input_bytes: int = 256 << 20
    stored_bytes: int = 2 << 30
    ttl: int = 86400
    timeout: float = 240.0
    oauth_issuer: str | None = None
    oauth_jwks_url: str | None = None
    allowed_subjects: tuple[str, ...] = ()
    local_test: bool = False

    def __post_init__(self):
        url = urlsplit(self.public_url)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
            raise ValueError("SPEKTRA_PUBLIC_URL must be an origin, without credentials or a path")
        if url.scheme != "https" and url.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("A public server requires HTTPS")
        if not (1 <= self.ttl <= 86400) or self.stored_bytes < 1 or self.input_bytes < 1:
            raise ValueError("Invalid retention or storage limits")
        if bool(self.oauth_issuer) != bool(self.oauth_jwks_url):
            raise ValueError("OAuth issuer and JWKS URL must be configured together")
        for value in (self.oauth_issuer, self.oauth_jwks_url):
            if value:
                endpoint = urlsplit(value)
                if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
                    raise ValueError("OAuth endpoints require HTTPS without credentials, query or fragment")

    @property
    def resource_url(self) -> str:
        return self.public_url.rstrip("/") + "/mcp"

    def validate_listener(self, bind: str):
        if not self.oauth_issuer and bind not in ("127.0.0.1", "localhost", "::1") and not self.local_test:
            raise ValueError("Listening outside loopback requires OAuth; for an isolated local container use SPEKTRA_LOCAL_TEST=1 and publish only on 127.0.0.1")

    @classmethod
    def from_env(cls):
        default = cls()
        return cls(data=Path(os.getenv("SPEKTRA_DATA", str(default.data))),
            binary=Path(os.getenv("SPEKTRA_BINARY", str(default.binary))),
            assets=Path(os.getenv("SPEKTRA_ASSETS", str(default.assets))),
            public_url=os.getenv("SPEKTRA_PUBLIC_URL", default.public_url).rstrip("/"),
            upload_hosts=tuple(x.strip().lower() for x in os.getenv("SPEKTRA_UPLOAD_HOSTS", ",".join(default.upload_hosts)).split(",") if x.strip()),
            oauth_issuer=os.getenv("SPEKTRA_OAUTH_ISSUER") or None,
            oauth_jwks_url=os.getenv("SPEKTRA_OAUTH_JWKS_URL") or None,
            allowed_subjects=tuple(x.strip() for x in os.getenv("SPEKTRA_ALLOWED_SUBJECTS", "").split(",") if x.strip()),
            local_test=os.getenv("SPEKTRA_LOCAL_TEST") == "1")
