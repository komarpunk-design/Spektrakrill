import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { rgb16ToPlanar, resizePlanar, simulate, linearToImageData } from "../src/lib/film/pipeline.ts";
import { defaultParams } from "../src/lib/film/defaults.ts";

class ImageDataPolyfill {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.colorSpace = "srgb";
  }
}
globalThis.ImageData = ImageDataPolyfill;

function pngRgb(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (width * 3 + 1);
    raw[o] = 0;
    rgb.copy(raw, o + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (tag, data) => {
    const t = Buffer.from(tag);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function imageDataToPng(img) {
  const { width, height, data } = img;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    rgb[i * 3] = data[p];
    rgb[i * 3 + 1] = data[p + 1];
    rgb[i * 3 + 2] = data[p + 2];
  }
  return pngRgb(width, height, rgb);
}

function stats(img) {
  let s = 0;
  let mx = 0;
  let mn = Infinity;
  const n = img.r.length;
  for (let i = 0; i < n; i++) {
    const y = 0.2126 * img.r[i] + 0.7152 * img.g[i] + 0.0722 * img.b[i];
    s += y;
    if (y > mx) mx = y;
    if (y < mn) mn = y;
  }
  return { mean: s / n, min: mn, max: mx, w: img.w, h: img.h };
}

const rgbPath = process.argv[2];
const width = Number(process.argv[3]);
const height = Number(process.argv[4]);
const outDir = process.argv[5] || "/workspace/screenshots";
const filmId = process.argv[6] || "kodak_portra_400";
const paperId = process.argv[7] || "kodak_portra_endura";

const buf = readFileSync(rgbPath);
const rgb = new Uint16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
if (rgb.length < width * height * 3) {
  throw new Error(`rgb16 too small: ${rgb.length} < ${width * height * 3}`);
}

const film = JSON.parse(readFileSync(`/workspace/public/profiles/${filmId}.json`));
const paper = JSON.parse(readFileSync(`/workspace/public/profiles/${paperId}.json`));

let planar = rgb16ToPlanar(rgb, width, height);
planar = resizePlanar(planar, 720);
const before = linearToImageData(planar, true);
const lin = stats(planar);

const params = defaultParams();
params.applyCctfDecoding = false;
params.whiteBalance = "as_shot";
params.previewMaxSize = 720;
const t0 = performance.now();
const out = simulate(planar, film, paper, params);
const ms = Math.round(performance.now() - t0);
const filmStats = stats(out);
const after = linearToImageData(out, true);

writeFileSync(`${outDir}/e2e-raw-linear.png`, imageDataToPng(before));
writeFileSync(`${outDir}/e2e-raw-film.png`, imageDataToPng(after));

const report = {
  input: rgbPath,
  width,
  height,
  preview: { w: planar.w, h: planar.h },
  linear: lin,
  film: filmStats,
  ms,
  filmId,
  paperId,
  ok: filmStats.mean > 0.02 && filmStats.mean < 0.95 && filmStats.max > 0.1,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(2);
