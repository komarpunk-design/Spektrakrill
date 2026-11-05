/** Separable Gaussian / box-approx blur on packed planar RGB. */

function gaussianKernel(sigma: number): Float32Array {
  const s = Math.max(0.01, sigma);
  const radius = Math.max(1, Math.min(64, Math.ceil(s * 3)));
  const k = new Float32Array(radius * 2 + 1);
  const a = 1 / (Math.sqrt(2 * Math.PI) * s);
  const b = -0.5 / (s * s);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = a * Math.exp(i * i * b);
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

let tmpA: Float32Array | null = null;
let tmpB: Float32Array | null = null;

function scratch(which: "a" | "b", n: number): Float32Array {
  if (which === "a") {
    if (!tmpA || tmpA.length < n) tmpA = new Float32Array(n);
    return tmpA;
  }
  if (!tmpB || tmpB.length < n) tmpB = new Float32Array(n);
  return tmpB;
}

function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if ((wl & 1) === 0) wl--;
  if (wl < 1) wl = 1;
  const wu = wl + 2;
  const mIdeal =
    (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const n = r + r + 1;
  const inv = 1 / n;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) {
      const xx = i < 0 ? 0 : i >= w ? w - 1 : i;
      acc += src[row + xx];
    }
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      const drop = x - r;
      const add = x + r + 1;
      const di = drop < 0 ? 0 : drop >= w ? w - 1 : drop;
      const ai = add < 0 ? 0 : add >= w ? w - 1 : add;
      acc += src[row + ai] - src[row + di];
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const n = r + r + 1;
  const inv = 1 / n;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) {
      const yy = i < 0 ? 0 : i >= h ? h - 1 : i;
      acc += src[yy * w + x];
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      const drop = y - r;
      const add = y + r + 1;
      const di = drop < 0 ? 0 : drop >= h ? h - 1 : drop;
      const ai = add < 0 ? 0 : add >= h ? h - 1 : add;
      acc += src[ai * w + x] - src[di * w + x];
    }
  }
}

function firBlur(
  src: Float32Array,
  w: number,
  h: number,
  sigma: number,
  dest: Float32Array,
): void {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) >> 1;
  const tmp = scratch("a", w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        const xs = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
        acc += src[row + xs] * k[i + r];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        const ys = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
        acc += tmp[ys * w + x] * k[i + r];
      }
      dest[y * w + x] = acc;
    }
  }
}

export function blurPlane(
  src: Float32Array,
  w: number,
  h: number,
  sigma: number,
  dest?: Float32Array,
): Float32Array {
  if (!Number.isFinite(sigma) || sigma < 0.15 || w < 1 || h < 1) {
    if (dest) {
      dest.set(src.subarray(0, w * h));
      return dest;
    }
    return src;
  }
  const cap = Math.min(96, Math.max(w, h) * 0.4);
  sigma = Math.min(cap, sigma);
  const out = dest ?? new Float32Array(w * h);
  if (sigma < 1.15) {
    firBlur(src, w, h, sigma, out);
    return out;
  }
  const boxes = boxesForGauss(sigma, 3);
  const horiz = scratch("a", w * h);
  const mid = scratch("b", w * h);
  let cur: Float32Array = src;
  for (let i = 0; i < boxes.length; i++) {
    const radius = Math.max(0, (boxes[i] - 1) >> 1);
    const last = i === boxes.length - 1;
    const vert = last ? out : mid;
    if (radius < 1) {
      if (cur !== vert) vert.set(cur.subarray(0, w * h));
      cur = vert;
      continue;
    }
    boxBlurH(cur, horiz, w, h, radius);
    boxBlurV(horiz, vert, w, h, radius);
    cur = vert;
  }
  return out;
}

export function blurRgb(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  sigma: number,
): [Float32Array, Float32Array, Float32Array] {
  return [blurPlane(r, w, h, sigma), blurPlane(g, w, h, sigma), blurPlane(b, w, h, sigma)];
}

export function mulAddPlane(
  dest: Float32Array,
  src: Float32Array,
  scale: number,
  add = 0,
): void {
  for (let i = 0; i < dest.length; i++) dest[i] = dest[i] * scale + src[i] * (1 - scale) + add;
}

let rngState = 123456789;

export function seedRng(seed: number): void {
  rngState = seed >>> 0 || 1;
}

export function randn(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  const u = ((rngState >>> 0) / 4294967296) * 0.99998 + 1e-5;
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  const v = (rngState >>> 0) / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function hashNoise(i: number, ch: number): number {
  let n = (i * 374761393 + ch * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  const u = ((n >>> 0) / 4294967296) * 0.99998 + 1e-5;
  n = (n * 1664525 + 1013904223) | 0;
  const v = (n >>> 0) / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
