import { Capacitor, registerPlugin } from "@capacitor/core";

type NativePick = {
  mode?: "linear" | "srgb";
  width: number;
  height: number;
  name: string;
  path?: string;
  size?: number;
  colorSpace?: string;
  raw?: boolean;
  sourceJpeg?: string;
  processedJpeg?: string;
  sourcePath?: string;
  processedPath?: string;
  ms?: number;
  engine?: string;
};

type NativeGalleryItem = {
  id?: string;
  name?: string;
  uri?: string;
  w?: number;
  h?: number;
  t?: number;
  thumb?: string;
  raw?: boolean;
  mime?: string;
};

type NativeSim = {
  jpeg: string;
  width: number;
  height: number;
  ms: number;
  engine?: string;
  mode?: "draft" | "lut" | "full";
  stale?: boolean;
  mime?: string;
  saved?: boolean;
  uri?: string;
  pending?: boolean;
  path?: string;
};

const RawDecoder = registerPlugin<{
  testPrint: (opts: {params: Record<string,unknown>; exposures: number[]}) => Promise<{images:{jpeg:string;width:number;height:number}[]}>;
  pickAndDecode: (opts: {
    maxEdge: number;
    cameraWb: boolean;
    params?: Record<string, unknown>;
  }) => Promise<NativePick>;
  simulate: (opts: {
    params: Record<string, unknown>;
    preview: boolean;
    export?: boolean;
    returnJpeg?: boolean;
  }) => Promise<NativeSim>;
  readChunk: (opts: { path: string; offset: number; length: number }) => Promise<{ data: string; n: number }>;
  releaseFile: (opts: { path: string }) => Promise<{ ok: boolean }>;
  saveJpeg: (opts: { name: string; data?: string; mime?: string }) => Promise<{ ok: boolean; uri?: string }>;
  listGallery: () => Promise<{ items?: NativeGalleryItem[] }>;
  loadGallery: (opts: { uri: string; maxEdge?: number }) => Promise<{ jpeg: string }>;
  engineInfo: () => Promise<{ ok: boolean; profiles?: string; hasImage?: boolean }>;
  cancel: () => Promise<{ ok: boolean }>;
  pickText: () => Promise<{ name: string; text: string }>;
  installUserProfile: (opts: { id: string; json: string }) => Promise<{ ok: boolean; id?: string }>;
  removeUserProfile: (opts: { id: string }) => Promise<{ ok: boolean }>;
  listUserProfiles: () => Promise<{ ids?: string[] }>;
  getLog: () => Promise<{ text: string }>;
  clearLog: () => Promise<{ ok: boolean }>;
  openUrl: (opts: { url: string }) => Promise<{ ok: boolean }>;
  haptic: (opts?: { kind?: string }) => Promise<{ ok: boolean }>;
  keepStockSource: (opts: { id: string }) => Promise<{
    ok: boolean;
    raw?: boolean;
    name?: string;
    width?: number;
    height?: number;
    size?: number;
  }>;
  dropStockSource: (opts: { id: string }) => Promise<{ ok: boolean }>;
  exportStock: (opts: {
    id: string;
    params: Record<string, unknown>;
    raw?: boolean;
  }) => Promise<NativeSim>;
  loadStockSource: (opts: {
    id: string;
    name?: string;
    maxEdge?: number;
    params?: Record<string, unknown>;
  }) => Promise<NativePick>;
  libraryAccess: () => Promise<{ granted?: boolean; limited?: boolean }>;
  listPhone: (opts: { offset?: number; limit?: number }) => Promise<{
    granted?: boolean;
    limited?: boolean;
    more?: boolean;
    items?: NativeGalleryItem[];
  }>;
  openLibrary: (opts: {
    uri: string;
    maxEdge: number;
    params?: Record<string, unknown>;
  }) => Promise<NativePick>;
  wbBase: (opts: { maxEdge?: number }) => Promise<{ path?: string; jpeg?: string; base?: string }>;
  exportStatus: () => Promise<{
    pending?: boolean;
    idle?: boolean;
    ok?: boolean;
    saved?: boolean;
    error?: string;
    jpeg?: string;
    width?: number;
    height?: number;
    ms?: number;
    uri?: string;
    t?: number;
  }>;
}>("RawDecoder");

export function isNativeEngineAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeRawAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export type DecodedNative = {
  mode: "linear" | "srgb" | "engine";
  width: number;
  height: number;
  name: string;
  bytes?: Uint8Array;
  sourceJpeg?: string;
  processedJpeg?: string;
  ms?: number;
  engine?: string;
  raw?: boolean;
  path?: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const n = bin.length;
  const out = new Uint8Array(n);
  let i = 0;
  for (; i + 3 < n; i += 4) {
    out[i] = bin.charCodeAt(i);
    out[i + 1] = bin.charCodeAt(i + 1);
    out[i + 2] = bin.charCodeAt(i + 2);
    out[i + 3] = bin.charCodeAt(i + 3);
  }
  for (; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

export function jpegB64ToObjectUrl(b64: string): string {
  const bytes = b64ToBytes(b64);
  const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

export function nativeImageUrl(res: { path?: string; jpeg?: string }): string | null {
  if (res.path && Capacitor.isNativePlatform()) {
    try {
      const src = Capacitor.convertFileSrc(res.path);
      if (src) return `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
    } catch {
      /* fall through */
    }
  }
  if (res.jpeg) return jpegB64ToObjectUrl(res.jpeg);
  return null;
}

function asDecoded(res: NativePick, fallbackName: string): DecodedNative {
  const sourceJpeg = nativeImageUrl({ path: res.sourcePath, jpeg: res.sourceJpeg }) ?? undefined;
  const processedJpeg = nativeImageUrl({ path: res.processedPath, jpeg: res.processedJpeg }) ?? undefined;
  return {
    mode: "engine",
    width: res.width,
    height: res.height,
    name: res.name || fallbackName,
    sourceJpeg,
    processedJpeg,
    ms: res.ms,
    engine: res.engine,
    raw: Boolean(res.raw),
    path: res.path,
  };
}

export async function pickNativeRaw(
  maxEdge: number,
  cameraWb: boolean,
  params?: Record<string, unknown>,
): Promise<DecodedNative> {
  const res = await RawDecoder.pickAndDecode({ maxEdge, cameraWb, params });
  if (res?.processedJpeg || res?.sourceJpeg || res?.sourcePath || res?.processedPath) {
    return asDecoded(res, "capture.raw");
  }
  if (!res?.path || res.width < 8 || res.height < 8) {
    throw new Error("raw");
  }
  return {
    mode: res.mode === "srgb" ? "srgb" : "linear",
    width: res.width,
    height: res.height,
    name: res.name || "capture.raw",
  };
}

let pollEpoch = 0;

function bumpExportPoll(): void {
  pollEpoch += 1;
}

export async function simulateNative(
  params: Record<string, unknown>,
  preview: boolean,
  exp = false,
  returnJpeg = true,
): Promise<{
  jpeg: string;
  width: number;
  height: number;
  ms: number;
  mode?: "draft" | "lut" | "full";
  stale?: boolean;
  saved?: boolean;
  uri?: string;
  pending?: boolean;
  path?: string;
}> {
  if (exp) bumpExportPoll();
  const res = await RawDecoder.simulate({ params, preview, export: exp, returnJpeg });
  if (res?.stale) {
    if (exp) throw new Error("cancelled");
    return { jpeg: "", width: 0, height: 0, ms: 0, stale: true };
  }
  if (exp && res?.pending) {
    const done = await pollNativeExport();
    if (!done) throw new Error("export");
    return done;
  }
  if (returnJpeg && !res?.jpeg && !res?.path) throw new Error("simulate");
  return res;
}

export async function pollNativeExport(
  onTick?: () => void,
): Promise<{
  jpeg: string;
  width: number;
  height: number;
  ms: number;
  saved?: boolean;
  uri?: string;
  mode?: "draft" | "lut" | "full";
} | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const epoch = pollEpoch;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    if (epoch !== pollEpoch) throw new Error("cancelled");
    const st = await RawDecoder.exportStatus();
    if (st?.pending) {
      onTick?.();
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    if (st?.idle) throw new Error("export");
    if (st?.error && !st.ok && !st.saved) throw new Error(st.error);
    if (st?.ok || st?.saved) {
      return {
        jpeg: "",
        width: st.width || 0,
        height: st.height || 0,
        ms: st.ms || 0,
        saved: true,
        uri: st.uri,
        mode: "full",
      };
    }
    return null;
  }
  throw new Error("Экспорт занял слишком много времени");
}

export async function peekNativeExport(): Promise<{
  pending?: boolean;
  idle?: boolean;
  ok?: boolean;
  saved?: boolean;
  error?: string;
  width?: number;
  height?: number;
  t?: number;
} | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await RawDecoder.exportStatus();
  } catch {
    return null;
  }
}

export async function pickNativeText(): Promise<{ name: string; text: string }> {
  const e = await RawDecoder.pickText();
  if (!e?.text) throw new Error("empty");
  return { name: e.name || "preset.json", text: e.text };
}

export async function installNativeUserProfile(id: string, json: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await RawDecoder.installUserProfile({ id, json });
}

export async function removeNativeUserProfile(id: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await RawDecoder.removeUserProfile({ id });
}

export async function cancelNative(): Promise<void> {
  bumpExportPoll();
  if (Capacitor.isNativePlatform()) {
    try {
      await RawDecoder.cancel();
    } catch {
      /* ignore */
    }
  }
}

export async function saveNativeJpeg(
  name: string,
  blob?: Blob,
  mime?: string,
): Promise<{ uri?: string }> {
  let data: string | undefined;
  if (blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength >= 32) data = bytesToB64(bytes);
  }
  const i = await RawDecoder.saveJpeg({ name, data, mime });
  if (!i?.ok) throw new Error("save");
  return { uri: i.uri };
}

export async function requestPhoneLibrary(): Promise<{ granted: boolean; limited: boolean }> {
  if (!Capacitor.isNativePlatform()) return { granted: false, limited: false };
  try {
    const r = await RawDecoder.libraryAccess();
    return { granted: Boolean(r?.granted), limited: Boolean(r?.limited) };
  } catch {
    return { granted: false, limited: false };
  }
}

export type PhoneShot = {
  id: string;
  name: string;
  uri: string;
  at: number;
  w: number;
  h: number;
  raw: boolean;
  thumb: string;
};

export async function listPhoneLibrary(
  offset = 0,
  limit = 48,
): Promise<{ granted: boolean; limited: boolean; more: boolean; items: PhoneShot[] }> {
  if (!Capacitor.isNativePlatform()) return { granted: false, limited: false, more: false, items: [] };
  try {
    const e = await RawDecoder.listPhone({ offset, limit });
    const items = (Array.isArray(e?.items) ? e.items : [])
      .filter((item) => item && item.uri)
      .map((item, i) => ({
        id: String(item.id || item.uri || i),
        name: String(item.name || "кадр"),
        uri: String(item.uri),
        at: Number(item.t) || 0,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0,
        raw: Boolean(item.raw),
        thumb: item.thumb ? `data:image/jpeg;base64,${item.thumb}` : "",
      }));
    return {
      granted: Boolean(e?.granted),
      limited: Boolean(e?.limited),
      more: Boolean(e?.more),
      items,
    };
  } catch {
    return { granted: false, limited: false, more: false, items: [] };
  }
}

export async function openNativeLibrary(
  uri: string,
  maxEdge: number,
  params?: Record<string, unknown>,
): Promise<DecodedNative> {
  const res = await RawDecoder.openLibrary({ uri, maxEdge, params });
  if (res?.processedJpeg || res?.sourceJpeg || res?.sourcePath || res?.processedPath) {
    return asDecoded(res, "frame.jpg");
  }
  throw new Error("raw");
}

/** Daylight RAW base (or the open JPEG), the buffer the temperature slider corrects. */
export async function nativeWbBase(maxEdge: number): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const res = await RawDecoder.wbBase({ maxEdge });
    return nativeImageUrl({ path: res?.path, jpeg: res?.jpeg });
  } catch {
    return null;
  }
}

export async function listNativeGallery(): Promise<
  { id: string; name: string; at: number; w: number; h: number; uri?: string; thumb: string }[]
> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const e = await RawDecoder.listGallery();
    return (Array.isArray(e?.items) ? e.items : [])
      .filter((item) => item && (item.thumb || item.uri))
      .map((item, t) => ({
        id: String(item.id || item.uri || t),
        name: String(item.name || "кадр"),
        at: Number(item.t) || 0,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0,
        uri: item.uri || undefined,
        thumb: item.thumb ? `data:image/jpeg;base64,${item.thumb}` : "",
      }));
  } catch {
    return [];
  }
}

export async function loadNativeGalleryJpeg(uri: string, maxEdge = 960): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || !uri) return null;
  try {
    const n = await RawDecoder.loadGallery({ uri, maxEdge });
    return n?.jpeg ? `data:image/jpeg;base64,${n.jpeg}` : null;
  } catch {
    return null;
  }
}

export async function getNativeLog(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return "";
  try {
    return (await RawDecoder.getLog())?.text || "";
  } catch (e) {
    return `(native log failed: ${e instanceof Error ? e.message : String(e)})`;
  }
}

export async function clearNativeLog(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await RawDecoder.clearLog();
    } catch {
      /* ignore */
    }
  }
}

export function nativeHaptic(kind?: string): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  RawDecoder.haptic({ kind }).catch(() => {});
  return true;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await RawDecoder.openUrl({ url });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function keepNativeStockSource(id: string): Promise<{
  raw: boolean;
  name: string;
  width: number;
  height: number;
}> {
  const t = await RawDecoder.keepStockSource({ id });
  if (!t?.ok) throw new Error("stock");
  return {
    raw: Boolean(t.raw),
    name: t.name || "frame",
    width: Number(t.width) || 0,
    height: Number(t.height) || 0,
  };
}

export async function dropNativeStockSource(id: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await RawDecoder.dropStockSource({ id });
    } catch {
      /* ignore */
    }
  }
}

export async function exportNativeStock(
  id: string,
  params: Record<string, unknown>,
  raw?: boolean,
): Promise<{ width: number; height: number; ms: number; saved?: boolean; uri?: string }> {
  bumpExportPoll();
  const r = await RawDecoder.exportStock({ id, params, raw });
  if (r?.pending) {
    const done = await pollNativeExport();
    if (!done) throw new Error("export");
    return done;
  }
  if (!r?.saved && !r?.uri) throw new Error("export");
  return { width: r.width || 0, height: r.height || 0, ms: r.ms || 0, saved: r.saved, uri: r.uri };
}

export async function loadNativeStockSource(
  id: string,
  name: string,
  maxEdge: number,
  params?: Record<string, unknown>,
): Promise<DecodedNative> {
  const i = await RawDecoder.loadStockSource({ id, name, maxEdge, params });
  if (!i?.sourceJpeg && !i?.processedJpeg && !i?.sourcePath && !i?.processedPath) {
    throw new Error("stock missing");
  }
  return asDecoded(i, name || "frame");
}

/** Separate native batch; it never publishes files or replaces the editor preview. */
export async function nativeTestPrint(params: Record<string,unknown>, exposures: number[]) {
  return (await RawDecoder.testPrint({params, exposures})).images;
}
