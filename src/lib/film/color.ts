import type { Mat3, Vec3 } from "./types";
import { whiteBalanceMatrix as wbMatrix } from "./wb-temp-tint";

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const x = Math.max(0, c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function mulMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mulMat3T(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function whiteBalanceMatrix(
  temperature: number,
  tint: number,
  space: "srgb" | "prophoto" | string = "srgb",
): Mat3 {
  return wbMatrix(temperature, tint, space);
}

export function interpCurve(
  logE: number,
  curves: Vec3[],
  lo: number,
  hi: number,
  channel: number,
  gamma: number,
): number {
  const n = curves.length;
  if (n < 2) return 0;
  const x = (logE * gamma - lo) / (hi - lo);
  const f = x * (n - 1);
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i0));
  return lerp(curves[i0][channel], curves[i0 + 1][channel], t);
}

export function softClip(x: number): number {
  if (x <= 0.9) return Math.max(0, x);
  const t = x - 0.9;
  return 0.9 + t / (1 + t * 4);
}
