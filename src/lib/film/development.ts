import { interpCurve } from "./color.ts";
import type { FilmProfile } from "./types.ts";

/** Exposure-index ratio relative to the chosen stock, NOT a sensitivity gain. */
export function exposureIndexRatio(cameraEv: number): number {
  return 2 ** -cameraEv;
}

export function developmentMode(gamma: number): "Pull" | "Норма" | "Push" {
  return gamma < 1 - 1e-6 ? "Pull" : gamma > 1 + 1e-6 ? "Push" : "Норма";
}

/** Same characteristic-axis transform as Spektrafilm's
 * interpolate_exposure_to_density: xp = log_exposure / gamma.
 * This is a diagram of density formation, not a display-gamma operation.
 */
export function developmentCurve(
  profile: FilmProfile,
  gamma: number,
  cameraEv: number,
  channel: number,
): [number, number][] {
  const { min, max } = profile.logExposure;
  return Array.from({ length: 129 }, (_, index) => {
    const x = min + ((max - min) * index) / 128;
    return [
      x,
      interpCurve(x + cameraEv * Math.log10(2), profile.densityCurves, min, max, channel, gamma),
    ];
  });
}
