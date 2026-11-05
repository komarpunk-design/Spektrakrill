import { readFileSync } from "node:fs";
import { simulate, cameraBandPassScales } from "../src/lib/film/pipeline.ts";
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

function solid(w, h, r, g, b) {
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  R.fill(r);
  G.fill(g);
  B.fill(b);
  return { w, h, r: R, g: G, b: B };
}

function splitRG(w, h) {
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w / 2) {
        R[i] = 0.62;
        G[i] = 0.12;
        B[i] = 0.08;
      } else {
        R[i] = 0.08;
        G[i] = 0.16;
        B[i] = 0.58;
      }
    }
  }
  return { w, h, r: R, g: G, b: B };
}

function meanRgb(img) {
  const n = img.r.length;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    r += img.r[i];
    g += img.g[i];
    b += img.b[i];
  }
  return { r: r / n, g: g / n, b: b / n };
}

function lumaStd(img) {
  const n = img.r.length;
  const y = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    y[i] = 0.2126 * img.r[i] + 0.7152 * img.g[i] + 0.0722 * img.b[i];
    s += y[i];
  }
  const mu = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const d = y[i] - mu;
    v += d * d;
  }
  return { mean: mu, rms: Math.sqrt(v / n) };
}

function halfMean(img, left) {
  const { w, h } = img;
  const x0 = left ? 0 : (w / 2) | 0;
  const x1 = left ? (w / 2) | 0 : w;
  let r = 0;
  let g = 0;
  let b = 0;
  let c = 0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      r += img.r[i];
      g += img.g[i];
      b += img.b[i];
      c++;
    }
  }
  return { r: r / c, g: g / c, b: b / c };
}

const ektachrome = JSON.parse(readFileSync("/workspace/public/profiles/kodak_ektachrome_100.json"));
const velvia = JSON.parse(readFileSync("/workspace/public/profiles/fujifilm_velvia_100.json"));
const portra = JSON.parse(readFileSync("/workspace/public/profiles/kodak_portra_400.json"));
const endura = JSON.parse(readFileSync("/workspace/public/profiles/kodak_portra_endura.json"));

const p0 = defaultParams();
p0.autoExposure = true;
p0.applyCctfDecoding = false;
p0.whiteBalance = "as_shot";
p0.halationActive = false;
p0.couplersActive = false;
p0.glareActive = false;
p0.cameraLensBlurUm = 0;
p0.scanUnsharpAmount = 0;

const bp = cameraBandPassScales(1, 1);
console.log("bandPass UV+IR=1", bp.map((x) => +x.toFixed(3)));
if (bp[0] >= bp[1] || bp[0] >= bp[2]) {
  throw new Error("UV/IR should cut the red-sensitive layer relative to G/B");
}

function grainCase(film, label, crop) {
  const params = { ...p0, scanFilm: true, grainActive: false, crop };
  if (crop) {
    params.cropSizeX = 0.35;
    params.cropSizeY = 0.35;
  }
  const src = solid(256, 256, 0.184, 0.184, 0.184);
  const off = simulate(src, film, endura, params);
  params.grainActive = true;
  const on = simulate(src, film, endura, params);
  const a = lumaStd(off);
  const b = lumaStd(on);
  const ratio = b.rms / Math.max(a.rms, 1e-8);
  console.log(
    `grain ${label}${crop ? " crop" : ""}  offRMS=${a.rms.toExponential(2)} onRMS=${b.rms.toExponential(2)} ratio=${ratio.toFixed(1)} mean=${b.mean.toFixed(3)}`,
  );
  return { ratio, onRms: b.rms, offRms: a.rms, mean: b.mean };
}

const gSlide = grainCase(ektachrome, "ektachrome", false);
const gSlideCrop = grainCase(ektachrome, "ektachrome", true);
const gVelvia = grainCase(velvia, "velvia", false);
const gNeg = grainCase(portra, "portra-scan", false);

function filterCase(film, uv, ir) {
  const params = { ...p0, scanFilm: true, grainActive: false, filterUvAmount: uv, filterIrAmount: ir };
  const src = splitRG(160, 96);
  return simulate(src, film, endura, params);
}

const none = filterCase(ektachrome, 0, 0);
const uvOn = filterCase(ektachrome, 1, 0);
const irOn = filterCase(ektachrome, 0, 1);
const red0 = halfMean(none, true);
const redUv = halfMean(uvOn, true);
const redIr = halfMean(irOn, true);
const blu0 = halfMean(none, false);
const bluUv = halfMean(uvOn, false);
const bluIr = halfMean(irOn, false);

function dist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

const dUvRed = dist(red0, redUv);
const dUvBlue = dist(blu0, bluUv);
const dIrRed = dist(red0, redIr);
const dIrBlue = dist(blu0, bluIr);
console.log("uv delta red-patch", dUvRed.toFixed(4), "blue-patch", dUvBlue.toFixed(4));
console.log("ir delta red-patch", dIrRed.toFixed(4), "blue-patch", dIrBlue.toFixed(4));
console.log("ektachrome mid gray", meanRgb(simulate(solid(64, 64, 0.184, 0.184, 0.184), ektachrome, endura, { ...p0, scanFilm: true, grainActive: false })));

const ok =
  gSlide.ratio > 8 &&
  gSlide.onRms > 0.003 &&
  gSlideCrop.onRms >= gSlide.onRms * 0.9 &&
  gVelvia.ratio > 8 &&
  gVelvia.onRms > 0.002 &&
  dUvRed > 0.02 &&
  dUvBlue > 0.008 &&
  dIrRed > 0.01 &&
  gSlide.mean > 0.04 &&
  gSlide.mean < 0.9;

console.log(JSON.stringify({ ok, gSlide, gSlideCrop, gVelvia, gNeg, dUvRed, dUvBlue, dIrRed, dIrBlue }, null, 2));
if (!ok) process.exit(2);
