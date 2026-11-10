/** GPLv3. Negs core/prep.rs and prep/guided.rs @26c903b.
 * Original integration: yosoyelchris d2a144d, maintained by Noah Haasis.
 * Browser uses linear sRGB; Android applies the same controls in ProPhoto via Bradford.
 */
export const defaultPrep = () => ({
  exposure: 0,
  highlights: 0,
  shadows: 0,
  contrast: 0,
  lift: 0,
  gain: 0,
  colorBoost: 0,
  saturation: 0,
  detail: 0,
});
export type PrepParams = ReturnType<typeof defaultPrep>;
export function sanitizePrep(value: unknown): PrepParams {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = defaultPrep();
  for (const key of Object.keys(out) as (keyof PrepParams)[]) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v))
      out[key] = Math.max(
        key === "exposure" ? -3 : key === "highlights" ? -180 : -100,
        Math.min(key === "exposure" ? 3 : 100, v),
      );
  }
  return out;
}
export const prepNeeded = (p: PrepParams) => Object.values(p).some((x) => x !== 0);
const f = Math.fround,
  clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function box(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length),
    out = new Float32Array(src.length),
    d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[y * w + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / d;
      sum += src[y * w + Math.min(x + r + 1, w - 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / d;
      sum += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
function resize(src: Float32Array, w: number, h: number, dw: number, dh: number) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const cx = clamp(f(f(f(x * f(1 / dw)) + f(0.5 * f(1 / dw))) * w) - 0.5, 0, w - 1),
        cy = clamp(f(f(f(y * f(1 / dh)) + f(0.5 * f(1 / dh))) * h) - 0.5, 0, h - 1),
        x0 = Math.floor(cx),
        x1 = Math.min(x0 + 1, w - 1),
        y0 = Math.floor(cy),
        y1 = Math.min(y0 + 1, h - 1),
        tx = cx - x0,
        ty = cy - y0;
      const top = f(src[y0 * w + x0] + f(f(src[y0 * w + x1] - src[y0 * w + x0]) * tx)),
        bottom = f(src[y1 * w + x0] + f(f(src[y1 * w + x1] - src[y1 * w + x0]) * tx));
      out[y * dw + x] = f(top + f(f(bottom - top) * ty));
    }
  return out;
}
export function guidedPrepBase(lum: Float32Array, w: number, h: number): Float32Array {
  if (w < 1 || h < 1 || lum.length !== w * h) throw new Error("Неверный размер кадра Prep");
  for (const v of lum)
    if (!Number.isFinite(v) || !Number.isFinite(f(v * v)))
      throw new Error("Некорректные пиксели Prep");
  const radius = Math.ceil(f(f(Math.max(w, h) * f(0.02)) * f(0.5)));
  let sub = clamp(Math.floor(w / 320), 1, 4);
  if (sub > radius || h < sub) sub = 1;
  const lw = Math.floor(w / sub),
    lh = Math.floor(h / sub),
    r = Math.max(Math.floor(radius / sub), 1),
    small = sub === 1 ? lum : resize(lum, w, h, lw, lh),
    square = Float32Array.from(small, (v) => f(v * v));
  let b = box(small, lw, lh, r),
    a = box(square, lw, lh, r);
  for (let i = 0; i < a.length; i++) {
    const variance = Math.max(f(a[i] - f(b[i] * b[i])), 0);
    a[i] = f(variance / Math.max(f(variance + f(0.01)), f(0.0001)));
    b[i] = f(b[i] - f(a[i] * b[i]));
  }
  a = box(a, lw, lh, r);
  b = box(b, lw, lh, r);
  if (sub !== 1) {
    a = resize(a, lw, lh, w, h);
    b = resize(b, lw, lh, w, h);
  }
  return Float32Array.from(lum, (v, i) => f(f(a[i] * v) + b[i]));
}
function tone(p: PrepParams) {
  const lut = new Float32Array(1024),
    he = f(2 ** f(1.5 * f(p.highlights / 100))),
    se = f(2 ** f(-f(p.shadows / 200) * 1.5)),
    den = f(0.5 ** se);
  let x = 0;
  for (let i = 0; i < 1024; i++) {
    const h = f(f(1 - x) ** he),
      s = x > 0.5 ? x : f(0.5 * f(f(x ** se) / den));
    lut[i] = f(s * f(1 - x) + f(x * f(1 - h)));
    x = f(x + f(1 / 1023));
  }
  const smooth = (start: number, step: number, values: number[]) => {
    const [p0, p1, p2, p3] = values,
      a = -0.5 * p0 + 0.5 * p2,
      b = -0.5 * p3 + 2 * p2 - 2.5 * p1 + p0,
      c = 0.5 * p3 - 1.5 * p2 - 0.5 * p0 + 1.5 * p1;
    for (let j = 1; j < step; j++) {
      const t = j / step;
      lut[start + j] = ((c * t + b) * t + a) * t + p1;
    }
  };
  smooth(480, 64, [lut[416], lut[480], lut[544], lut[608]]);
  smooth(959, 64, [lut[895], lut[959], lut[1023], lut[1023] + 64 / 1024]);
  return lut;
}
function sample(lut: Float32Array, x: number) {
  const v = clamp(x * 1024 - 0.5, 0, 1023),
    i = Math.floor(v),
    j = Math.min(i + 1, 1023);
  return lut[i] + (lut[j] - lut[i]) * (v - i);
}
function toneSample(lut: Float32Array, x: number) {
  if (x > 1) {
    const y = sample(lut, 1);
    return y + ((y - sample(lut, 0.875)) / 0.125) * (x - 1);
  }
  if (x < 0) {
    const y = sample(lut, 0);
    return y + ((sample(lut, 0.125) - y) / 0.125) * x;
  }
  return sample(lut, x);
}
export function applyPrep(
  image: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array },
  p: PrepParams,
) {
  if (!prepNeeded(p)) return;
  const planes = [image.r, image.g, image.b],
    n = image.w * image.h;
  if (p.exposure)
    for (const plane of planes) for (let i = 0; i < n; i++) plane[i] *= 2 ** p.exposure;
  if (Object.entries(p).every(([k, v]) => k === "exposure" || v === 0)) return;
  const encode = (x: number) => (x <= 0.018 ? 4.5 * x : 1.099 * x ** 0.45 - 0.099),
    decode = (x: number) => (x <= 0.081 ? x / 4.5 : ((x + 0.099) / 1.099) ** (1 / 0.45));
  const encoded = planes.map((plane) => Float32Array.from(plane, encode)),
    lum = Float32Array.from(image.r, (_, i) =>
      f(
        f(f(encoded[0][i] * f(0.2126)) + f(encoded[1][i] * f(0.7152))) +
          f(encoded[2][i] * f(0.0722)),
      ),
    ),
    base = guidedPrepBase(lum, image.w, image.h),
    lut = tone(p),
    top = 1 / Math.max(10 ** (p.gain / 100), 0.001),
    lift = Math.min((2 * p.lift) / 100, 0.999),
    bottom = Math.min(lift / (lift - 1), top - 0.005),
    mul = 1 / (top - bottom),
    add = -bottom / (top - bottom),
    contrast = 1.5 ** (p.contrast / 100);
  for (let i = 0; i < n; i++) {
    const red = encoded[0][i] * 0.5,
      green = encoded[1][i] * 0.5,
      blue = encoded[2][i] * 0.5;
    let y = red * 0.2126 + green * 0.7152 + blue * 0.0722,
      a = red * 0.5 - green * 0.25 - blue * 0.25,
      b = (green - blue) * 0.433012701892219,
      c = Math.hypot(a, b),
      hue = Math.atan2(b, a);
    const background = base[i] * 0.5,
      detail = y - background,
      mapped = toneSample(lut, background),
      ratio = Math.abs(background) > 0.00001 ? clamp(mapped / background, 1, 4) : 1;
    y = mapped + ratio * detail;
    c *= ratio;
    y += ((detail * p.detail) / 100) * Math.max(y * (1 - y), 0) * 4;
    const boost = p.colorBoost / 100,
      weight = boost >= 0 ? 0.7 * boost : boost;
    if (weight) c = Math.max(c + c ** 0.4 * weight * 0.25, 0);
    c = Math.max(c * (1 + p.saturation / 100), 0);
    let out = [y, y, y];
    if (c > 0) {
      a = c * Math.cos(hue);
      b = c * Math.sin(hue);
      out = [
        y + (a * 4) / 3,
        y - (a * 2) / 3 + b * 1.154700538379252,
        y - (a * 2) / 3 - b * 1.154700538379252,
      ];
      const correction = y - (out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722);
      out = out.map((x) => x + correction);
    }
    for (let channel = 0; channel < 3; channel++) {
      const value = decode(((2 * out[channel] - 0.5) * contrast + 0.5) * mul + add);
      if (!Number.isFinite(value)) throw new Error("Подготовка дала некорректный пиксель");
      planes[channel][i] = value;
    }
  }
}
