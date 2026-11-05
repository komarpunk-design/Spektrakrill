import { luminance, srgbToLinear } from "./color";

/** Status-A visual density of 18% gray. */
export const MIDGRAY_D = -Math.log10(0.18);

export type DensitySample = {
  c: number;
  m: number;
  y: number;
  vis: number;
  dmin: number;
  dmax: number;
  hist: number[];
  spot: boolean;
};

function od(t: number): number {
  return -Math.log10(Math.max(t, 1e-4));
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Status-A densitometer on a print (sRGB 8-bit buffer).
 * C/M/Y = −log10 of linear R/G/B (Status-A red/green/blue filters).
 * Whole-frame mean, or a 9×9 spot when nx/ny are in 0…1 image space.
 */
export function samplePrintDensity(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  nx?: number,
  ny?: number,
): DensitySample {
  const spot = nx != null && ny != null;
  let x0 = 0;
  let y0 = 0;
  let x1 = w;
  let y1 = h;
  let step = Math.max(1, Math.round(Math.max(w, h) / 96));
  if (spot) {
    const cx = Math.max(0, Math.min(w - 1, Math.round(nx * w)));
    const cy = Math.max(0, Math.min(h - 1, Math.round(ny * h)));
    const r = 4;
    x0 = Math.max(0, cx - r);
    y0 = Math.max(0, cy - r);
    x1 = Math.min(w, cx + r + 1);
    y1 = Math.min(h, cy + r + 1);
    step = 1;
  }
  let sc = 0;
  let sm = 0;
  let sy = 0;
  let sv = 0;
  let n = 0;
  let dmin = 4;
  let dmax = 0;
  const bins = new Array<number>(24).fill(0);
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const r = srgbToLinear(data[i] / 255);
      const g = srgbToLinear(data[i + 1] / 255);
      const b = srgbToLinear(data[i + 2] / 255);
      const c = od(r);
      const m = od(g);
      const yel = od(b);
      const vis = od(luminance(r, g, b));
      sc += c;
      sm += m;
      sy += yel;
      sv += vis;
      n++;
      if (vis < dmin) dmin = vis;
      if (vis > dmax) dmax = vis;
      const bi = Math.max(0, Math.min(23, (vis / 2.4) * 24 | 0));
      bins[bi]++;
    }
  }
  const inv = n ? 1 / n : 0;
  const maxBin = Math.max(1, ...bins);
  return {
    c: sc * inv,
    m: sm * inv,
    y: sy * inv,
    vis: sv * inv,
    dmin: n ? dmin : 0,
    dmax: n ? dmax : 0,
    hist: bins.map((v) => clamp01(v / maxBin)),
    spot,
  };
}
