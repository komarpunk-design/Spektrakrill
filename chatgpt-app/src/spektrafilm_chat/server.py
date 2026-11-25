"""GPLv3. ChatGPT MCP App with real attachment input, bounded native processing and exports."""
import asyncio
import base64
from contextlib import asynccontextmanager, suppress
import json
import os
from pathlib import Path
from typing import Annotated
import shutil
import tempfile
import zipfile
from urllib.parse import urlsplit
import httpx
from mcp import types
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.auth.settings import AuthSettings
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, TypeAdapter, UrlConstraints
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from .config import Config
from .download import download_file, unwrap_raw
from .processor import export_images, run_native
from .storage import FILES, Store
from .auth import JwtVerifier, SCOPE

WIDGET = "ui://widget/spektrafilm-v1.html"

class OpenAIFile(BaseModel):
    # ChatGPT requires all four properties in the schema, but only these two in required.
    model_config = ConfigDict(extra="forbid")
    download_url: str = Field(min_length=1, max_length=16384)
    file_id: str = Field(min_length=1, max_length=512)
    mime_type: str = Field(default="", max_length=256)
    file_name: str = Field(default="", max_length=512)

def create_server(config: Config | None = None):
    config = config or Config.from_env()
    verifier = JwtVerifier(config) if config.oauth_issuer else None
    if not verifier and urlsplit(config.public_url).hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("A public deployment requires SPEKTRA_OAUTH_ISSUER and SPEKTRA_OAUTH_JWKS_URL")
    # Issuer identifiers are exact strings. Do not silently add '/' to an origin-only issuer.
    issuer = TypeAdapter(Annotated[AnyHttpUrl, UrlConstraints(preserve_empty_path=True)]).validate_python(config.oauth_issuer) if verifier else None
    auth_settings = AuthSettings(issuer_url=issuer, resource_server_url=config.resource_url,
        required_scopes=[SCOPE]) if verifier else None
    store = Store(config)
    slot = asyncio.Semaphore(1)
    pending = 0

    @asynccontextmanager
    async def lifespan(_):
        async def prune():
            while True:
                await asyncio.to_thread(store.cleanup)
                await asyncio.sleep(60)
        task = asyncio.create_task(prune())
        try:
            yield {}
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    hostname = urlsplit(config.public_url).netloc
    server = FastMCP("Spektrafilm", instructions="Обрабатывает камерный RAW настоящим движком Spektrafilm. По умолчанию natural: Portra 400, Arctic, RMS, Layered Transport и Noritsu без бумаги. Не выдумывайте адрес или идентификатор файла: используйте прикреплённый пользователем файл.",
        stateless_http=True, json_response=False, log_level="WARNING", lifespan=lifespan,
        token_verifier=verifier, auth=auth_settings,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True,
            allowed_hosts=[hostname, "127.0.0.1:*", "localhost:*", "testserver"],
            allowed_origins=[config.public_url, "https://chatgpt.com", "https://chat.openai.com"]))

    @server.resource(WIDGET, mime_type="text/html;profile=mcp-app", title="Готовое плёночное фото",
        meta={"openai/widgetDescription": "Результат проявки RAW: крупное фото, материалы и ссылки JPEG/16-bit TIFF.",
            "openai/widgetPrefersBorder": True,
            "ui": {"csp": {"connectDomains": [], "resourceDomains": [config.public_url]}},
            "openai/widgetCSP": {"connect_domains": [], "resource_domains": [config.public_url]}})
    def widget() -> str:
        return Path(__file__).with_name("widget.html").read_text()

    @server.tool(name="develop_raw", title="Проявить RAW плёночным движком",
        description="Use when the user attaches a real camera RAW and wants an automatically developed, beautiful film photo. Natural is Portra 400 + Arctic + Noritsu, warm is Kodak Gold, bw is Ilford HP5. Input must be an attached file, never an invented URL/file ID. A ZIP containing one RAW is accepted. max_edge=3072 gives a bounded-size photo; 0 requests full resolution and can take longer. Returns a preview, download links and exact output dimensions. Never claim this synthesizes or replaces the photo with AI.",
        annotations=types.ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False, idempotentHint=False),
        meta={"openai/fileParams": ["file"], "securitySchemes": [{"type": "oauth2", "scopes": [SCOPE]}] if verifier else [{"type": "noauth"}],
            "ui": {"resourceUri": WIDGET}, "openai/outputTemplate": WIDGET,
            "openai/toolInvocation/invoking": "Проявляю RAW и сканирую плёнку…",
            "openai/toolInvocation/invoked": "Фото готово"}, structured_output=False)
    async def develop_raw(file: OpenAIFile, ctx: Context,
            look: str = Field(default="natural", pattern="^(natural|warm|bw)$"),
            max_edge: int = Field(default=3072, ge=0, le=6000)) -> types.CallToolResult:
        nonlocal pending
        if pending >= 3:
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text="Сервер занят. Повторите запрос после завершения текущих фотографий.")])
        pending += 1
        token = None
        published = False
        try:
            if max_edge != 0 and max_edge < 512:
                raise ValueError("Размер должен быть 0 для полного разрешения или от 512 до 6000 пикселей")
            await ctx.report_progress(0, 100, "Ожидаю очередь обработки")
            async with slot:
                await asyncio.to_thread(store.cleanup)
                with tempfile.TemporaryDirectory(prefix="spektrafilm-raw-") as temporary:
                    work = Path(temporary)
                    await ctx.report_progress(5, 100, "Получаю прикреплённый RAW")
                    async with asyncio.timeout(60):
                        await download_file(file.download_url, work / "attachment", config.upload_hosts, config.input_bytes)
                    source = await asyncio.to_thread(unwrap_raw, work / "attachment", config.input_bytes)
                    task = asyncio.create_task(run_native(config, source, work, look, max_edge))
                    try:
                        progress = 15
                        while not task.done():
                            await asyncio.wait({task}, timeout=5)
                            if not task.done():
                                progress = min(progress + 2, 85)
                                await ctx.report_progress(progress, 100, "Декодирую RAW, моделирую плёнку и сканирование")
                        await task
                    finally:
                        if not task.done():
                            task.cancel()
                            with suppress(asyncio.CancelledError):
                                await task
                    await ctx.report_progress(90, 100, "Сохраняю и проверяю JPEG, PNG и TIFF")
                    token, directory = store.new()
                    details = await asyncio.to_thread(export_images, work, directory)
                    manifest = await asyncio.to_thread(store.publish, token, details)
                    published = True
                # The original RAW and unquantized working pixels are deleted before returning.
                await ctx.report_progress(100, 100, "Готово")
                preview = (directory / "preview.jpg").read_bytes()
                public = {"width": details["width"], "height": details["height"], "film": details["film"],
                    "scanner": details["scanner"], "max_edge": max_edge, "expires": manifest["expires"], "files": manifest["files"]}
                return types.CallToolResult(structuredContent=public, content=[
                    types.TextContent(type="text", text=f"Готово: {details['width']}×{details['height']}, {details['film']}, {details['scanner']}. JPEG: {manifest['files']['result.jpg']['url']}\n16-битный TIFF: {manifest['files']['result.tiff']['url']}\nСсылки действуют до истечения срока хранения (не более 24 часов)."),
                    types.ImageContent(type="image", mimeType="image/jpeg", data=base64.b64encode(preview).decode())])
        except (httpx.HTTPError, TimeoutError):
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text="Не удалось получить RAW или обработка превысила лимит времени. Прикрепите файл повторно; для большого RAW выберите размер 3072.")])
        except zipfile.BadZipFile:
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text="ZIP повреждён. Прикрепите RAW повторно или создайте новый архив с одним снимком.")])
        except (ValueError, RuntimeError, OSError) as error:
            return types.CallToolResult(isError=True, content=[types.TextContent(type="text", text=str(error)[:2400])])
        finally:
            pending -= 1
            if token and not published:
                shutil.rmtree(store.root / token, ignore_errors=True)

    @server.custom_route("/health", methods=["GET"])
    async def health(_: Request):
        ready = config.binary.is_file() and config.assets.is_dir()
        return JSONResponse({"service": "spektrafilm", "ready": ready}, status_code=200 if ready else 503)

    @server.custom_route("/results/{token}/{name}", methods=["GET", "HEAD"])
    async def download(request: Request):
        try:
            expires = int(request.query_params.get("expires", "0"))
        except ValueError:
            return Response(status_code=404)
        name = request.path_params["name"]
        path = store.resolve(request.path_params["token"], name, expires, request.query_params.get("signature", ""))
        if path is None:
            return Response(status_code=404)
        return FileResponse(path, media_type=FILES[name], filename="Spektrafilm-" + name,
            content_disposition_type="inline" if name == "preview.jpg" else "attachment",
            headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"})
    return server

def main():
    import uvicorn
    config = Config.from_env()
    bind = os.getenv("SPEKTRA_BIND", "127.0.0.1")
    config.validate_listener(bind)
    server = create_server(config)
    uvicorn.run(server.streamable_http_app(), host=bind,
        port=int(os.getenv("PORT", "8765")), access_log=False, log_level="warning")

if __name__ == "__main__":
    main()
