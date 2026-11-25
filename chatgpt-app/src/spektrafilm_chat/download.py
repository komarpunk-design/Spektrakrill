"""GPLv3. Bounded downloads of explicitly attached ChatGPT files, never arbitrary URLs."""
import asyncio
import ipaddress
from pathlib import Path
import socket
from urllib.parse import urlsplit
import zipfile
import httpx

RAW_EXTENSIONS = {".raw", ".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".orf", ".rw2", ".pef", ".srw", ".iiq", ".3fr", ".fff", ".rwl", ".mos", ".mef", ".erf"}

def permitted_url(url: str, hosts: tuple[str, ...]) -> str:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.port not in (None, 443) or parsed.fragment:
        raise ValueError("Файл должен передаваться по защищённой ссылке ChatGPT")
    if not any(host == item or (item.startswith("*.") and host.endswith(item[1:]) and host != item[2:]) for item in hosts):
        raise ValueError("Домен файла не разрешён сервером; настройте SPEKTRA_UPLOAD_HOSTS для доверенного хранилища ChatGPT")
    return host

async def public_dns(host: str):
    records = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not records or any(not ipaddress.ip_address(record[4][0]).is_global for record in records):
        raise ValueError("Адрес хранилища не является публичным")

async def download_file(url: str, destination: Path, hosts: tuple[str, ...], limit: int,
        *, client: httpx.AsyncClient | None = None, resolve=public_dns):
    owned = client is None
    if owned:
        client = httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=False, trust_env=False)
    try:
        for _ in range(4):
            host = permitted_url(url, hosts)
            await resolve(host)
            async with client.stream("GET", url) as response:
                if response.is_redirect:
                    url = str(response.url.join(response.headers["location"]))
                    continue
                response.raise_for_status()
                declared = response.headers.get("content-length")
                if declared and (int(declared) < 0 or int(declared) > limit):
                    raise ValueError("RAW превышает допустимый размер файла")
                size = 0
                with destination.open("xb") as output:
                    async for chunk in response.aiter_bytes(chunk_size=64 << 10):
                        size += len(chunk)
                        if size > limit:
                            raise ValueError("RAW превышает допустимый размер файла")
                        output.write(chunk)
                if size == 0:
                    raise ValueError("Прикреплённый файл пуст")
                return
        raise ValueError("Слишком много перенаправлений хранилища")
    finally:
        if owned:
            await client.aclose()

def unwrap_raw(source: Path, limit: int) -> Path:
    # A single-file ZIP is supported when ChatGPT's attachment picker refuses a RAW suffix.
    # No paths from the archive are ever extracted onto disk.
    if not zipfile.is_zipfile(source):
        return source
    with zipfile.ZipFile(source) as archive:
        members = [x for x in archive.infolist() if not x.is_dir()]
        if len(members) != 1 or Path(members[0].filename).suffix.lower() not in RAW_EXTENSIONS:
            raise ValueError("ZIP должен содержать ровно один камерный RAW")
        member = members[0]
        if member.flag_bits & 1 or member.file_size > limit:
            raise ValueError("ZIP зашифрован или RAW превышает лимит")
        target = source.with_name("camera.raw")
        size = 0
        with archive.open(member) as src, target.open("xb") as dst:
            while chunk := src.read(64 << 10):
                size += len(chunk)
                if size > limit:
                    raise ValueError("Распакованный RAW превышает лимит")
                dst.write(chunk)
        return target
