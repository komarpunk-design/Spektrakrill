import { defaultParams, sanitizeParams } from "./defaults.ts";
import { engineChipLabel } from "./engine-slots.ts";
import { sanitizeRawEngine } from "./raw-engine.ts";
import { boxShortName, isFilmBypass, type DarkroomParams } from "./types.ts";

const KEY = "spektrafilm-stock";
export const STOCK_CAP = 16;

export type StockStatus = "queued" | "exporting" | "done" | "error";

export type StockItem = {
  id: string;
  name: string;
  at: number;
  w: number;
  h: number;
  thumb: string;
  params: DarkroomParams;
  native: boolean;
  raw: boolean;
  status: StockStatus;
  error?: string;
  exportedUri?: string;
};

const DB_NAME = "spektrafilm-stock";
const DB_STORE = "blobs";

export function makeStockId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function stockLookLabel(params: DarkroomParams): string {
  const engine = sanitizeRawEngine(params.rawEngine);
  if (engine !== "spektrafilm") return engineChipLabel(engine);
  if (isFilmBypass(params.filmStock)) return "Исходник";
  const titled = String(params.filmStock || "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return boxShortName(titled) || "Плёнка";
}

function isItem(v: unknown): v is StockItem {
  if (!v || typeof v !== "object") return false;
  const o = v as StockItem;
  return typeof o.id === "string" && typeof o.name === "string" && o.params != null;
}

function coerceStatus(v: unknown): StockStatus {
  if (v === "done" || v === "error" || v === "queued") return v;
  return "queued";
}

function sanitizeItem(raw: unknown): StockItem | null {
  if (!isItem(raw)) return null;
  const params = sanitizeParams({
    ...defaultParams(),
    ...raw.params,
    cameraDiffusion: raw.params?.cameraDiffusion,
    printDiffusion: raw.params?.printDiffusion,
  });
  return {
    id: String(raw.id),
    name: String(raw.name || "кадр"),
    at: Number(raw.at) || Date.now(),
    w: Number(raw.w) || 0,
    h: Number(raw.h) || 0,
    thumb: typeof raw.thumb === "string" ? raw.thumb : "",
    params,
    native: Boolean(raw.native),
    raw: Boolean(raw.raw),
    status: coerceStatus(raw.status),
    error: typeof raw.error === "string" ? raw.error : undefined,
    exportedUri: typeof raw.exportedUri === "string" ? raw.exportedUri : undefined,
  };
}

function read(): StockItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeItem).filter((x): x is StockItem => x != null).slice(0, STOCK_CAP);
  } catch {
    return [];
  }
}

function write(items: StockItem[]): StockItem[] {
  const next = items.slice(0, STOCK_CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    try {
      const slim = next.map((s, i) => (i < 8 ? s : { ...s, thumb: s.thumb.slice(0, 40_000) }));
      localStorage.setItem(KEY, JSON.stringify(slim));
      return slim;
    } catch {
      return next;
    }
  }
}

export function loadStock(): StockItem[] {
  return read();
}

export function queuedStock(items: StockItem[] = read()): StockItem[] {
  return items.filter((s) => s.status === "queued" || s.status === "error");
}

export function reviveStockExports(): StockItem[] {
  return write(read());
}

export function addStockItem(item: StockItem): { ok: true; items: StockItem[] } | { ok: false; items: StockItem[]; reason: "full" } {
  const prev = read().filter((s) => s.id !== item.id);
  if (prev.length >= STOCK_CAP) return { ok: false, items: prev, reason: "full" };
  const next = write([item, ...prev]);
  return { ok: true, items: next };
}

export function patchStock(id: string, partial: Partial<StockItem>): StockItem[] {
  const next = read().map((s) => (s.id === id ? { ...s, ...partial, id: s.id } : s));
  return write(next);
}

export function removeStock(id: string): StockItem[] {
  return write(read().filter((s) => s.id !== id));
}

export function clearDoneStock(): StockItem[] {
  return write(read().filter((s) => s.status !== "done"));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("idb"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb"));
  });
}

export async function putStockBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb"));
      tx.objectStore(DB_STORE).put(blob, id);
    });
  } finally {
    db.close();
  }
}

export async function getStockBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = () => {
          const v = req.result;
          resolve(v instanceof Blob ? v : null);
        };
        req.onerror = () => reject(req.error ?? new Error("idb"));
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deleteStockBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("idb"));
        tx.objectStore(DB_STORE).delete(id);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}
