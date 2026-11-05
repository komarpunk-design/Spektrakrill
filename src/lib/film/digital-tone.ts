import type { DarkroomParams } from "./types.ts";

const EPS = 1e-4;
const MID = 0.184;

export type DigitalTone = {
  toneBrightness: number;
  toneContrast: number;
  toneSaturation: number;
  toneHighlights: number;
  toneShadows: number;
  toneWarmth: number;
};

type RgbPlanes = { r: Float32Array; g: Float32Array; b: Float32Array };

export const defaultDigitalTone = (): DigitalTone => ({
  toneBrightness: 0,
  toneContrast: 0,
  toneSaturation: 0,
  toneHighlights: 0,
  toneShadows: 0,
  toneWarmth: 0,
});

export function clampTone(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

export function sanitizeDigitalTone<T extends Partial<DigitalTone>>(p: T): T {
  p.toneBrightness = clampTone(p.toneBrightness);
  p.toneContrast = clampTone(p.toneContrast);
  p.toneSaturation = clampTone(p.toneSaturation);
  p.toneHighlights = clampTone(p.toneHighlights);
  p.toneShadows = clampTone(p.toneShadows);
  p.toneWarmth = clampTone(p.toneWarmth);
  return p;
}

export function digitalToneNeeded(p: Partial<DigitalTone> | null | undefined): boolean {
  if (!p) return false;
  return (
    Math.abs(p.toneBrightness ?? 0) > EPS ||
    Math.abs(p.toneContrast ?? 0) > EPS ||
    Math.abs(p.toneSaturation ?? 0) > EPS ||
    Math.abs(p.toneHighlights ?? 0) > EPS ||
    Math.abs(p.toneShadows ?? 0) > EPS ||
    Math.abs(p.toneWarmth ?? 0) > EPS
  );
}

/**
 * RGB grade for the no-film path (Hasselblad / Lumix / Adobe / plain RAW).
 * Identity when every slider is 0 — never call this on the 81-band film route.
 */
export function applyDigitalTone(img: RgbPlanes, p: DarkroomParams): void {
  if (!digitalToneNeeded(p)) return;
  const br = 2 ** p.toneBrightness;
  const c = 1 + p.toneContrast;
  const s = 1 + p.toneSaturation;
  const hi = p.toneHighlights * 0.85;
  const sh = p.toneShadows * 0.85;
  const w = p.toneWarmth;
  const wr = 1 + 0.14 * w;
  const wg = 1 + 0.02 * w;
  const wb = 1 - 0.14 * w;
  const n = img.r.length;
  for (let i = 0; i < n; i++) {
    let r = img.r[i] * br;
    let g = img.g[i] * br;
    let b = img.b[i] * br;
    r = MID + (r - MID) * c;
    g = MID + (g - MID) * c;
    b = MID + (b - MID) * c;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * s;
    g = y + (g - y) * s;
    b = y + (b - y) * s;
    const t = y / (y + MID + 1e-8);
    const lift = 1 + sh * (1 - t) + hi * t;
    img.r[i] = r * lift * wr;
    img.g[i] = g * lift * wg;
    img.b[i] = b * lift * wb;
  }
}
