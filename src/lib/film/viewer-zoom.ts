/** Pixel-for-pixel viewing, adapted to CSS/device pixel coordinates from the
 * native viewer in Spektrafilm-android. See THIRD_PARTY_NOTICES.md. */
export function actualPixelScale(sourceWidth: number, fittedCssWidth: number, dpr = 1): number {
  if (![sourceWidth, fittedCssWidth, dpr].every(n => Number.isFinite(n) && n > 0)) return 1;
  return sourceWidth / (fittedCssWidth * dpr);
}
export function clampViewerScale(scale: number, actual: number): number {
  if (!Number.isFinite(scale) || !Number.isFinite(actual) || actual <= 0) return 1;
  return Math.max(Math.min(1, actual), Math.min(Math.max(8, actual), scale));
}
