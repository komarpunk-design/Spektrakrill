import rawCatalog from "./catalog.json" with { type: "json" };

export type Curve = {
  dMin: number;
  gamma: number;
  toe: number;
  toeWidth: number;
  shoulder: number;
  shoulderWidth: number;
  secondary?: {
    gamma: number;
    toe: number;
    toeWidth: number;
    shoulder: number;
    shoulderWidth: number;
  } | null;
};

export type Stock = {
  id: string;
  name: string;
  subtitle: string;
  iso: number | null;
  group: "negative" | "cine" | "slide" | "bw" | "instant" | "special";
  reversal: boolean;
  mono: boolean;
  instant: boolean;
  tungsten: boolean;
  sensitivity: number[][];
  curves: Curve[];
  paper: Curve | null;
  grain: number;
  grainMm: number;
  halation: number[];
  inhibition: number[][];
  release: number[];
  flare: number;
};

export const STOCKS = rawCatalog as Stock[];

const byId = new Map(STOCKS.map((s) => [s.id, s]));

export function stockById(id: string): Stock {
  return byId.get(id) ?? STOCKS.find((s) => s.id === "portra400") ?? STOCKS[0]!;
}

export type OutputMode = "match" | "print" | "scan";

export type DevelopOptions = {
  ev: number;
  kelvin: number | null;
  grain: number;
  halation: number;
  printEv: number;
  grade: number;
  shadows: number;
  highlights: number;
  formatMm: number;
  mode: OutputMode;
};

export const DEFAULT_DEVELOP: DevelopOptions = {
  ev: 0,
  kelvin: null,
  grain: 1,
  halation: 1,
  printEv: 0,
  grade: 1,
  shadows: 0,
  highlights: 0,
  formatMm: 36,
  mode: "match",
};

function softplus(x: number): number {
  if (x > 20) return x;
  if (x < -20) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

function componentDensity(
  gamma: number,
  toe: number,
  toeWidth: number,
  shoulder: number,
  shoulderWidth: number,
  x: number,
): number {
  if (!(shoulder > toe) || gamma === 0) return 0;
  const tw = Math.max(toeWidth, 1e-4);
  const sw = Math.max(shoulderWidth, 1e-4);
  const t = tw * softplus((x - toe) / tw);
  const s = sw * softplus((x - shoulder) / sw);
  return gamma * Math.min(Math.max(t - s, 0), shoulder - toe);
}

export function densityAt(curve: Curve, x: number): number {
  let d = curve.dMin + componentDensity(
    curve.gamma, curve.toe, curve.toeWidth, curve.shoulder, curve.shoulderWidth, x,
  );
  const sec = curve.secondary;
  if (sec) {
    d += componentDensity(sec.gamma, sec.toe, sec.toeWidth, sec.shoulder, sec.shoulderWidth, x);
  }
  return d;
}

function dMaxOf(curve: Curve): number {
  const span = Math.max(curve.shoulder - curve.toe, 0) * curve.gamma;
  const sec = curve.secondary;
  const extra = sec ? Math.max(sec.shoulder - sec.toe, 0) * sec.gamma : 0;
  return curve.dMin + span + extra;
}

function logExposureFor(curve: Curve, target: number): number {
  let lo = curve.toe - 6;
  let hi = curve.shoulder + 6;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (densityAt(curve, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const DEFAULT_PAPER: Curve = {
  dMin: 0.07,
  gamma: 2.6,
  toe: -0.52,
  toeWidth: 0.16,
  shoulder: 0.42,
  shoulderWidth: 0.14,
};

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const x = c < 0 ? 0 : c;
  const e = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  return e < 0 ? 0 : e > 1 ? 255 : Math.round(e * 255);
}

/** Gains that turn a daylight JPEG toward a scene lit at `kelvin`, identity at 5500 K. */
export function kelvinGains(kelvin: number): [number, number, number] {
  const channel = (k: number): [number, number, number] => {
    const t = Math.min(12000, Math.max(2000, k)) / 100;
    let r: number;
    let g: number;
    let b: number;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      r = 329.698727446 * (t - 60) ** -0.1332047592;
      g = 288.1221695283 * (t - 60) ** -0.0755148492;
    }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255;
    const rr = clamp(r);
    const gg = Math.max(0.05, clamp(g));
    const bb = clamp(b);
    return [rr / gg, 1, bb / gg];
  };
  const day = channel(5500);
  const src = channel(kelvin);
  return [src[0] / day[0], src[1] / day[1], src[2] / day[2]];
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (r < 1) return src;
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      const x0 = x - r;
      const x1 = x + r + 1;
      acc -= src[row + (x0 < 0 ? 0 : x0)]!;
      acc += src[row + (x1 >= w ? w - 1 : x1)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y))! * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / win;
      const y0 = y - r;
      const y1 = y + r + 1;
      acc -= tmp[(y0 < 0 ? 0 : y0) * w + x]!;
      acc += tmp[(y1 >= h ? h - 1 : y1) * w + x]!;
    }
  }
  return dst;
}

function hash01(i: number): number {
  let x = Math.imul(i, 374761393) + 668265263;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

function openTone(x: number, shadows: number, highlights: number): number {
  let y = x < 0 ? 0 : x;
  if (shadows > 0) y = y ** (1 - 0.55 * Math.min(1, shadows));
  if (highlights > 0 && y > 0.55) {
    const over = y - 0.55;
    const k = 0.45 * highlights;
    y = 0.55 + over / (1 + over * k);
  }
  return y;
}

export function decodeSrgb(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
    out[p] = srgbToLinear(data[i]! / 255);
    out[p + 1] = srgbToLinear(data[i + 1]! / 255);
    out[p + 2] = srgbToLinear(data[i + 2]! / 255);
  }
  return out;
}

export function develop(
  linear: Float32Array,
  w: number,
  h: number,
  stock: Stock,
  opt: DevelopOptions,
): ImageData {
  const n = w * h;
  const gain = 2 ** opt.ev;
  const wb = opt.kelvin == null ? null : kelvinGains(opt.kelvin);
  const paper = stock.paper ?? DEFAULT_PAPER;
  const path: "slide" | "scan" | "print" =
    opt.mode === "scan" ? "scan" : opt.mode === "print" ? "print" : stock.reversal ? "slide" : "print";
  const paperLogMid = logExposureFor(paper, paper.dMin + 0.744);
  const sens = stock.sensitivity;
  const curves = stock.curves;
  const inhib = stock.inhibition;
  const release = stock.release;
  const dMax = curves.map(dMaxOf);
  const log10 = Math.log(10);

  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  let mean = 0;
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    let rr = linear[p]! * gain;
    let gg = linear[p + 1]! * gain;
    let bb = linear[p + 2]! * gain;
    if (wb) {
      rr *= wb[0];
      gg *= wb[1];
      bb *= wb[2];
    }
    if (stock.mono) {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      rr = gg = bb = y;
    }
    const e0 = (sens[0]![0]! * rr + sens[0]![1]! * gg + sens[0]![2]! * bb);
    const e1 = (sens[1]![0]! * rr + sens[1]![1]! * gg + sens[1]![2]! * bb);
    const e2 = (sens[2]![0]! * rr + sens[2]![1]! * gg + sens[2]![2]! * bb);
    const s0 = sens[0]![0]! + sens[0]![1]! + sens[0]![2]! || 1;
    const s1 = sens[1]![0]! + sens[1]![1]! + sens[1]![2]! || 1;
    const s2 = sens[2]![0]! + sens[2]![1]! + sens[2]![2]! || 1;
    r[i] = e0 / s0;
    g[i] = e1 / s1;
    b[i] = e2 / s2;
    mean += 0.2126 * r[i]! + 0.7152 * g[i]! + 0.0722 * b[i]!;
  }
  mean /= n;
  const flare = stock.flare * mean;

  if (opt.halation > 0.001) {
    const hi = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = 0.2126 * r[i]! + 0.7152 * g[i]! + 0.0722 * b[i]!;
      hi[i] = y > 0.25 ? y - 0.25 : 0;
    }
    const radius = Math.max(1, Math.round((1.1 / opt.formatMm) * w * (0.35 + opt.halation)));
    const blurred = boxBlur(hi, w, h, Math.min(48, radius));
    const hs = stock.halation;
    const scale = opt.halation * 6;
    for (let i = 0; i < n; i++) {
      const glow = blurred[i]!;
      r[i] += glow * (0.015 + hs[0]!) * scale;
      g[i] += glow * (0.006 + hs[1]!) * scale;
      b[i] += glow * (0.002 + hs[2]!) * scale;
    }
  }

  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);

  const grade = opt.grade;
  const printEv = opt.printEv;
  const dMid = [0, 1, 2].map((c) => densityAt(curves[c]!, 0));
  const tMid = dMid.map((dens, c) => 10 ** -(dMax[c]! - dens));

  for (let i = 0; i < n; i++) {
    const ex = [Math.max(1e-6, r[i]! + flare), Math.max(1e-6, g[i]! + flare), Math.max(1e-6, b[i]! + flare)];
    let logE = ex.map((v) => Math.log(v / 0.18) / log10);
    const d0 = logE.map((x, c) => densityAt(curves[c]!, x));
    const act = d0.map((d, c) => {
      const span = Math.max(1e-4, dMax[c]! - curves[c]!.dMin);
      const norm = Math.min(1, Math.max(0, (d - curves[c]!.dMin) / span));
      return norm ** (release[c] || 1);
    });
    logE = logE.map((x, c) => {
      let cut = 0;
      const row = inhib[c]!;
      for (let j = 0; j < 3; j++) cut += row[j]! * act[j]!;
      return x - cut;
    });
    const d = logE.map((x, c) => densityAt(curves[c]!, x));

    let rr: number;
    let gg: number;
    let bb: number;
    if (path === "slide") {
      const t0 = 10 ** -(dMax[0]! - d[0]!);
      const t1 = 10 ** -(dMax[1]! - d[1]!);
      const t2 = 10 ** -(dMax[2]! - d[2]!);
      rr = 0.18 * t0 / Math.max(1e-6, tMid[0]!);
      gg = 0.18 * t1 / Math.max(1e-6, tMid[1]!);
      bb = 0.18 * t2 / Math.max(1e-6, tMid[2]!);
    } else if (path === "scan") {
      rr = 0.18 * 10 ** (d[0]! - dMid[0]!);
      gg = 0.18 * 10 ** (d[1]! - dMid[1]!);
      bb = 0.18 * 10 ** (d[2]! - dMid[2]!);
    } else {
      const toPaper = (dens: number, mid: number) => {
        const shifted = paperLogMid + grade * (printEv - (dens - mid));
        const pd = densityAt(paper, shifted);
        return 10 ** -(pd - paper.dMin);
      };
      rr = toPaper(d[0]!, dMid[0]!);
      gg = toPaper(d[1]!, dMid[1]!);
      bb = toPaper(d[2]!, dMid[2]!);
    }
    if (stock.mono) {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      rr = gg = bb = y;
    }
    outR[i] = openTone(rr, opt.shadows, opt.highlights);
    outG[i] = openTone(gg, opt.shadows, opt.highlights);
    outB[i] = openTone(bb, opt.shadows, opt.highlights);
  }

  if (opt.grain > 0.01 && stock.grain > 0) {
    const amp = stock.grain * opt.grain * (36 / opt.formatMm) * 7.5;
    const clump = Math.max(0, (stock.grainMm * 1400) / opt.formatMm * Math.min(w, h) / 36 - 0.6);
    let nr = new Float32Array(n);
    let ng = new Float32Array(n);
    let nb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = 0.2126 * outR[i]! + 0.7152 * outG[i]! + 0.0722 * outB[i]!;
      const weight = Math.sqrt(Math.min(1, Math.max(0.05, y)));
      const a = (hash01(i * 3 + 1) + hash01(i * 3 + 2) - 1) * amp * weight;
      const shared = hash01(i * 3 + 4) - 0.5;
      nr[i] = a * 0.65 + shared * amp * 0.35 * weight;
      ng[i] = a * 0.2 + shared * amp * 0.8 * weight;
      nb[i] = (hash01(i * 3 + 7) - 0.5) * amp * 0.5 * weight + shared * amp * 0.2 * weight;
    }
    if (clump > 1) {
      const rad = Math.min(6, clump);
      nr = new Float32Array(boxBlur(nr, w, h, rad));
      ng = new Float32Array(boxBlur(ng, w, h, rad));
      nb = new Float32Array(boxBlur(nb, w, h, rad));
    }
    for (let i = 0; i < n; i++) {
      outR[i] *= 10 ** -nr[i]!;
      outG[i] *= 10 ** -ng[i]!;
      outB[i] *= 10 ** -nb[i]!;
    }
  }

  const img = new ImageData(w, h);
  const px = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    px[p] = linearToSrgb(outR[i]!);
    px[p + 1] = linearToSrgb(outG[i]!);
    px[p + 2] = linearToSrgb(outB[i]!);
    px[p + 3] = 255;
  }
  return img;
}

export function resizeLinear(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * sh / dh - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * sw / dw - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const i00 = (y0 * sw + x0) * 3 + c;
        const i10 = (y0 * sw + x1) * 3 + c;
        const i01 = (y1 * sw + x0) * 3 + c;
        const i11 = (y1 * sw + x1) * 3 + c;
        const a = src[i00]! * (1 - tx) + src[i10]! * tx;
        const b = src[i01]! * (1 - tx) + src[i11]! * tx;
        out[(y * dw + x) * 3 + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return out;
}

export const GROUPS: { id: Stock["group"]; label: string }[] = [
  { id: "negative", label: "Цветной негатив" },
  { id: "cine", label: "Кино" },
  { id: "slide", label: "Слайд" },
  { id: "bw", label: "Чёрно-белая" },
  { id: "instant", label: "Моментальная" },
  { id: "special", label: "Особые" },
];
