import {applyPrep} from "./negs-prep.ts";
import { applyLangmuirCouplers } from "./experimental-couplers.ts";
import { withExperimentalProfile, rmsParticleAreas } from "./experimental-math.ts";
import type { DarkroomParams, DiffusionFamily, FilmProfile, Vec3 } from "./types.ts";
import { isFilmBypass, isPaperBypass } from "./types.ts";
import {
  clamp01,
  interpCurve,
  linearToSrgb,
  luminance,
  mulMat3,
  softClip,
  srgbToLinear,
  whiteBalanceMatrix,
} from "./color.ts";
import { resolveWb } from "./wb-temp-tint.ts";
import { applyRawEngine, sanitizeRawEngine, sanitizeRawEngineStyle } from "./raw-engine.ts";
import { applyDigitalTone } from "./digital-tone.ts";
import { blurPlane, blurRgb, hashNoise } from "./spatial.ts";

export type PlanarImage = {
  w: number;
  h: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
};

export function imageDataToLinear(e: Uint8ClampedArray | Uint8Array, t: number, n: number, r: boolean, i = false): PlanarImage {
  let a = t * n;
  if (t < 1 || n < 1 || e.length < a * 4) {
    return { w: 1, h: 1, r: new Float32Array(1), g: new Float32Array(1), b: new Float32Array(1) };
  }
  let o = new Float32Array(a),
    s = new Float32Array(a),
    c = new Float32Array(a);
  for (let t = 0, n = 0; t < a; t++, n += 4) {
    let a = e[n] / 255,
      l = e[n + 1] / 255,
      u = e[n + 2] / 255,
      d = r ? srgbToLinear(a) : a,
      f = r ? srgbToLinear(l) : l,
      p = r ? srgbToLinear(u) : u;
    (i && r && ((d = jpegSceneLift(d)), (f = jpegSceneLift(f)), (p = jpegSceneLift(p))),
      (o[t] = d),
      (s[t] = f),
      (c[t] = p));
  }
  return { w: t, h: n, r: o, g: s, b: c };
}
function jpegSceneLift(e: number): number {
  let t = e < 0 ? 0 : e;
  t < 0.04 && (t += 0.007 * (1 - t / 0.04));
  let n = 0.72;
  if (t > n) {
    let e = Math.min(1, Math.max(0, (t - n) / 0.28));
    t = n + e * 0.48 + e * e * 0.42;
  }
  return t;
}
const ENCODE_LUT = new Uint8ClampedArray(2048);
for (let i = 0; i < 2048; i++) {
  ENCODE_LUT[i] = Math.round(clamp01(linearToSrgb(softClip(i / 1024))) * 255);
}
function encodeByte(x: number): number {
  if (x <= 0) return 0;
  if (x >= 2) return ENCODE_LUT[2047];
  return ENCODE_LUT[(x * 1024) | 0];
}
export function linearToImageData(e: PlanarImage, t: boolean): ImageData {
  let { w: n, h: r, r: i, g: a, b: o } = e;
  if (n < 1 || r < 1) return new ImageData(1, 1);
  let s = new Uint8ClampedArray(n * r * 4);
  for (let e = 0, c = 0; e < n * r; e++, c += 4) {
    if (t) {
      s[c] = encodeByte(i[e]);
      s[c + 1] = encodeByte(a[e]);
      s[c + 2] = encodeByte(o[e]);
    } else {
      s[c] = Math.round(clamp01(i[e]) * 255);
      s[c + 1] = Math.round(clamp01(a[e]) * 255);
      s[c + 2] = Math.round(clamp01(o[e]) * 255);
    }
    s[c + 3] = 255;
  }
  return new ImageData(s, n, r);
}
function copyPlane(e: Float32Array): Float32Array {
  return new Float32Array(e);
}
function autoExposureEv(e: PlanarImage, t: string): number {
  let { w: n, h: r, r: i, g: a, b: o } = e,
    s = n * r,
    l = 0.184,
    u = l;
  if (t === 'average') {
    let e = 0;
    for (let t = 0; t < s; t++) e += luminance(i[t], a[t], o[t]);
    u = e / s;
  } else if (t === 'median') {
    const stride = s > 250000 ? Math.ceil(s / 250000) : 1;
    const sample: number[] = [];
    for (let p = 0; p < s; p += stride) sample.push(luminance(i[p], a[p], o[p]));
    sample.sort((a, b) => a - b);
    u = sample[sample.length >> 1];
  } else if (t === 'partial') {
    let e = 0,
      t = 0;
    for (let y = 0; y < r; y++) {
      let ay = y / r - 0.5;
      for (let x = 0; x < n; x++) {
        let ax = x / n - 0.5;
        ax * ax + ay * ay < 0.0225 && ((e += luminance(i[y * n + x], a[y * n + x], o[y * n + x])), t++);
      }
    }
    u = t ? e / t : luminance(i[s >> 1], a[s >> 1], o[s >> 1]);
  } else if (t === 'matrix') {
    let e = Math.max(1, (r / 5) | 0),
      t = Math.max(1, (n / 5) | 0),
      acc = 0,
      wsum = 0;
    for (let zo = 0; zo < 5; zo++)
      for (let zs = 0; zs < 5; zs++) {
        let zl = 0,
          zu = 0,
          d = zo * e,
          f = zs * t;
        for (let y = d; y < Math.min(r, d + e); y++)
          for (let x = f; x < Math.min(n, f + t); x++)
            ((zl += luminance(i[y * n + x], a[y * n + x], o[y * n + x])), zu++);
        let p = (zo - 2) / 2,
          m = (zs - 2) / 2,
          h = Math.sqrt(m * m + p * p) / Math.SQRT2,
          g = 0.5 * (1 + Math.cos(Math.PI * h));
        zu && ((acc += (zl / zu) * g), (wsum += g));
      }
    u = wsum ? acc / wsum : l;
  } else if (t === 'multi_zone') {
    let e = [
        [0, 0.05, 0.5],
        [0.05, 0.25, 0.3],
        [0.25, 0.5, 0.2],
      ],
      tacc = 0,
      iw = 0;
    for (let [za, zo, zs] of e) {
      let ze = 0,
        zl = 0;
      for (let y = 0; y < r; y++) {
        let iy = y / Math.max(n, r) - (r / Math.max(n, r)) * 0.5;
        for (let x = 0; x < n; x++) {
          let ux = x / Math.max(n, r) - (n / Math.max(n, r)) * 0.5,
            d = Math.hypot(ux, iy);
          d >= za && d < zo && ((ze += luminance(i[y * n + x], a[y * n + x], o[y * n + x])), zl++);
        }
      }
      zl && ((tacc += (ze / zl) * zs), (iw += zs));
    }
    u = iw ? tacc / iw : l;
  } else {
    let acc = 0,
      wsum = 0,
      den = Math.max(n, r);
    for (let y = 0; y < r; y++) {
      let ay = y / den - (r / den) * 0.5;
      for (let x = 0; x < n; x++) {
        let ax = x / den - (n / den) * 0.5,
          w = Math.exp(-(ax * ax + ay * ay) * 12.499999999999998),
          p = y * n + x;
        acc += luminance(i[p], a[p], o[p]) * w;
        wsum += w;
      }
    }
    u = wsum ? acc / wsum : l;
  }
  return ((u = Math.max(u, 1e-6)), Math.log2(l / u));
}
function applyScale(e: PlanarImage, t: number): void {
  let { r: n, g: r, b: i } = e;
  for (let e = 0; e < n.length; e++) ((n[e] *= t), (r[e] *= t), (i[e] *= t));
}
function applyMat(e: PlanarImage, t: ReturnType<typeof whiteBalanceMatrix>): void {
  let { r: n, g: r, b: i } = e;
  const m00 = t[0][0], m01 = t[0][1], m02 = t[0][2];
  const m10 = t[1][0], m11 = t[1][1], m12 = t[1][2];
  const m20 = t[2][0], m21 = t[2][1], m22 = t[2][2];
  for (let e = 0; e < n.length; e++) {
    const rv = n[e], gv = r[e], bv = i[e];
    n[e] = m00 * rv + m01 * gv + m02 * bv;
    r[e] = m10 * rv + m11 * gv + m12 * bv;
    i[e] = m20 * rv + m21 * gv + m22 * bv;
  }
}

const FAMILY_CFG: Record<
  DiffusionFamily,
  {
    core: number;
    halo: number;
    bloom: number;
    wc: number;
    wh: number;
    wb: number;
    warm: number;
    gain: number;
  }
> = {
  glimmerglass: {
    core: 10, halo: 50, bloom: 260, wc: 0.6, wh: 0.3, wb: 0.1, warm: 0, gain: 0.65,
  },
  black_pro_mist: {
    core: 16, halo: 95, bloom: 380, wc: 0.4, wh: 0.47, wb: 0.13, warm: 0.65, gain: 0.75,
  },
  pro_mist: {
    core: 14, halo: 150, bloom: 650, wc: 0.28, wh: 0.42, wb: 0.3, warm: 0.4, gain: 1.05,
  },
  cinebloom: {
    core: 20, halo: 200, bloom: 1000, wc: 0.22, wh: 0.3, wb: 0.48, warm: 0.85, gain: 1,
  },
};

const STRENGTH_BREAKS = [0.125, 0.25, 0.5, 1, 2];
const STRENGTH_FRAC = [0.1, 0.2, 0.35, 0.55, 0.75];

function strengthToScatter(strength: number, gain: number): number {
  if (strength <= 0) return 0;
  const lx = Math.log2(Math.max(strength, 1e-6));
  const lp = STRENGTH_BREAKS.map((b) => Math.log2(b));
  let base = STRENGTH_FRAC[0];
  if (lx >= lp[lp.length - 1]) {
    base = STRENGTH_FRAC[STRENGTH_FRAC.length - 1];
  } else if (lx > lp[0]) {
    let i = 1;
    while (i < lp.length && lx > lp[i]) i++;
    const t = (lx - lp[i - 1]) / (lp[i] - lp[i - 1]);
    base = STRENGTH_FRAC[i - 1] + t * (STRENGTH_FRAC[i] - STRENGTH_FRAC[i - 1]);
  }
  return Math.min(0.99, Math.max(0, base * gain));
}

function applyDiffusion(
  img: PlanarImage,
  family: DiffusionFamily,
  strength: number,
  spatial: number,
  warmth: number,
  pixelUm: number,
  coreI: number,
  coreS: number,
  haloI: number,
  haloS: number,
  bloomI: number,
  bloomS: number,
): void {
  if (strength <= 0.001) return;
  const cfg = FAMILY_CFG[family] ?? FAMILY_CFG.black_pro_mist;
  const ps = strengthToScatter(strength, cfg.gain);
  if (ps <= 0) return;
  let wc = cfg.wc * Math.max(0, coreI);
  let wh = cfg.wh * Math.max(0, haloI);
  let wb = cfg.wb * Math.max(0, bloomI);
  const wsum = wc + wh + wb || 1;
  wc /= wsum;
  wh /= wsum;
  wb /= wsum;
  const scale = Math.max(spatial, 1e-6) / Math.max(pixelUm, 0.25);
  const corePx = Math.max(0.35, cfg.core * Math.max(coreS, 1e-6) * scale);
  const haloPx = Math.max(0.7, cfg.halo * Math.max(haloS, 1e-6) * scale);
  const bloomPx = Math.max(1.2, cfg.bloom * Math.max(bloomS, 1e-6) * scale);
  const core = blurRgb(img.r, img.g, img.b, img.w, img.h, corePx);
  const halo = blurRgb(img.r, img.g, img.b, img.w, img.h, haloPx);
  const bloom = blurRgb(img.r, img.g, img.b, img.w, img.h, bloomPx);
  const warm = cfg.warm + warmth;
  const n = img.r.length;
  const keep = 1 - ps;
  for (let i = 0; i < n; i++) {
    const kR =
      core[0][i] * wc +
      halo[0][i] * wh * (1 + 0.22 * warm) +
      bloom[0][i] * wb * (1 + 0.12 * warm);
    const kG = core[1][i] * wc + halo[1][i] * wh * (1 + 0.03 * warm) + bloom[1][i] * wb;
    const kB =
      core[2][i] * wc +
      halo[2][i] * wh * (1 - 0.25 * warm) +
      bloom[2][i] * wb * (1 - 0.08 * warm);
    img.r[i] = img.r[i] * keep + ps * kR;
    img.g[i] = img.g[i] * keep + ps * kG;
    img.b[i] = img.b[i] * keep + ps * kB;
  }
}

function boostHighlights(e: PlanarImage, t: number, n: number, r: number): void {
  if (t <= 0) return;
  let i = 2 ** t,
    a = 0.184 * 2 ** r,
    o = Math.max(0.02, n),
    s = e.r.length;
  for (let t = 0; t < s; t++) {
    let n = luminance(e.r[t], e.g[t], e.b[t]),
      r = 1 / (1 + Math.exp(-(n - a) / (a * o + 1e-6))),
      s = 1 + (i - 1) * r;
    ((e.r[t] *= s), (e.g[t] *= s), (e.b[t] *= s));
  }
}
function applyHalation(e: PlanarImage, t: DarkroomParams, n: number): void {
  if (!t.halationActive) return;
  let r = 1 / Math.max(n, 0.5),
    i = e.r.length,
    a = [e.r, e.g, e.b];
  if (t.scatterAmount > 0.001 && t.scatterCoreUm && t.scatterTailUm && t.scatterTailWeight)
    for (let n = 0; n < 3; n++) {
      let o = t.scatterCoreUm[n] * t.scatterSpatialScale * r,
        s = t.scatterTailUm[n] * t.scatterSpatialScale * r,
        c = t.scatterTailWeight[n],
        l = a[n],
        u = blurPlane(l, e.w, e.h, Math.max(0.3, o)),
        d = blurPlane(l, e.w, e.h, Math.max(0.6, s)),
        f = t.scatterAmount;
      for (let e = 0; e < i; e++) {
        let t = u[e] * (1 - c) + d[e] * c;
        l[e] = l[e] * (1 - f) + t * f;
      }
    }
  if (t.halationAmount > 0.001 && t.halationStrength && t.halationFirstSigmaUm)
    for (let n = 0; n < 3; n++) {
      let o = t.halationStrength[n] * t.halationAmount;
      if (o < 1e-5) continue;
      let s = t.halationFirstSigmaUm[n] * t.halationSpatialScale * r,
        c = a[n],
        l = new Float32Array(i),
        u = 0,
        d = 1;
      for (let n = 0; n < Math.min(8, Math.max(1, t.halationNBounces | 0)); n++) {
        let r = s * Math.sqrt(n + 1),
          a = blurPlane(c, e.w, e.h, Math.max(0.8, r)),
          f = o * d;
        u += f;
        for (let e = 0; e < i; e++) l[e] += a[e] * f;
        d *= t.halationBounceDecay;
      }
      let f = t.halationRenormalize ? 1 / (1 + u) : 1;
      for (let e = 0; e < i; e++) c[e] = (c[e] + l[e]) * f;
    }
}
function developDensity(e: Float32Array, t: Float32Array, n: Float32Array, r: FilmProfile, i: number): [Float32Array, Float32Array, Float32Array] {
  let a = e.length,
    o = new Float32Array(a),
    s = new Float32Array(a),
    c = new Float32Array(a),
    l = r.logExposure.min,
    u = r.logExposure.max,
    d = r.densityCurves,
    f = Math.max(0.05, i);
  for (let r = 0; r < a; r++)
    ((o[r] = interpCurve(e[r], d, l, u, 0, f)),
      (s[r] = interpCurve(t[r], d, l, u, 1, f)),
      (c[r] = interpCurve(n[r], d, l, u, 2, f)));
  return [o, s, c];
}
function applyCouplers(e: Float32Array, t: Float32Array, n: Float32Array, r: number, i: number, a: DarkroomParams, o: number): void {
  if (!a.couplersActive || a.couplersAmount <= 0) return;
  let s = e.length,
    c = a.inhibitionSamelayer * a.couplersAmount,
    l = a.inhibitionInterlayer * a.couplersAmount,
    u = a.gammaSamelayer,
    d = (a.couplerDiffusionUm / Math.max(o, 0.5)) * 0.35,
    f = d > 0.2 ? blurPlane(e, r, i, d) : e,
    p = d > 0.2 ? blurPlane(t, r, i, d) : t,
    m = d > 0.2 ? blurPlane(n, r, i, d) : n;
  for (let r = 0; r < s; r++) {
    let i = e[r],
      o = t[r],
      s = n[r],
      d = (i + o + s) / 3,
      h = i - (i - d) * u[0] * c * 0.15,
      g = o - (o - d) * u[1] * c * 0.15,
      _ = s - (s - d) * u[2] * c * 0.15,
      v = p[r] * a.gammaGtoRB[0] * l + m[r] * a.gammaBtoRG[0] * l,
      y = f[r] * a.gammaRtoGB[0] * l + m[r] * a.gammaBtoRG[1] * l,
      b = f[r] * a.gammaRtoGB[1] * l + p[r] * a.gammaGtoRB[1] * l;
    ((e[r] = Math.max(0, h + (h - d) * v * 0.35)),
      (t[r] = Math.max(0, g + (g - d) * y * 0.35)),
      (n[r] = Math.max(0, _ + (_ - d) * b * 0.35)));
  }
}
function normCdf(e: number): number {
  let t = 1 / (1 + 0.2316419 * Math.abs(e)),
    n =
      0.39894228 *
      Math.exp(-0.5 * e * e) *
      t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return e >= 0 ? 1 - n : n;
}
function inverseDensityToLog(e: number, t: Vec3[], n: number, r: number, i: number): number {
  let a = t.length;
  if (a < 2) return 0;
  let o = t[Math.min(8, a - 1)][i] > t[Math.max(0, a - 9)][i],
    s = 0,
    c = a - 1;
  if (o)
    for (; c - s > 1;) {
      let n = (s + c) >> 1;
      t[n][i] >= e ? (s = n) : (c = n);
    }
  else
    for (; c - s > 1;) {
      let n = (s + c) >> 1;
      t[n][i] <= e ? (s = n) : (c = n);
    }
  let l = t[s][i],
    u = t[c][i],
    d = Math.abs(u - l) < 1e-12 ? 0 : (e - l) / (u - l);
  return (
    d < 0 ? (d = 0) : d > 1 && (d = 1),
    n + ((s + d) / (a - 1)) * (r - n)
  );
}
export function cameraBandPassScales(e: number, t: number): Vec3 {
  let n = clamp01(e),
    r = clamp01(t),
    i = (1 - 0.5 * n) * (1 - 0.42 * r),
    a = (1 - 0.08 * n) * (1 - 0.07 * r),
    o = (1 - 0.2 * n) * (1 - 0.02 * r),
    s = (i + a + o) / 3 || 1;
  return [i / s, a / s, o / s];
}
const GRAIN_LAYER_SCALE = [2, 1, 0.5];
function applyGrain(e: Float32Array, t: Float32Array, n: Float32Array, r: number, i: number, a: DarkroomParams, o: FilmProfile, s: number): void {
  if (!a.grainActive) return;
  if(a.experimental?.grainRms){
    const area=rmsParticleAreas(o,a.experimental);
    a={...a,grainParticleArea:1,grainScaleR:area[0],grainScaleG:area[1],grainScaleB:area[2],grainDensityMin:(a.experimental.grainFloorRed+a.experimental.grainFloorGreen+a.experimental.grainFloorBlue)/3,grainUniformity:(a.experimental.grainUniformityRed+a.experimental.grainUniformityGreen+a.experimental.grainUniformityBlue)/3};
  }

  let c = e.length,
    l = Math.max(0.5, Math.min(s, 16)),
    u = l * l,
    d = [a.grainScaleR, a.grainScaleG, a.grainScaleB],
    f = [e, t, n],
    p = a.grainDensityMin,
    m = Math.min(0.999, Math.max(0.5, a.grainUniformity)),
    h = o.type === 'positive',
    g = h ? 2.4 : 1,
    _ = o.densityCurvesModel,
    v =
      _?.centers?.length === 3 && _.centers[0]?.length >= 2
        ? _.centers[0].length
        : 0,
    y = [];
  for (let e = 0; e < 3; e++) {
    let t = f[e],
      n = Math.max(o.dmax[e], 1e-4) + p;
    if (v < 2 || !_) {
      let r = Math.max(2, u / Math.max(0.02, a.grainParticleArea * d[e])),
        i = new Float32Array(c);
      for (let a = 0; a < c; a++) {
        let o = t[a] + p,
          s = clamp01(o / n),
          c = n * Math.sqrt((s * (1 - s) + 1e-6) / r) * (2 - m) * g;
        i[a] = o + hashNoise(a, e) * c - p;
      }
      y.push(i);
      continue;
    }
    let s = _.amplitudes[e],
      b = _.centers[e],
      x = _.sigmas[e],
      S = 0;
    for (let e = 0; e < v; e++) S += Math.max(s[e], 0);
    S < 1e-6 && (S = n);
    let C = o.logExposure.min,
      w = o.logExposure.max,
      T = new Float32Array(c),
      ee = [];
    for (let e = 0; e < v; e++) ee.push(new Float32Array(c));
    for (let n = 0; n < c; n++) {
      let r = Math.max(0, t[n]),
        i = inverseDensityToLog(r, o.densityCurves, C, w, e),
        a = 0;
      for (let e = 0; e < v; e++) {
        let t = Math.max(0.05, x[e]),
          r = (i - b[e]) / t,
          o = Math.max(0, s[e] * normCdf(h ? -r : r));
        ((ee[e][n] = o), (a += o));
      }
      let c = a > 1e-8 ? r / a : 1;
      for (let e = 0; e < v; e++) ee[e][n] *= c;
    }
    for (let t = 0; t < v; t++) {
      let n = Math.max(s[t], 0) / S,
        o = GRAIN_LAYER_SCALE[t < 2 ? t : 2],
        f = Math.max(
          2,
          (u * Math.max(n, 0.08)) /
            Math.max(0.02, a.grainParticleArea * d[e] * o),
        ),
        h = Math.max(s[t], 1e-4) + p * n,
        _ = new Float32Array(c);
      for (let r = 0; r < c; r++) {
        let i = ee[t][r] + p * n,
          a = clamp01(i / h),
          o = h * Math.sqrt((a * (1 - a) + 1e-6) / f) * (2 - m) * g;
        _[r] = i + hashNoise(r, e * 4 + t) * o;
      }
      let v = a.grainDyeCloudsUm / Math.max(l, 0.5),
        y = blurPlane(_, r, i, Math.max(0.12, v * 0.25));
      for (let e = 0; e < c; e++) T[e] += y[e] - p * n;
    }
    y.push(T);
  }
  let b = a.grainBlur;
  b > 0.15
    ? (e.set(blurPlane(y[0], r, i, b)),
      t.set(blurPlane(y[1], r, i, b)),
      n.set(blurPlane(y[2], r, i, b)))
    : (e.set(y[0]), t.set(y[1]), n.set(y[2]));
  if(a.experimental?.grainRms&&a.experimental.grainUsmAmount>0&&a.experimental.grainUsmSigma>0){
    const exp=a.experimental,planes=[e,t,n],floors=[exp.grainFloorRed,exp.grainFloorGreen,exp.grainFloorBlue];
    for(let channel=0;channel<3;channel++){
      const plane=planes[channel],absolute=Float32Array.from(plane,v=>Math.max(0,v+floors[channel])),low=blurPlane(absolute,r,i,exp.grainUsmSigma);
      let before=0,after=0;
      for(let k=0;k<plane.length;k++){const d=absolute[k];before+=d;plane[k]=d<=0?0:Math.max(d,1e-6)**(1+exp.grainUsmAmount)/Math.max(low[k],1e-6)**exp.grainUsmAmount;after+=plane[k];}
      for(let k=0;k<plane.length;k++)plane[k]=plane[k]*(after>0?before/after:1)-floors[channel];
    }
  }

}
function cmyToRgbOd(e: number, t: number, n: number, r: number[][], i: Vec3): Vec3 {
  return [
    e * r[0][0] + t * r[1][0] + n * r[2][0] + i[0],
    e * r[0][1] + t * r[1][1] + n * r[2][1] + i[1],
    e * r[0][2] + t * r[1][2] + n * r[2][2] + i[2],
  ];
}
function applySlideTransmissionGrain(e: PlanarImage, t: DarkroomParams, n: number): void {
  if (!t.grainActive) return;
  let r = e.r.length,
    i = Math.max(0.5, Math.min(n, 16)),
    a = Math.max(2, (i * i) / Math.max(0.02, t.grainParticleArea * 1.15)),
    o = 3.2 * (2 - Math.min(0.999, Math.max(0.5, t.grainUniformity))),
    s = new Float32Array(r),
    c = new Float32Array(r),
    l = new Float32Array(r);
  for (let t = 0; t < r; t++) {
    let n = clamp01(Math.max(1e-5, luminance(e.r[t], e.g[t], e.b[t])) / 0.42),
      r = o * Math.sqrt((n * (1 - n) + 0.05) / a);
    ((s[t] = e.r[t] * (1 + hashNoise(t, 21) * r * 0.9)),
      (c[t] = e.g[t] * (1 + hashNoise(t, 22) * r)),
      (l[t] = e.b[t] * (1 + hashNoise(t, 23) * r * 1.2)));
  }
  let u = Math.max(0.12, t.grainBlur * 0.28);
  ((e.r = blurPlane(s, e.w, e.h, u)),
    (e.g = blurPlane(c, e.w, e.h, u)),
    (e.b = blurPlane(l, e.w, e.h, u)));
}
function odToLin(e: Vec3): Vec3 {
  return [10 ** -e[0], 10 ** -e[1], 10 ** -e[2]];
}
function morphGamma(e: DarkroomParams, t: number): number {
  const base = Math.max(0.3, e.printGamma || 1);
  if (!e.chemistryActive) return base;
  let n = [e.printGammaR, e.printGammaG, e.printGammaB][t],
    r = (e.printGammaFast + e.printGammaSlow) * 0.5,
    i = 1 - e.developerExhaustion * 0.35;
  return Math.max(0.3, e.printGamma * n * r * i);
}

type NegSlot = {
  key: string;
  c: Float32Array;
  m: Float32Array;
  y: Float32Array;
};
let NEG: NegSlot | null = null;

export function clearNegCache(): void {
  NEG = null;
}


function planeStamp(p: Float32Array): number {
  const n = p.length;
  if (!n) return 0;
  return p[0] + p[n >> 1] + p[n - 1] + n;
}

/** Filming-only signature. Print knobs (Y/M, paper, EV, gamma, preflash, scan) stay out. */
function filmingKey(p: DarkroomParams, img: PlanarImage, draft: boolean): string {
  const d = p.cameraDiffusion ?? {
    active: false,
    family: "black_pro_mist",
    strength: 0,
    spatialScale: 1,
    haloWarmth: 0,
    coreIntensity: 1,
    coreSize: 1,
    haloIntensity: 1,
    haloSize: 1,
    bloomIntensity: 1,
    bloomSize: 1,
  };
  return [
    draft ? 1 : 0,
    img.w,
    img.h,
    planeStamp(img.r),
    planeStamp(img.g),
    planeStamp(img.b),
    p.filmStock,
    p.exposureCompensationEv,
    p.autoExposure ? 1 : 0,
    p.autoExposureMethod,
    p.filmFormatMm,
    p.cameraLensBlurUm,
    d.active ? 1 : 0,
    d.family,
    d.strength,
    d.spatialScale,
    d.haloWarmth,
    d.coreIntensity,
    d.coreSize,
    d.haloIntensity,
    d.haloSize,
    d.bloomIntensity,
    d.bloomSize,
    p.filterUvAmount,
    p.filterIrAmount,
    p.whiteBalance,
    p.temperature,
    p.tint,
    p.rawEngine,
    p.rawEngineStyle,
    p.grainActive ? 1 : 0,
    p.grainParticleArea,
    p.grainScaleR,
    p.grainScaleG,
    p.grainScaleB,
    p.grainDensityMin,
    p.grainUniformity,
    p.grainBlur,
    p.grainDyeCloudsUm,
    p.halationActive ? 1 : 0,
    p.scatterAmount,
    p.scatterSpatialScale,
    p.halationAmount,
    p.halationSpatialScale,
    p.boostEv,
    p.protectEv,
    p.boostRange,
    p.couplersActive ? 1 : 0,
    p.couplersAmount,
    p.inhibitionSamelayer,
    p.inhibitionInterlayer,
    p.couplerDiffusionUm,
    p.filmGamma,
    JSON.stringify(p.experimental),
    JSON.stringify(p.prep),
    p.crop ? 1 : 0,
    p.cropSizeX,
    p.cropSizeY,
    p.applyCctfDecoding ? 1 : 0,
  ].join("|");
}

function applyCameraStage(a: PlanarImage, r: DarkroomParams, draft: boolean, pixelUm: number): void {
  const wb = resolveWb(r);
  if (!wb.skip) applyMat(a, whiteBalanceMatrix(wb.kelvin, wb.tint, "srgb"));
  applyRawEngine(
    a,
    sanitizeRawEngine(r.rawEngine),
    sanitizeRawEngineStyle(sanitizeRawEngine(r.rawEngine), r.rawEngineStyle),
  );
  if (r.autoExposure) applyScale(a, 2 ** autoExposureEv(a, r.autoExposureMethod));
  applyScale(a, 2 ** r.exposureCompensationEv);
  if(r.prep)applyPrep(a,r.prep);
  boostHighlights(a, r.boostEv, r.boostRange, r.protectEv);
  if (r.cameraDiffusion?.active) {
    applyDiffusion(
      a,
      r.cameraDiffusion.family,
      r.cameraDiffusion.strength,
      r.cameraDiffusion.spatialScale,
      r.cameraDiffusion.haloWarmth,
      pixelUm,
      r.cameraDiffusion.coreIntensity,
      r.cameraDiffusion.coreSize,
      r.cameraDiffusion.haloIntensity,
      r.cameraDiffusion.haloSize,
      r.cameraDiffusion.bloomIntensity,
      r.cameraDiffusion.bloomSize,
    );
  }
  if (!draft && r.cameraLensBlurUm > 0.05) {
    const e = r.cameraLensBlurUm / Math.max(pixelUm, 0.5);
    a.r = blurPlane(a.r, a.w, a.h, e);
    a.g = blurPlane(a.g, a.w, a.h, e);
    a.b = blurPlane(a.b, a.w, a.h, e);
  }
}

let OUT: PlanarImage | null = null;
function takeOut(w: number, h: number): PlanarImage {
  const n = w * h;
  if (!OUT || OUT.r.length !== n) {
    OUT = { w, h, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  } else {
    OUT.w = w;
    OUT.h = h;
  }
  return OUT;
}

export function simulate(e: PlanarImage, t: FilmProfile | null, n: FilmProfile | null, r: DarkroomParams, i = false): PlanarImage {
  if (!e || e.w < 1 || e.h < 1 || !e.r || e.r.length < e.w * e.h) return e;
  const experiment=r.experimental;
  if(experiment?.workflow&&experiment.workflow!=="normal")throw new Error("Обработка сканов негативов доступна в Android APK. В меню «Эмульсия» выберите обычную фотографию для браузерного предпросмотра.");
  const filmGamma=experiment?.filmChemistry?1:r.filmGamma;
  if(t&&experiment)t=withExperimentalProfile(t,experiment,true,experiment.filmChemistry?{gamma:r.filmGamma,fast:experiment.filmFast,slow:experiment.filmSlow,red:experiment.filmRed,green:experiment.filmGreen,blue:experiment.filmBlue,exhaustion:experiment.filmExhaustion}:undefined);
  if(n&&experiment){
    const morph=r.chemistryActive&&n.densityModel?{gamma:r.printGamma,fast:r.printGammaFast,slow:r.printGammaSlow,red:r.printGammaR,green:r.printGammaG,blue:r.printGammaB,exhaustion:r.developerExhaustion}:undefined;
    n=withExperimentalProfile(n,experiment,false,morph);
    if(morph)r={...r,chemistryActive:false,printGamma:1};
  }

  let o = e.r.length,
    s = Math.max(e.w, e.h),
    c =
      (r.filmFormatMm *
        (r.crop ? Math.max(r.cropSizeX, r.cropSizeY) : 1) *
        1e3) /
      s,
    l = cameraBandPassScales(r.filterUvAmount, r.filterIrAmount);
  const taking=t?.takingFilters?.[experiment?.colorFilter??"none"];
  if(t&&taking){t={...t,rgbToFilm:taking.matrix};l=[l[0]*taking.gain[0],l[1]*taking.gain[1],l[2]*taking.gain[2]];}

  if (isFilmBypass(r.filmStock) || !t) {
    let a = { w: e.w, h: e.h, r: copyPlane(e.r), g: copyPlane(e.g), b: copyPlane(e.b) };
    applyCameraStage(a, r, i, c);
    applyDigitalTone(a, r);
    return a;
  }
  const fkey = filmingKey(r, e, i);
  const negHit = !!(NEG && NEG.key === fkey && NEG.c.length === o);
  let a = takeOut(e.w, e.h);
  if (!negHit) {
    a.r.set(e.r);
    a.g.set(e.g);
    a.b.set(e.b);
  }
  let v: Float32Array;
  let y: Float32Array;
  let b: Float32Array;
  if (negHit) {
    v = NEG!.c;
    y = NEG!.m;
    b = NEG!.y;
  } else {
  const wb = resolveWb(r);
  if (
    (!wb.skip && applyMat(a, whiteBalanceMatrix(wb.kelvin, wb.tint, "srgb")),
    applyRawEngine(a, sanitizeRawEngine(r.rawEngine), sanitizeRawEngineStyle(sanitizeRawEngine(r.rawEngine), r.rawEngineStyle)),
    r.autoExposure && applyScale(a, 2 ** autoExposureEv(a, r.autoExposureMethod)),
    applyScale(a, 2 ** r.exposureCompensationEv),
    r.prep && applyPrep(a,r.prep),
    boostHighlights(a, r.boostEv, r.boostRange, r.protectEv),
    r.cameraDiffusion?.active &&
      applyDiffusion(
        a,
        r.cameraDiffusion.family,
        r.cameraDiffusion.strength,
        r.cameraDiffusion.spatialScale,
        r.cameraDiffusion.haloWarmth,
        c,
        r.cameraDiffusion.coreIntensity,
        r.cameraDiffusion.coreSize,
        r.cameraDiffusion.haloIntensity,
        r.cameraDiffusion.haloSize,
        r.cameraDiffusion.bloomIntensity,
        r.cameraDiffusion.bloomSize,
      ),
    !i && r.cameraLensBlurUm > 0.05)
  ) {
    let e = r.cameraLensBlurUm / Math.max(c, 0.5);
    ((a.r = blurPlane(a.r, a.w, a.h, e)),
      (a.g = blurPlane(a.g, a.w, a.h, e)),
      (a.b = blurPlane(a.b, a.w, a.h, e)));
  }
  applyHalation(a, r, c);
  let u = t.rgbToFilm,
    d = [
      u[0][0] + u[0][1] + u[0][2] || 1,
      u[1][0] + u[1][1] + u[1][2] || 1,
      u[2][0] + u[2][1] + u[2][2] || 1,
    ],
    f = clamp01(r.filterUvAmount),
    p = clamp01(r.filterIrAmount),
    m = f > 0.001 || p > 0.001;
  for (let e = 0; e < o; e++) {
    let rv = Math.max(a.r[e], 0),
      gv = Math.max(a.g[e], 0),
      bv = Math.max(a.b[e], 0),
      cr = (u[0][0] * rv + u[0][1] * gv + u[0][2] * bv) / d[0] * l[0],
      cg = (u[1][0] * rv + u[1][1] * gv + u[1][2] * bv) / d[1] * l[1],
      cb = (u[2][0] * rv + u[2][1] * gv + u[2][2] * bv) / d[2] * l[2];
    if (m) {
      let sum = rv + gv + bv + 1e-8,
        ib = bv / sum,
        ir = rv / sum;
      cr *= (1 - f * 0.5 * ib) * (1 - p * 0.28 * ir);
      cb *= 1 - f * 0.14 * ib;
    }
    a.r[e] = cr;
    a.g[e] = cg;
    a.b[e] = cb;
  }
  let h = new Float32Array(o),
    g = new Float32Array(o),
    _ = new Float32Array(o);
  for (let e = 0; e < o; e++)
    ((h[e] = Math.log10(Math.max(a.r[e], 0) + 1e-10)),
      (g[e] = Math.log10(Math.max(a.g[e], 0) + 1e-10)),
      (_[e] = Math.log10(Math.max(a.b[e], 0) + 1e-10)));
  let [dv, dy, db] = developDensity(h, g, _, t, filmGamma);
    v = dv;
    y = dy;
    b = db;
    if (!i) {
      if(r.experimental?.dirLangmuir)applyLangmuirCouplers([v,y,b],[h,g,_],a.w,a.h,t,r,c);
      else applyCouplers(v, y, b, a.w, a.h, r, c);
      applyGrain(v, y, b, a.w, a.h, r, t, c);
    }
    NEG = { key: fkey, c: v, m: y, y: b };
  }
  if (r.scanFilm || isPaperBypass(r.printPaper) || !n) {
    let e = t.type === 'positive' ? 0.52 : 1;
    for (let n = 0; n < o; n++) {
      let r = cmyToRgbOd(v[n], y[n], b[n], t.dyeToRgb, t.baseRgbOd);
      ((a.r[n] = 10 ** -(r[0] * e)),
        (a.g[n] = 10 ** -(r[1] * e)),
        (a.b[n] = 10 ** -(r[2] * e)));
    }
    !i && t.type === 'positive' && applySlideTransmissionGrain(a, r, c);
  } else {
    let pv = v,
      py = y,
      pb = b;
    if (t.type === "positive") {
      pv = new Float32Array(o);
      py = new Float32Array(o);
      pb = new Float32Array(o);
      const dx = t.dmax[0],
        dy = t.dmax[1],
        dz = t.dmax[2];
      for (let n = 0; n < o; n++) {
        pv[n] = Math.max(0, dx - v[n]);
        py[n] = Math.max(0, dy - y[n]);
        pb[n] = Math.max(0, dz - b[n]);
      }
    }
    const slideNeg = (d: number, ch: number) =>
      t.type === "positive" ? Math.max(0, t.dmax[ch] - d) : d;
    let e = r.printYFilterNeutral / 100,
      s = r.printMFilterNeutral / 100,
      u = r.printCFilterNeutral / 100,
      d = r.printYFilterShift / 100,
      f = r.printMFilterShift / 100,
      p = 10 ** -(s * 0.5 + u),
      m = 10 ** -(e * 0.35 + u),
      h = 10 ** -(e + s * 0.25),
      g = p * 10 ** -(f * 0.5),
      _ = m * 10 ** -(d * 0.35),
      x = h * 10 ** -d,
      S = r.exposureCompensationEv * Math.log10(2),
      C = odToLin(
        cmyToRgbOd(
          slideNeg(
            interpCurve(
              Math.log10(0.184 * l[0] + 1e-10) + S,
              t.densityCurves,
              t.logExposure.min,
              t.logExposure.max,
              0,
              filmGamma,
            ),
            0,
          ),
          slideNeg(
            interpCurve(
              Math.log10(0.184 * l[1] + 1e-10) + S,
              t.densityCurves,
              t.logExposure.min,
              t.logExposure.max,
              1,
              filmGamma,
            ),
            1,
          ),
          slideNeg(
            interpCurve(
              Math.log10(0.184 * l[2] + 1e-10) + S,
              t.densityCurves,
              t.logExposure.min,
              t.logExposure.max,
              2,
              filmGamma,
            ),
            2,
          ),
          t.dyeToRgb,
          t.baseRgbOd,
        ),
      ),
      // Normalize the paper at unit enlarger exposure. Including printExposure
      // here would cancel the user's exposure adjustment below.
      w = [
        C[0] * p,
        C[1] * m,
        C[2] * h,
      ],
      T = [0, 0, 0];
    {
      let e = n.logExposure.min,
        t = n.logExposure.max;
      for (let r = 0; r < 3; r++) {
        let i = 0,
          a = 1e9;
        for (let o = 0; o < 64; o++) {
          let s = e + ((t - e) * o) / 63,
            c = interpCurve(s, n.densityCurves, e, t, r, 1),
            l = Math.abs(c - 0.72);
          l < a && ((a = l), (i = s));
        }
        T[r] = i;
      }
    }
    let ee = 0,
      te = 0,
      E = 0;
    if (r.preflashExposure > 0) {
      let e = (r.printYFilterNeutral + r.preflashYShift) / 100,
        n = (r.printMFilterNeutral + r.preflashMShift) / 100,
        i = odToLin(t.baseRgbOd);
      ((ee = i[0] * 10 ** -n * r.preflashExposure),
        (te = i[1] * 10 ** -(e * 0.35) * r.preflashExposure),
        (E = i[2] * 10 ** -e * r.preflashExposure));
    }
    let ne = new Float32Array(o),
      re = new Float32Array(o),
      ie = new Float32Array(o);
    for (let e = 0; e < o; e++) {
      let n = odToLin(cmyToRgbOd(pv[e], py[e], pb[e], t.dyeToRgb, t.baseRgbOd));
      ((ne[e] = n[0] * g * r.printExposure + ee),
        (re[e] = n[1] * _ * r.printExposure + te),
        (ie[e] = n[2] * x * r.printExposure + E));
    }
    if (r.printExposureCompensation) {
      let e = 10 ** T[0] / Math.max(w[0], 1e-8),
        t = 10 ** T[1] / Math.max(w[1], 1e-8),
        n = 10 ** T[2] / Math.max(w[2], 1e-8);
      for (let r = 0; r < o; r++) ((ne[r] *= e), (re[r] *= t), (ie[r] *= n));
    }
    r.printDiffusion?.active &&
      applyDiffusion(
        { w: a.w, h: a.h, r: ne, g: re, b: ie },
        r.printDiffusion.family,
        r.printDiffusion.strength,
        r.printDiffusion.spatialScale,
        r.printDiffusion.haloWarmth,
        c,
        r.printDiffusion.coreIntensity,
        r.printDiffusion.coreSize,
        r.printDiffusion.haloIntensity,
        r.printDiffusion.haloSize,
        r.printDiffusion.bloomIntensity,
        r.printDiffusion.bloomSize,
      );
    let ae = new Float32Array(o),
      oe = new Float32Array(o),
      se = new Float32Array(o),
      ce = n.logExposure.min,
      D = n.logExposure.max,
      O = morphGamma(r, 0),
      le = morphGamma(r, 1),
      ue = morphGamma(r, 2);
    for (let e = 0; e < o; e++)
      ((ae[e] = interpCurve(
        Math.log10(Math.max(ne[e], 0) + 1e-10),
        n.densityCurves,
        ce,
        D,
        0,
        O,
      )),
        (oe[e] = interpCurve(
          Math.log10(Math.max(re[e], 0) + 1e-10),
          n.densityCurves,
          ce,
          D,
          1,
          le,
        )),
        (se[e] = interpCurve(
          Math.log10(Math.max(ie[e], 0) + 1e-10),
          n.densityCurves,
          ce,
          D,
          2,
          ue,
        )));
    for (let e = 0; e < o; e++) {
      let t = odToLin(cmyToRgbOd(ae[e], oe[e], se[e], n.dyeToRgb, n.baseRgbOd));
      ((a.r[e] = t[0]), (a.g[e] = t[1]), (a.b[e] = t[2]));
    }
    let de = odToLin(n.baseRgbOd),
      k = Math.max(de[0], 1e-4),
      A = Math.max(de[1], 1e-4),
      j = Math.max(de[2], 1e-4);
    for (let e = 0; e < o; e++) ((a.r[e] /= k), (a.g[e] /= A), (a.b[e] /= j));
  }
  if (!i && r.glareActive && r.glarePercent > 0 && !r.scanFilm && !isPaperBypass(r.printPaper)) {
    let e = r.glarePercent,
      t = r.glareRoughness,
      n = blurRgb(a.r, a.g, a.b, a.w, a.h, Math.max(0.4, r.glareBlur));
    for (let r = 0; r < o; r++) {
      let i = (n[0][r] + n[1][r] + n[2][r]) / 3,
        o = e * (0.4 + 0.6 * t) * (0.04 + i * 0.2);
      ((a.r[r] = a.r[r] * (1 - e * 0.15) + o),
        (a.g[r] = a.g[r] * (1 - e * 0.15) + o),
        (a.b[r] = a.b[r] * (1 - e * 0.15) + o));
    }
  }
  if (
    (!i &&
      r.scanLensBlur > 0.05 &&
      ((a.r = blurPlane(a.r, a.w, a.h, r.scanLensBlur)),
      (a.g = blurPlane(a.g, a.w, a.h, r.scanLensBlur)),
      (a.b = blurPlane(a.b, a.w, a.h, r.scanLensBlur))),
    !i && r.scanUnsharpSigma > 0 && r.scanUnsharpAmount > 0)
  ) {
    let e = blurPlane(a.r, a.w, a.h, r.scanUnsharpSigma),
      t = blurPlane(a.g, a.w, a.h, r.scanUnsharpSigma),
      n = blurPlane(a.b, a.w, a.h, r.scanUnsharpSigma),
      i = r.scanUnsharpAmount;
    for (let r = 0; r < o; r++)
      ((a.r[r] += (a.r[r] - e[r]) * i),
        (a.g[r] += (a.g[r] - t[r]) * i),
        (a.b[r] += (a.b[r] - n[r]) * i));
  }
  if (r.scanWhiteCorrection || r.scanBlackCorrection) {
    let e = 1 / 0,
      t = 0;
    for (let n = 0; n < o; n++) {
      let r = luminance(a.r[n], a.g[n], a.b[n]);
      (r < e && (e = r), r > t && (t = r));
    }
    let n = r.scanBlackCorrection ? r.scanBlackLevel : e,
      i = r.scanWhiteCorrection ? r.scanWhiteLevel : t,
      s = Math.max(i - n, 1e-6);
    for (let e = 0; e < o; e++)
      ((a.r[e] = (a.r[e] - n) / s),
        (a.g[e] = (a.g[e] - n) / s),
        (a.b[e] = (a.b[e] - n) / s));
  }
  if (r.gamutCompress)
    for (let e = 0; e < o; e++)
      ((a.r[e] = softClip(a.r[e])), (a.g[e] = softClip(a.g[e])), (a.b[e] = softClip(a.b[e])));
  return a;
}
export function resizeImageData(e: ImageData, t: number): ImageData {
  if (!e || e.width < 1 || e.height < 1) return e;
  let n = Math.min(1, t / Math.max(e.width, e.height));
  if (n >= 0.999) return e;
  let r = Math.max(1, Math.round(e.width * n)),
    i = Math.max(1, Math.round(e.height * n)),
    src = e.data,
    sw = e.width,
    sh = e.height,
    out = new Uint8ClampedArray(r * i * 4);
  for (let y = 0; y < i; y++) {
    let fy = ((y + 0.5) * sh) / i - 0.5,
      y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy))),
      y1 = Math.min(y0 + 1, sh - 1),
      ty = fy - y0;
    for (let x = 0; x < r; x++) {
      let fx = ((x + 0.5) * sw) / r - 0.5,
        x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx))),
        x1 = Math.min(x0 + 1, sw - 1),
        tx = fx - x0,
        o = (y * r + x) * 4;
      for (let c = 0; c < 3; c++) {
        let i00 = (y0 * sw + x0) * 4 + c,
          i10 = (y0 * sw + x1) * 4 + c,
          i01 = (y1 * sw + x0) * 4 + c,
          i11 = (y1 * sw + x1) * 4 + c;
        out[o + c] =
          (1 - tx) * (1 - ty) * src[i00] +
          tx * (1 - ty) * src[i10] +
          (1 - tx) * ty * src[i01] +
          tx * ty * src[i11];
      }
      out[o + 3] = 255;
    }
  }
  return new ImageData(out, r, i);
}
export function rotateImageData(e: ImageData, t: number): ImageData {
  let n = ((t % 360) + 360) % 360;
  if (n === 0) return e;
  let { width: r, height: i, data: a } = e;
  if (n === 180) {
    let e = new Uint8ClampedArray(a.length);
    for (let t = 0, n = a.length - 4; t < a.length; t += 4, n -= 4)
      ((e[n] = a[t]),
        (e[n + 1] = a[t + 1]),
        (e[n + 2] = a[t + 2]),
        (e[n + 3] = a[t + 3]));
    return new ImageData(e, r, i);
  }
  let o = i,
    s = r,
    c = new Uint8ClampedArray(o * s * 4);
  for (let e = 0; e < i; e++)
    for (let t = 0; t < r; t++) {
      let s = (e * r + t) * 4,
        l = n === 90 ? i - 1 - e : e,
        u = ((n === 90 ? t : r - 1 - t) * o + l) * 4;
      ((c[u] = a[s]),
        (c[u + 1] = a[s + 1]),
        (c[u + 2] = a[s + 2]),
        (c[u + 3] = a[s + 3]));
    }
  return new ImageData(c, o, s);
}
export function cropImageData(e: ImageData, t: number, n: number, r: number, i: number): ImageData {
  if (!e || e.width < 8 || e.height < 8) return e;
  let a = Math.max(e.width, e.height),
    o = Math.min(e.width, Math.max(8, Math.round(r * a))),
    s = Math.min(e.height, Math.max(8, Math.round(i * a))),
    c = Math.max(0, Math.min(e.width - o, Math.round(t * e.width - o / 2))),
    l = Math.max(0, Math.min(e.height - s, Math.round(n * e.height - s / 2))),
    u = Math.min(o, e.width - c),
    d = Math.min(s, e.height - l);
  if (u < 1 || d < 1) return e;
  let out = new Uint8ClampedArray(u * d * 4);
  for (let row = 0; row < d; row++) {
    let src = ((l + row) * e.width + c) * 4;
    out.set(e.data.subarray(src, src + u * 4), row * u * 4);
  }
  return new ImageData(out, u, d);
}
export function resizePlanar(e: PlanarImage, t: number): PlanarImage {
  let n = Math.min(1, t / Math.max(e.w, e.h));
  if (n >= 0.999) return e;
  let r = Math.max(1, Math.round(e.w * n)),
    i = Math.max(1, Math.round(e.h * n)),
    a = new Float32Array(r * i),
    o = new Float32Array(r * i),
    s = new Float32Array(r * i);
  for (let t = 0; t < i; t++) {
    let n = ((t + 0.5) * e.h) / i - 0.5,
      c = Math.max(0, Math.min(e.h - 1, Math.floor(n))),
      l = Math.min(c + 1, e.h - 1),
      u = n - c;
    for (let n = 0; n < r; n++) {
      let i = ((n + 0.5) * e.w) / r - 0.5,
        d = Math.max(0, Math.min(e.w - 1, Math.floor(i))),
        f = Math.min(d + 1, e.w - 1),
        p = i - d,
        m = c * e.w + d,
        h = c * e.w + f,
        g = l * e.w + d,
        _ = l * e.w + f,
        v = t * r + n;
      ((a[v] =
        (1 - p) * (1 - u) * e.r[m] +
        p * (1 - u) * e.r[h] +
        (1 - p) * u * e.r[g] +
        p * u * e.r[_]),
        (o[v] =
          (1 - p) * (1 - u) * e.g[m] +
          p * (1 - u) * e.g[h] +
          (1 - p) * u * e.g[g] +
          p * u * e.g[_]),
        (s[v] =
          (1 - p) * (1 - u) * e.b[m] +
          p * (1 - u) * e.b[h] +
          (1 - p) * u * e.b[g] +
          p * u * e.b[_]));
    }
  }
  return { w: r, h: i, r: a, g: o, b: s };
}
export function cropPlanar(e: PlanarImage, t: number, n: number, r: number, i: number): PlanarImage {
  if (!e || e.w < 8 || e.h < 8) return e;
  let a = Math.max(e.w, e.h),
    o = Math.min(e.w, Math.max(8, Math.round(r * a))),
    s = Math.min(e.h, Math.max(8, Math.round(i * a))),
    c = Math.max(0, Math.min(e.w - o, Math.round(t * e.w - o / 2))),
    l = Math.max(0, Math.min(e.h - s, Math.round(n * e.h - s / 2))),
    u = Math.min(o, e.w - c),
    d = Math.min(s, e.h - l);
  if (u < 1 || d < 1) return e;
  let f = new Float32Array(u * d),
    p = new Float32Array(u * d),
    m = new Float32Array(u * d);
  for (let t = 0; t < d; t++) {
    let n = (l + t) * e.w + c,
      r = t * u;
    (f.set(e.r.subarray(n, n + u), r),
      p.set(e.g.subarray(n, n + u), r),
      m.set(e.b.subarray(n, n + u), r));
  }
  return { w: u, h: d, r: f, g: p, b: m };
}

export function rgb16ToPlanar(rgb: Uint16Array, w: number, h: number): PlanarImage {
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = rgb[i * 3] / 65535;
    g[i] = rgb[i * 3 + 1] / 65535;
    b[i] = rgb[i * 3 + 2] / 65535;
  }
  return { w, h, r, g, b };
}
