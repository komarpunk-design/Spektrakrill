const RAW_EXT =
  /\.(cr2|cr3|crw|nef|nrw|arw|dng|raf|orf|rw2|pef|srw|x3f|3fr|fff|iiq|erf|mef|mos|raw|rwl|kdc|dcr|bay|mrw|sr2|srf)$/i;

export function isRawFile(file: File): boolean {
  if (RAW_EXT.test(file.name)) return true;
  return /raw|dng|x-canon|x-nikon|x-sony|x-panasonic|x-olympus|x-fuji|x-adobe/i.test(
    file.type,
  );
}

function u16(buf: Uint8Array, o: number, le: boolean): number {
  return le ? buf[o] | (buf[o + 1] << 8) : (buf[o] << 8) | buf[o + 1];
}

function u32(buf: Uint8Array, o: number, le: boolean): number {
  return le
    ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0
    : ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
}

function ascii(buf: Uint8Array, o: number, n: number): string {
  let s = "";
  const end = Math.min(buf.length, o + n);
  for (let i = o; i < end; i++) {
    const c = buf[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Parse one JPEG starting at `start` (must be FFD8).
 * Handles baseline + progressive (markers after the first SOS).
 */
export function readJpegAt(buf: Uint8Array, start: number): Uint8Array | null {
  if (start < 0 || start + 4 > buf.length) return null;
  if (buf[start] !== 0xff || buf[start + 1] !== 0xd8) return null;
  let i = start + 2;
  const n = buf.length;
  let inScan = false;
  while (i < n - 1) {
    if (buf[i] !== 0xff) {
      if (!inScan) return null;
      i++;
      continue;
    }
    while (i < n && buf[i] === 0xff) i++;
    if (i >= n) return null;
    const marker = buf[i++];
    if (marker === 0x00) {
      if (!inScan) continue;
      continue;
    }
    if (marker === 0xd9) return buf.subarray(start, i);
    if (marker === 0xd8) return null;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (i + 2 > n) return null;
    const len = (buf[i] << 8) | buf[i + 1];
    if (len < 2) return null;
    if (marker === 0xda) {
      i += len;
      inScan = true;
      continue;
    }
    i += len;
    inScan = false;
  }
  return null;
}

/** SOF: C0/C1/C2 displayable; C3 is lossless (CR2 sensor). */

function jpegSofSize(jpeg: Uint8Array): { sof: number; w: number; h: number } | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let i = 2;
  const n = jpeg.length;
  while (i < n - 8) {
    if (jpeg[i] !== 0xff) return null;
    while (i < n && jpeg[i] === 0xff) i++;
    if (i >= n) return null;
    const marker = jpeg[i++];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (i + 2 > n) return null;
    const len = (jpeg[i] << 8) | jpeg[i + 1];
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 7 > n) return null;
      const h = (jpeg[i + 3] << 8) | jpeg[i + 4];
      const w = (jpeg[i + 5] << 8) | jpeg[i + 6];
      return { sof: marker, w, h };
    }
    i += len;
  }
  return null;
}

function isDisplayableJpeg(jpeg: Uint8Array): boolean {
  const info = jpegSofSize(jpeg);
  if (!info) return false;
  if (info.sof !== 0xc0 && info.sof !== 0xc1 && info.sof !== 0xc2) return false;
  return info.w >= 32 && info.h >= 32;
}

function scoreJpeg(jpeg: Uint8Array): number {
  const info = jpegSofSize(jpeg);
  if (!info) return 0;
  if (info.sof !== 0xc0 && info.sof !== 0xc1 && info.sof !== 0xc2) return 0;
  return info.w * info.h;
}

function bestDisplayable(jpegs: Uint8Array[]): Uint8Array | null {
  let best: Uint8Array | null = null;
  let bestScore = 0;
  for (const j of jpegs) {
    const s = scoreJpeg(j);
    if (s > bestScore) {
      best = j;
      bestScore = s;
    }
  }
  return best;
}

function collectJpegScan(buf: Uint8Array, from = 0, to = buf.length): Uint8Array[] {
  const out: Uint8Array[] = [];
  const end = Math.min(to, buf.length);
  for (let i = from; i < end - 1; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8) continue;
    const jpeg = readJpegAt(buf, i);
    if (jpeg && jpeg.length >= 2_000) {
      out.push(jpeg);
      i += Math.max(1, jpeg.length - 1);
    }
  }
  return out;
}

function typeSize(type: number): number {
  switch (type) {
    case 1:
    case 2:
    case 6:
    case 7:
      return 1;
    case 3:
    case 8:
      return 2;
    case 4:
    case 9:
    case 11:
    case 13:
      return 4;
    case 5:
    case 10:
    case 12:
      return 8;
    default:
      return 1;
  }
}

function readInts(
  buf: Uint8Array,
  valOff: number,
  type: number,
  count: number,
  le: boolean,
): number[] {
  const size = typeSize(type);
  const bytes = count * size;
  let dataOff = valOff;
  if (bytes > 4) {
    dataOff = u32(buf, valOff, le);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = dataOff + i * size;
    if (o + size > buf.length) break;
    if (size === 1) out.push(buf[o]);
    else if (size === 2) out.push(u16(buf, o, le));
    else out.push(u32(buf, o, le));
  }
  return out;
}

function pushJpeg(found: Uint8Array[], buf: Uint8Array, off: number, len?: number) {
  if (off <= 0 || off + 4 > buf.length) return;
  const jpeg = readJpegAt(buf, off);
  if (jpeg) {
    found.push(jpeg);
    return;
  }
  if (len && len >= 2_000 && off + len <= buf.length && buf[off] === 0xff && buf[off + 1] === 0xd8) {
    found.push(buf.subarray(off, off + len));
  }
}

function collectTiffJpegs(buf: Uint8Array): Uint8Array[] {
  if (buf.length < 8) return [];
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  const be = buf[0] === 0x4d && buf[1] === 0x4d;
  if (!le && !be) return [];
  const fortyTwo = u16(buf, 2, le);
  if (fortyTwo !== 42) return [];
  const found: Uint8Array[] = [];
  const seen = new Set<number>();
  const queue: number[] = [u32(buf, 4, le)];
  const scanRegions: Array<[number, number]> = [];
  let hops = 0;
  while (queue.length && hops++ < 96) {
    const ifd = queue.pop()!;
    if (!ifd || seen.has(ifd) || ifd + 2 > buf.length) continue;
    seen.add(ifd);
    const entries = u16(buf, ifd, le);
    if (entries > 256) continue;
    const tableEnd = ifd + 2 + entries * 12;
    if (tableEnd + 4 > buf.length) continue;
    let jpegOff = 0;
    let jpegLen = 0;
    let compression = 0;
    let stripOffs: number[] = [];
    let stripLens: number[] = [];
    let tileOffs: number[] = [];
    let tileLens: number[] = [];
    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(buf, e, le);
      const type = u16(buf, e + 2, le);
      const count = u32(buf, e + 4, le);
      const ints = readInts(buf, e + 8, type, Math.min(count, 64), le);
      const first = ints[0] ?? 0;
      if (tag === 0x0103) compression = first;
      else if (tag === 0x0201) jpegOff = first;
      else if (tag === 0x0202) jpegLen = first;
      else if (tag === 0x0111) stripOffs = ints;
      else if (tag === 0x0117) stripLens = ints;
      else if (tag === 0x0144) tileOffs = ints;
      else if (tag === 0x0145) tileLens = ints;
      else if (
        tag === 0x014a ||
        tag === 0x8769 ||
        tag === 0x8825
      ) {
        for (const o of ints) if (o) queue.push(o);
      } else if (tag === 0x927c) {
        const size = typeSize(type) * count;
        let dataOff = e + 8;
        if (size > 4) dataOff = u32(buf, e + 8, le);
        if (dataOff && size > 0 && dataOff + Math.min(size, buf.length) > dataOff) {
          const end = Math.min(buf.length, dataOff + size);
          scanRegions.push([dataOff, end]);
        }
      }
    }
    const next = u32(buf, tableEnd, le);
    if (next) queue.push(next);

    if (jpegOff) pushJpeg(found, buf, jpegOff, jpegLen);

    const jpegish = compression === 6 || compression === 7;
    if (jpegish) {
      for (let s = 0; s < Math.min(stripOffs.length, Math.max(stripLens.length, 1)); s++) {
        const o = stripOffs[s];
        const l = stripLens[s] ?? 0;
        if (o) pushJpeg(found, buf, o, l);
      }
      for (let s = 0; s < Math.min(tileOffs.length, Math.max(tileLens.length, 1)); s++) {
        const o = tileOffs[s];
        const l = tileLens[s] ?? 0;
        if (o) pushJpeg(found, buf, o, l);
      }
    }

    // First strip/tile may still be a JPEG even when compression is Canon 6/7-odd or 34892.
    if (!jpegish && stripOffs[0]) {
      if (buf[stripOffs[0]] === 0xff && buf[stripOffs[0] + 1] === 0xd8) {
        pushJpeg(found, buf, stripOffs[0], stripLens[0]);
      }
    }
    if (!jpegish && tileOffs[0]) {
      if (buf[tileOffs[0]] === 0xff && buf[tileOffs[0] + 1] === 0xd8) {
        pushJpeg(found, buf, tileOffs[0], tileLens[0]);
      }
    }
  }

  for (const [a, b] of scanRegions) {
    if (b - a > 64 && b - a < 32_000_000) {
      found.push(...collectJpegScan(buf, a, b));
    }
  }
  return found;
}

function collectRafJpegs(buf: Uint8Array): Uint8Array[] {
  if (ascii(buf, 0, 8) !== "FUJIFILM") return [];
  const found: Uint8Array[] = [];
  for (const off of [84, 92, 100, 108, 120, 140]) {
    if (off + 8 > buf.length) continue;
    for (const endian of [false, true]) {
      const jpegOff = u32(buf, off, endian);
      const jpegLen = u32(buf, off + 4, endian);
      if (jpegOff > 16 && jpegLen > 2_000 && jpegOff + jpegLen <= buf.length) {
        pushJpeg(found, buf, jpegOff, jpegLen);
      }
    }
  }
  const jpegOffBe = buf.length > 92 ? u32(buf, 84, false) : 0;
  if (jpegOffBe > 16 && jpegOffBe < buf.length) {
    found.push(...collectJpegScan(buf, jpegOffBe, Math.min(buf.length, jpegOffBe + 8_000_000)));
  }
  return found;
}

const BMFF_CONTAINERS = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "uuid",
  "CRAW",
  "cctp",
  "cdsc",
  "moof",
  "traf",
  "dinf",
  "meta",
  "ipro",
]);

function collectBmffJpegs(buf: Uint8Array): Uint8Array[] {
  if (buf.length < 12) return [];
  if (ascii(buf, 4, 4) !== "ftyp") return [];
  const found: Uint8Array[] = [];
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 14) return;
    let i = start;
    while (i + 8 <= end) {
      let size = u32(buf, i, false);
      const type = ascii(buf, i + 4, 4);
      let header = 8;
      if (size === 1) {
        if (i + 16 > end) break;
        const hi = u32(buf, i + 8, false);
        const lo = u32(buf, i + 12, false);
        size = hi * 0x100000000 + lo;
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < header || i + size > end) break;
      const payload = i + header;
      const boxEnd = Math.min(end, i + size);
      if (BMFF_CONTAINERS.has(type)) walk(payload, boxEnd, depth + 1);
      const peek = Math.min(boxEnd, payload + 96);
      for (let p = payload; p < peek - 1; p++) {
        if (buf[p] === 0xff && buf[p + 1] === 0xd8) {
          const jpeg = readJpegAt(buf, p);
          if (jpeg) found.push(jpeg);
          break;
        }
      }
      if (
        type === "mdat" ||
        type === "PRVW" ||
        type === "THMB" ||
        type === "jpeg" ||
        type === "preview" ||
        type === "thmb"
      ) {
        found.push(...collectJpegScan(buf, payload, Math.min(boxEnd, payload + 12_000_000)));
      }
      i += size || 1;
    }
  };
  walk(0, buf.length, 0);
  return found;
}

function collectCandidates(buf: Uint8Array): Uint8Array[] {
  const structured = [
    ...collectTiffJpegs(buf),
    ...collectRafJpegs(buf),
    ...collectBmffJpegs(buf),
  ];
  if (structured.some(isDisplayableJpeg)) return structured;
  // Fallback: scan head + a mid window. Full-file scan on 60MB CR2 is too slow
  // and mostly hits lossless SOF3 sensor data.
  const windows: Array<[number, number]> = [[0, Math.min(buf.length, 8_000_000)]];
  if (buf.length > 10_000_000) {
    windows.push([Math.max(0, buf.length - 4_000_000), buf.length]);
  }
  const extra: Uint8Array[] = [];
  for (const [a, b] of windows) extra.push(...collectJpegScan(buf, a, b));
  return structured.concat(extra);
}

export function extractLargestJpeg(buf: Uint8Array): Uint8Array | null {
  return bestDisplayable(collectCandidates(buf));
}

export function sniffRawContainer(buf: Uint8Array): boolean {
  if (buf.length < 16) return false;
  if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) return true;
  if (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a) return true;
  if (ascii(buf, 4, 4) === "ftyp") return true;
  if (ascii(buf, 0, 8) === "FUJIFILM") return true;
  if (buf[0] === 0x00 && ascii(buf, 1, 3) === "MRM") return true;
  return false;
}

const MAX_DECODE_EDGE = 2400;

function fitEdge(w: number, h: number, max = MAX_DECODE_EDGE): { w: number; h: number } {
  const edge = Math.max(w, h);
  if (edge <= max) return { w, h };
  const s = max / edge;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function bytesToImageData(bytes: Uint8Array, mime: string): Promise<ImageData> {
  const copy = Uint8Array.from(bytes);
  const blob = new Blob([copy], { type: mime });
  const info = jpegSofSize(bytes);
  const target = info ? fitEdge(info.w, info.h) : null;

  const fromBitmap = async (): Promise<ImageData> => {
    const opts: ImageBitmapOptions = target
      ? { resizeWidth: target.w, resizeHeight: target.h, resizeQuality: "high" }
      : {};
    const bmp = await createImageBitmap(blob, opts);
    try {
      if (bmp.width < 8 || bmp.height < 8) throw new Error("tiny");
      const size = fitEdge(bmp.width, bmp.height);
      const c = document.createElement("canvas");
      c.width = size.w;
      c.height = size.h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bmp, 0, 0, size.w, size.h);
      return ctx.getImageData(0, 0, c.width, c.height);
    } finally {
      bmp.close();
    }
  };

  const fromImage = (): Promise<ImageData> => {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          if (img.naturalWidth < 8 || img.naturalHeight < 8) throw new Error("tiny");
          const size = fitEdge(img.naturalWidth, img.naturalHeight);
          const c = document.createElement("canvas");
          c.width = size.w;
          c.height = size.h;
          const ctx = c.getContext("2d");
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(img, 0, 0, size.w, size.h);
          resolve(ctx.getImageData(0, 0, c.width, c.height));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  };

  if (typeof createImageBitmap === "function") {
    return fromBitmap().catch(() => fromImage());
  }
  return fromImage();
}

async function tryJpegs(buf: Uint8Array): Promise<ImageData> {
  const list = collectCandidates(buf).filter(isDisplayableJpeg);
  list.sort((a, b) => scoreJpeg(b) - scoreJpeg(a));
  const seen = new Set<number>();
  for (const jpeg of list) {
    if (seen.has(jpeg.length)) continue;
    seen.add(jpeg.length);
    try {
      return await bytesToImageData(jpeg, "image/jpeg");
    } catch {
      /* try next preview */
    }
  }
  throw new Error("raw");
}

export async function decodeRawFile(file: File): Promise<ImageData> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length < 32) throw new Error("raw");
  return tryJpegs(buf);
}
