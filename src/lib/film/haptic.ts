/** Short ticks for sliders / engine chips. Native CLOCK_TICK, else vibrate(). */

import { Capacitor } from "@capacitor/core";
import { nativeHaptic } from "./native-raw";

export type HapticKind = "zero" | "edge" | "select" | "menu";

function webVibrate(kind: HapticKind): void {
  if (typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    if (kind === "zero") vibrate(16);
    else if (kind === "edge") vibrate(9);
    else if (kind === "menu") vibrate([10, 24, 14]);
    else vibrate(7);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: HapticKind = "select"): void {
  if (Capacitor.isNativePlatform()) {
    nativeHaptic(kind === "zero" ? "tick" : kind);
    return;
  }
  webVibrate(kind);
}

export function hapticSlider(prev: number, next: number, min: number, max: number): void {
  if (!Number.isFinite(next)) return;
  const hitMin = next <= min + 1e-9;
  const hitMax = next >= max - 1e-9;
  if (hitMin || hitMax) {
    haptic("edge");
    return;
  }
  if (min < -1e-6 && max > 1e-6) {
    const crossed = (prev < 0 && next >= 0) || (prev > 0 && next <= 0) || Math.abs(next) < 1e-6;
    if (crossed) haptic("zero");
  }
}
