import type { PlanarImage } from "./pipeline.ts";
import {
  clampTemp,
  clampTint,
  rgbToWbSlider,
  type WbWorkingSpace,
} from "./wb-temp-tint.ts";

/**
 * Automatic white balance on SOURCE linear RGB (display JPEG, no highlight
 * lift), then the same temperature/tint the Bradford slider consumes.
 *
 * 5500 K / tint 0 is identity. A neutral frame stays there. A warm cast
 * lands below 5500, a cool cast above. Estimation is a center-weighted mean
 * of the least saturated pixels (a gray card or pavement), then Shades-of-Gray
 * p=4, then Gray-World. Grey-Edge is not used: on sky/grass it pegs the
 * slider at the end of the scale.
 *
 * `space: "prophoto"` means the engine corrects in linear ProPhoto, but the
 * samples are still the sRGB display JPEG. They are mapped with the same
 * sRGB→ProPhoto matrix ImageConvert uses before the estimate.
 */

export type AutoWbMethod = "neutral" | "shades_of_gray" | "gray_world" | "spot";

export type AutoWbResult = {
  temperature: number;
  tint: number;
  method: AutoWbMethod;
};

const SOG_P = 4;
const MAX_EDGE = 256;
const DARK = 0.008;
const CLIP = 0.98;

/** ImageConvert.SRGB_TO_PROPHOTO. Row sums are 1, so equal sRGB stays equal. */
const SRGB_TO_PROPHOTO = [
  0.5290825, 0.3303437, 0.1405738, 0.098264, 0.8734031, 0.0283329, 0.0167029, 0.1176946, 0.8656026,
];

function toProPhoto(img: PlanarImage): PlanarImage {
  const n = img.w * img.h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const m = SRGB_TO_PROPHOTO;
  for (let i = 0; i < n; i++) {
    const R = img.r[i];
    const G = img.g[i];
    const B = img.b[i];
    r[i] = m[0] * R + m[1] * G + m[2] * B;
    g[i] = m[3] * R + m[4] * G + m[5] * B;
    b[i] = m[6] * R + m[7] * G + m[8] * B;
  }
  return { w: img.w, h: img.h, r, g, b };
}

function mapMean(r: number, g: number, b: number, space: WbWorkingSpace): [number, number, number] {
  if (space !== "prophoto") return [r, g, b];
  const m = SRGB_TO_PROPHOTO;
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

function downbox(img: PlanarImage, maxEdge: number): PlanarImage {
  const long = Math.max(img.w, img.h);
  if (long <= maxEdge * 1.15) return img;
  const scale = long / maxEdge;
  const nw = Math.max(8, Math.round(img.w / scale));
  const nh = Math.max(8, Math.round(img.h / scale));
  const r = new Float32Array(nw * nh);
  const g = new Float32Array(nw * nh);
  const b = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * img.h) / nh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.h) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * img.w) / nw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.w) / nw));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * img.w;
        for (let xx = x0; xx < x1; xx++) {
          const i = row + xx;
          sr += img.r[i];
          sg += img.g[i];
          sb += img.b[i];
          n++;
        }
      }
      const o = y * nw + x;
      const s = n || 1;
      r[o] = sr / s;
      g[o] = sg / s;
      b[o] = sb / s;
    }
  }
  return { w: nw, h: nh, r, g, b };
}

function minkowski(values: Float32Array, p: number, mask: Uint8Array): number {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i]) continue;
    const v = Math.abs(values[i]);
    acc += v ** p;
    n++;
  }
  if (n < 8 || acc <= 0) return 0;
  return (acc / n) ** (1 / p);
}

function validMask(img: PlanarImage): Uint8Array {
  const n = img.w * img.h;
  const darkOk = new Uint8Array(n);
  let imgMax = 0;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const r = img.r[i];
    const g = img.g[i];
    const b = img.b[i];
    const mx = Math.max(r, g, b);
    if (mx > imgMax) imgMax = mx;
    if (mx > DARK && Math.min(r, g, b) >= 0) {
      darkOk[i] = 1;
      kept++;
    }
  }
  const hi = imgMax <= 1.05 ? CLIP : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(hi)) return darkOk;
  const clipped = new Uint8Array(n);
  let kept2 = 0;
  for (let i = 0; i < n; i++) {
    if (!darkOk[i]) continue;
    if (Math.max(img.r[i], img.g[i], img.b[i]) >= hi) continue;
    clipped[i] = 1;
    kept2++;
  }
  if (kept2 < 16 || kept2 < kept * 0.05) return darkOk;
  return clipped;
}

function shadesOfGray(img: PlanarImage, p: number, mask: Uint8Array): [number, number, number] | null {
  const r = minkowski(img.r, p, mask);
  const g = minkowski(img.g, p, mask);
  const b = minkowski(img.b, p, mask);
  if (r <= 0 || g <= 0 || b <= 0) return null;
  return [r, g, b];
}

function saturation(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx <= 1e-6) return 1;
  return (mx - mn) / mx;
}

/** Center-weighted mean of low-saturation pixels. Null if there aren't enough. */
function centerNeutralMean(img: PlanarImage, mask: Uint8Array): [number, number, number] | null {
  const { w, h } = img;
  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const sig = 0.28 * Math.min(w, h);
  const sig2 = 2 * sig * sig || 1;
  const gated = (gate: number, minCount: number): [number, number, number] | null => {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sw = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (!mask[i]) continue;
        const r = img.r[i];
        const g = img.g[i];
        const b = img.b[i];
        if (saturation(r, g, b) > gate) continue;
        const dx = x - cx;
        const gauss = Math.exp(-(dx * dx + dy * dy) / sig2);
        const wgt = 0.3 + 0.7 * gauss;
        sr += r * wgt;
        sg += g * wgt;
        sb += b * wgt;
        sw += wgt;
        n++;
      }
    }
    if (n < minCount || sw <= 0) return null;
    return [sr / sw, sg / sw, sb / sw];
  };
  return gated(0.18, 48) ?? gated(0.4, 24);
}

function quantize(kelvin: number, tint: number): { temperature: number; tint: number } {
  return {
    temperature: clampTemp(Math.round(kelvin / 10) * 10),
    tint: clampTint(Math.round(tint)),
  };
}

function fromIlluminant(
  rgb: [number, number, number],
  method: AutoWbMethod,
  space: WbWorkingSpace,
): AutoWbResult {
  const { kelvin, tint } = rgbToWbSlider(rgb[0], rgb[1], rgb[2], space);
  const q = quantize(kelvin, tint);
  return { ...q, method };
}

export function estimateAutoWb(
  img: PlanarImage,
  space: WbWorkingSpace = "srgb",
): AutoWbResult {
  let small = downbox(img, MAX_EDGE);
  if (space === "prophoto") small = toProPhoto(small);
  const mask = validMask(small);
  const neu = centerNeutralMean(small, mask);
  if (neu) return fromIlluminant(neu, "neutral", space);
  const sog = shadesOfGray(small, SOG_P, mask);
  if (sog) return fromIlluminant(sog, "shades_of_gray", space);
  const gw = shadesOfGray(small, 1, mask);
  if (gw) return fromIlluminant(gw, "gray_world", space);
  return { temperature: 5500, tint: 0, method: "gray_world" };
}

export function sampleGrayPatch(
  img: PlanarImage,
  nx: number,
  ny: number,
  space: WbWorkingSpace = "srgb",
): AutoWbResult | null {
  const x = Math.min(img.w - 1, Math.max(0, Math.round(nx * (img.w - 1))));
  const y = Math.min(img.h - 1, Math.max(0, Math.round(ny * (img.h - 1))));
  const rad = Math.max(3, Math.min(12, Math.round(Math.min(img.w, img.h) * 0.018)));
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let yy = y - rad; yy <= y + rad; yy++) {
    if (yy < 0 || yy >= img.h) continue;
    const row = yy * img.w;
    for (let xx = x - rad; xx <= x + rad; xx++) {
      if (xx < 0 || xx >= img.w) continue;
      const i = row + xx;
      const r = img.r[i];
      const g = img.g[i];
      const b = img.b[i];
      const mx = Math.max(r, g, b);
      if (mx < DARK) continue;
      sr += r;
      sg += g;
      sb += b;
      n++;
    }
  }
  if (n < 4) return null;
  const mean = mapMean(sr / n, sg / n, sb / n, space);
  const { kelvin, tint } = rgbToWbSlider(mean[0], mean[1], mean[2], space);
  return { ...quantize(kelvin, tint), method: "spot" };
}
