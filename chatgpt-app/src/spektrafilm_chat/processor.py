"""GPLv3. Isolated native worker plus standards-based image export; no generated replacement."""
import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
import numpy as np
from PIL import Image, ImageCms
import tifffile
from .config import Config

async def run_native(config: Config, source: Path, output: Path, look: str, max_edge: int):
    if look not in ("natural", "warm", "bw") or (max_edge != 0 and not 512 <= max_edge <= 6000):
        raise ValueError("Некорректный стиль или размер")
    if not config.binary.is_file() or not config.assets.is_dir():
        raise RuntimeError("Серверный движок ещё не собран или отсутствуют материалы плёнок")
    process = await asyncio.create_subprocess_exec(str(config.binary), str(source), str(config.assets),
        str(output), look, str(max_edge), stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "SPK_NUM_THREADS": "4", "OMP_NUM_THREADS": "4"})
    try:
        _, error = await asyncio.wait_for(process.communicate(), config.timeout)
        if process.returncode:
            message = error.decode(errors="replace")[-2000:]
            raise ValueError("Не удалось проявить RAW: " + message)
    except BaseException:
        if process.returncode is None:
            with suppress(ProcessLookupError):
                process.kill()
            await process.communicate()
        raise

def export_images(work: Path, result: Path) -> dict:
    details = json.loads((work / "render.json").read_text())
    width, height = details["width"], details["height"]
    if details["format"] != "f32le-srgb" or not (0 < width <= 32768 and 0 < height <= 32768 and width * height <= 32 * 1024 * 1024):
        raise ValueError("Некорректные размеры результата движка")
    path = work / "result.f32"
    if path.stat().st_size != width * height * 3 * 4:
        raise ValueError("Пиксельный файл не записан целиком")
    pixels = np.fromfile(path, dtype="<f4").reshape(height, width, 3)
    if not np.isfinite(pixels).all():
        raise ValueError("Движок вернул некорректные пиксели")
    np.clip(pixels, 0, 1, out=pixels)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    rgb8 = np.rint(pixels * 255).astype(np.uint8)
    image = Image.fromarray(rgb8)
    image.save(result / "result.jpg", quality=95, subsampling=0, icc_profile=icc)
    image.save(result / "result.png", icc_profile=icc)
    preview = image.copy()
    preview.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    preview.save(result / "preview.jpg", quality=90, icc_profile=icc)
    rgb16 = np.rint(pixels * 65535).astype(np.uint16)
    tifffile.imwrite(result / "result.tiff", rgb16, photometric="rgb", compression="deflate",
        metadata=None, extratags=[(34675, "B", len(icc), icc, False)])
    (result / "recipe.json").write_text(json.dumps(details, ensure_ascii=False, indent=2) + "\n")
    # Decode every completed export before exposing any URL.
    for name in ("result.jpg", "result.png", "preview.jpg"):
        with Image.open(result / name) as check:
            check.load()
            if name != "preview.jpg" and check.size != (width, height):
                raise ValueError("Экспорт имеет неверный размер")
    check = tifffile.imread(result / "result.tiff")
    if check.dtype != np.uint16 or not np.array_equal(check, rgb16):
        raise ValueError("Проверка 16-битного TIFF не пройдена")
    return details
