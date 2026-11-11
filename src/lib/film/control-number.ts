// One quantizer for drag, keyboard and numeric entry. Steps start at the
// declared minimum, e.g. LUT 9…33 / 4 means 9, 13, 17, 21, 25, 29, 33.
export function quantizeControl(value: number, min: number, max: number, step: number): number {
  const decimals = (n: number) => {
    const [mantissa, exponent = "0"] = String(n).toLowerCase().split("e");
    return Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
  };
  const precision = Math.min(12, Math.max(decimals(min), decimals(step)));
  const snapped = Number((min + Math.round((value - min) / step) * step).toFixed(precision));
  return Math.min(max, Math.max(min, snapped));
}
