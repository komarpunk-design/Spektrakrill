import type { Mat3, Vec3 } from "./types";

/**
 * Camera-stage white balance: Robertson 1968 CCT + DNG tint in CIE 1960 UCS,
 * then Bradford CAT on linear RGB.
 *
 * Table: Wyszecki & Stiles, Color Science, 2nd ed., p. 228 (Planckian locus
 * in CIE 1960 uv with isotherm slopes). Same mapping Lightroom / Camera Raw /
 * Adobe DNG use for Temperature (K) and Tint (green–magenta).
 *
 * Applied on linear RGB BEFORE Spektrafilm's Hanatos RGB→spectrum. as_shot
 * skips the matrix so the spectral engine is bit-identical to the GitHub
 * reference. The slider's neutral is 5500 K / tint 0 — the daylight preset and
 * the default — not the encoding white (D65 / D50). Bradford adapts toward
 * that xy, so 5500/0 is an exact no-op in both sRGB and ProPhoto: lower K
 * cools, higher K warms. Tint is Lightroom-style DNG units: 0 = Planckian,
 * + = greener image, − = magenta.
 */

export const WB_TMIN = 2000;
export const WB_TMAX = 12000;
export const WB_TINT_MIN = -150;
export const WB_TINT_MAX = 150;

/** DNG / Lightroom: uv offset = tint / −3000. */
const TINT_SCALE = -3000;

type Ruvt = { r: number; u: number; v: number; t: number };

// mired (1e6/K), CIE 1960 u, v, isotherm slope dv/du
const LOCUS: Ruvt[] = [
  { r: 0, u: 0.18006, v: 0.26352, t: -0.24341 },
  { r: 10, u: 0.18066, v: 0.26589, t: -0.25479 },
  { r: 20, u: 0.18133, v: 0.26846, t: -0.26876 },
  { r: 30, u: 0.18208, v: 0.27119, t: -0.28539 },
  { r: 40, u: 0.18293, v: 0.27407, t: -0.3047 },
  { r: 50, u: 0.18388, v: 0.27709, t: -0.32675 },
  { r: 60, u: 0.18494, v: 0.28021, t: -0.35156 },
  { r: 70, u: 0.18611, v: 0.28342, t: -0.37915 },
  { r: 80, u: 0.1874, v: 0.28668, t: -0.40955 },
  { r: 90, u: 0.1888, v: 0.28997, t: -0.44278 },
  { r: 100, u: 0.19032, v: 0.29326, t: -0.47888 },
  { r: 125, u: 0.19462, v: 0.30141, t: -0.58204 },
  { r: 150, u: 0.19962, v: 0.30921, t: -0.70471 },
  { r: 175, u: 0.20525, v: 0.31647, t: -0.84901 },
  { r: 200, u: 0.21142, v: 0.32312, t: -1.0182 },
  { r: 225, u: 0.21807, v: 0.32909, t: -1.2168 },
  { r: 250, u: 0.22511, v: 0.33439, t: -1.4512 },
  { r: 275, u: 0.23247, v: 0.33904, t: -1.7298 },
  { r: 300, u: 0.2401, v: 0.34308, t: -2.0637 },
  { r: 325, u: 0.24702, v: 0.34655, t: -2.4681 },
  { r: 350, u: 0.25591, v: 0.34951, t: -2.9641 },
  { r: 375, u: 0.264, v: 0.352, t: -3.5814 },
  { r: 400, u: 0.27218, v: 0.35407, t: -4.3633 },
  { r: 425, u: 0.28039, v: 0.35577, t: -5.3762 },
  { r: 450, u: 0.28863, v: 0.35714, t: -6.7262 },
  { r: 475, u: 0.29685, v: 0.35823, t: -8.5955 },
  { r: 500, u: 0.30505, v: 0.35907, t: -11.324 },
  { r: 525, u: 0.3132, v: 0.35968, t: -15.628 },
  { r: 550, u: 0.32129, v: 0.36011, t: -23.325 },
  { r: 575, u: 0.32931, v: 0.36038, t: -40.77 },
  { r: 600, u: 0.33724, v: 0.36051, t: -116.45 },
];

const SRGB_TO_XYZ: Mat3 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_SRGB: Mat3 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

// ProPhoto RGB, D50 (Lindbloom / IEC 61966-2-2)
const PROPHOTO_TO_XYZ: Mat3 = [
  [0.7976749, 0.1351917, 0.0313534],
  [0.2880402, 0.7118741, 0.0000857],
  [0.0, 0.0, 0.82521],
];
const XYZ_TO_PROPHOTO: Mat3 = [
  [1.3459433, -0.2556075, -0.0511118],
  [-0.5445989, 1.5081673, 0.0205351],
  [0.0, 0.0, 1.2118128],
];

const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

const D65_XYZ: Vec3 = [0.95047, 1, 1.08883];
const D50_XYZ: Vec3 = [0.96422, 1, 0.82521];

export type WbWorkingSpace = "srgb" | "prophoto";

function invert3(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const s = 1 / det;
  return [
    [(e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s],
    [(f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s],
    [(d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s],
  ];
}

const BRADFORD_I = invert3(BRADFORD);

function mulMat3x3(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return out;
}

function mulMat3v(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function xyToXyz(x: number, y: number): Vec3 {
  const yy = y <= 1e-8 ? 1e-8 : y;
  return [x / yy, 1, (1 - x - y) / yy];
}

function unitSlope(t: number): [number, number] {
  const len = Math.hypot(1, t);
  return [1 / len, t / len];
}

/** CIE 1931 xy → CIE 1960 UCS uv. */
export function xyToUv(x: number, y: number): { u: number; v: number } {
  const den = -2 * x + 12 * y + 3;
  const d = Math.abs(den) < 1e-12 ? 1e-12 : den;
  return { u: (4 * x) / d, v: (6 * y) / d };
}

/** Planckian + DNG tint → CIE xy. Tint 0 sits on the locus. */
export function xyFromTempTint(kelvin: number, tint: number): { x: number; y: number } {
  const t = Math.min(50000, Math.max(1667, kelvin));
  const r = 1e6 / t;
  let i = 0;
  const last = LOCUS.length - 2;
  while (i < last && r >= LOCUS[i + 1].r) i++;
  const a = LOCUS[i];
  const b = LOCUS[i + 1];
  const span = b.r - a.r;
  const f = span <= 1e-12 ? 0 : (b.r - r) / span;
  let u = a.u * f + b.u * (1 - f);
  let v = a.v * f + b.v * (1 - f);
  const [uu1, vv1] = unitSlope(a.t);
  const [uu2, vv2] = unitSlope(b.t);
  let uu = uu1 * f + uu2 * (1 - f);
  let vv = vv1 * f + vv2 * (1 - f);
  const n = Math.hypot(uu, vv) || 1;
  uu /= n;
  vv /= n;
  // User tint is Lightroom-style: + = greener image, − = magenta.
  // CAT-from-source would invert that, so the uv offset is negated vs DNG fTint.
  const offset = -tint / TINT_SCALE;
  u += uu * offset;
  v += vv * offset;
  const d = u - 4 * v + 2;
  return { x: (1.5 * u) / d, y: v / d };
}

/**
 * Inverse of xyFromTempTint: Robertson CCT via isotherm distances, then
 * projection onto the isotherm for Lightroom-style tint (+ = greener).
 */
export function tempTintFromXy(x: number, y: number): { kelvin: number; tint: number } {
  const { u, v } = xyToUv(x, y);
  const last = LOCUS.length - 1;
  const dist: number[] = new Array(LOCUS.length);
  const dir: [number, number][] = new Array(LOCUS.length);
  for (let i = 0; i < LOCUS.length; i++) {
    const d = unitSlope(LOCUS[i].t);
    dir[i] = d;
    const du = u - LOCUS[i].u;
    const dv = v - LOCUS[i].v;
    dist[i] = -du * d[1] + dv * d[0];
  }

  let i = 0;
  let found = false;
  for (let k = 0; k < last; k++) {
    if (dist[k] * dist[k + 1] <= 0) {
      i = k;
      found = true;
      break;
    }
  }
  if (!found) {
    let best = 0;
    let bestAbs = Math.abs(dist[0]);
    for (let k = 1; k <= last; k++) {
      const a = Math.abs(dist[k]);
      if (a < bestAbs) {
        bestAbs = a;
        best = k;
      }
    }
    i = Math.min(last - 1, best);
  }

  const d0 = dist[i];
  const d1 = dist[i + 1];
  const w = Math.abs(d0 - d1) < 1e-18 ? 0 : d0 / (d0 - d1);
  const f = Math.min(1, Math.max(0, w));
  const a = LOCUS[i];
  const b = LOCUS[i + 1];
  const rMired = a.r * (1 - f) + b.r * f;
  const kelvin = 1e6 / Math.max(1e-6, rMired);

  const fFwd = 1 - f;
  const lu = a.u * fFwd + b.u * (1 - fFwd);
  const lv = a.v * fFwd + b.v * (1 - fFwd);
  let uu = dir[i][0] * fFwd + dir[i + 1][0] * (1 - fFwd);
  let vv = dir[i][1] * fFwd + dir[i + 1][1] * (1 - fFwd);
  const n = Math.hypot(uu, vv) || 1;
  uu /= n;
  vv /= n;
  const tint = ((u - lu) * uu + (v - lv) * vv) * 3000;
  return { kelvin: clampTemp(kelvin), tint: clampTint(tint) };
}

export function linearRgbToXy(
  r: number,
  g: number,
  b: number,
  space: WbWorkingSpace = "srgb",
): { x: number; y: number } {
  const m = space === "prophoto" ? PROPHOTO_TO_XYZ : SRGB_TO_XYZ;
  const xyz = mulMat3v(m, [Math.max(0, r), Math.max(0, g), Math.max(0, b)]);
  const s = xyz[0] + xyz[1] + xyz[2];
  if (s < 1e-12) return { x: 0.3127, y: 0.329 };
  return { x: xyz[0] / s, y: xyz[1] / s };
}

export function xyToLinearRgb(x: number, y: number, space: WbWorkingSpace = "srgb"): Vec3 {
  const xyz = xyToXyz(x, y);
  const m = space === "prophoto" ? XYZ_TO_PROPHOTO : XYZ_TO_SRGB;
  return mulMat3v(m, xyz);
}

/** Chromaticity the temperature slider calls neutral. */
const REF_WB_XYZ: Vec3 = xyToXyz(xyFromTempTint(5500, 0).x, xyFromTempTint(5500, 0).y);

export function rgbToTempTint(
  r: number,
  g: number,
  b: number,
  space: WbWorkingSpace = "srgb",
): { kelvin: number; tint: number } {
  const xy = linearRgbToXy(r, g, b, space);
  return tempTintFromXy(xy.x, xy.y);
}

/**
 * Temperature/tint to put on the slider so this linear RGB becomes neutral.
 * 5500/0 is identity. Equal-channel RGB (the encoding white) maps to 5500/0
 * in both spaces — not to its absolute CCT.
 */
export function rgbToWbSlider(
  r: number,
  g: number,
  b: number,
  space: WbWorkingSpace = "srgb",
): { kelvin: number; tint: number } {
  const rgbToXyz = space === "prophoto" ? PROPHOTO_TO_XYZ : SRGB_TO_XYZ;
  const measured = mulMat3v(rgbToXyz, [Math.max(0, r), Math.max(0, g), Math.max(0, b)]);
  const sum = measured[0] + measured[1] + measured[2];
  if (sum < 1e-8) return { kelvin: 5500, tint: 0 };
  const white = space === "prophoto" ? D50_XYZ : D65_XYZ;
  const cM = mulMat3v(BRADFORD, measured);
  const cR = mulMat3v(BRADFORD, REF_WB_XYZ);
  const cW = mulMat3v(BRADFORD, white);
  const cT: Vec3 = [
    cW[0] === 0 ? cR[0] : (cM[0] * cR[0]) / cW[0],
    cW[1] === 0 ? cR[1] : (cM[1] * cR[1]) / cW[1],
    cW[2] === 0 ? cR[2] : (cM[2] * cR[2]) / cW[2],
  ];
  const xyz = mulMat3v(BRADFORD_I, cT);
  const s = xyz[0] + xyz[1] + xyz[2];
  if (!(s > 1e-12)) return { kelvin: 5500, tint: 0 };
  return tempTintFromXy(xyz[0] / s, xyz[1] / s);
}

function bradfordCat(src: Vec3, dest: Vec3, rgbToXyz: Mat3, xyzToRgb: Mat3): Mat3 {
  const ls = mulMat3v(BRADFORD, src);
  const ld = mulMat3v(BRADFORD, dest);
  const scale: Mat3 = [
    [ld[0] / ls[0], 0, 0],
    [0, ld[1] / ls[1], 0],
    [0, 0, ld[2] / ls[2]],
  ];
  const tmp1 = mulMat3x3(BRADFORD, rgbToXyz);
  const tmp2 = mulMat3x3(scale, tmp1);
  const tmp3 = mulMat3x3(BRADFORD_I, tmp2);
  return mulMat3x3(xyzToRgb, tmp3);
}

export function whiteBalanceMatrix(
  temperature: number,
  tint: number,
  space: WbWorkingSpace | string = "srgb",
): Mat3 {
  if (Math.abs(temperature - 5500) < 0.5 && Math.abs(tint) < 0.05) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const xy = xyFromTempTint(temperature, tint);
  const src = xyToXyz(xy.x, xy.y);
  const prophoto = String(space).toLowerCase().includes("prophoto");
  return bradfordCat(
    src,
    REF_WB_XYZ,
    prophoto ? PROPHOTO_TO_XYZ : SRGB_TO_XYZ,
    prophoto ? XYZ_TO_PROPHOTO : XYZ_TO_SRGB,
  );
}

export function resolveWb(params: {
  whiteBalance?: string;
  temperature?: number;
  tint?: number;
}): { skip: boolean; kelvin: number; tint: number } {
  const mode = params.whiteBalance ?? "as_shot";
  if (mode === "as_shot") return { skip: true, kelvin: 5500, tint: 0 };
  if (mode === "daylight") return { skip: false, kelvin: 5500, tint: 0 };
  if (mode === "tungsten") return { skip: false, kelvin: 3200, tint: 0 };
  return {
    skip: false,
    kelvin: clampTemp(params.temperature ?? 5500),
    tint: clampTint(params.tint ?? 0),
  };
}

export function clampTemp(v: number): number {
  if (!Number.isFinite(v)) return 5500;
  return Math.min(WB_TMAX, Math.max(WB_TMIN, v));
}

export function clampTint(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(WB_TINT_MAX, Math.max(WB_TINT_MIN, v));
}

/**
 * Old UI stored tint as a 0.6–1.4 green multiplier (1 = neutral).
 * DNG tint is signed units around 0. Convert the old range once.
 */
export function sanitizeTint(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n >= 0.55 && n <= 1.45) return Math.round((n - 1) * (150 / 0.4));
  return clampTint(n);
}

export function sanitizeTemperature(v: unknown): number {
  return clampTemp(Number(v));
}

export function sanitizeWhiteBalance(v: unknown): "as_shot" | "daylight" | "tungsten" | "custom" {
  const s = String(v ?? "");
  if (s === "daylight" || s === "tungsten" || s === "custom" || s === "as_shot") return s;
  return "as_shot";
}
