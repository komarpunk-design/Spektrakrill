import { Capacitor } from "@capacitor/core";
import { dropUserJsProfile, putUserJsProfile } from "./profile-cache.ts";
import { bundledCatalog, type Catalog } from "./profiles.ts";
import { installNativeUserProfile, removeNativeUserProfile } from "./native-raw.ts";
import type { ParsedSpectralProfile } from "./profile-json.ts";
import type { FilmProfile, ProfileMeta } from "./types.ts";

const META_KEY = "spektrafilm-user-profiles";
const DB_NAME = "spektrafilm-user-profiles";
const DB_STORE = "profiles";
export const USER_PROFILE_CAP = 16;

export type UserProfileRecord = {
  id: string;
  meta: ProfileMeta;
  jsProfile: FilmProfile;
  nativeJson: string;
  at: number;
};

const listeners = new Set<() => void>();
let extras: ProfileMeta[] = [];

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeCatalog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function bundledIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of bundledCatalog.films) ids.add(f.id);
  for (const p of bundledCatalog.papers) ids.add(p.id);
  return ids;
}

function isMeta(v: unknown): v is ProfileMeta {
  if (!v || typeof v !== "object") return false;
  const o = v as ProfileMeta;
  return typeof o.id === "string" && typeof o.name === "string" && (o.support === "film" || o.support === "paper");
}

function readMeta(): ProfileMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeta).slice(0, USER_PROFILE_CAP).map((m) => ({ ...m, user: true }));
  } catch {
    return [];
  }
}

function writeMeta(list: ProfileMeta[]): ProfileMeta[] {
  const next = list.slice(0, USER_PROFILE_CAP).map((m) => ({ ...m, user: true }));
  try {
    localStorage.setItem(META_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  extras = next;
  notify();
  return next;
}

export function currentCatalog(): Catalog {
  const films = extras.filter((m) => m.support === "film");
  const papers = extras.filter((m) => m.support === "paper");
  return {
    ...bundledCatalog,
    films: [...bundledCatalog.films, ...films],
    papers: [...bundledCatalog.papers, ...papers],
  };
}

export function userProfileMeta(id: string): ProfileMeta | undefined {
  return extras.find((m) => m.id === id);
}

export function isUserProfile(id: string): boolean {
  return extras.some((m) => m.id === id);
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

async function putRecord(rec: UserProfileRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb"));
      tx.objectStore(DB_STORE).put(rec, rec.id);
    });
  } catch {
    /* web private mode */
  }
}

async function dropRecord(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb"));
      tx.objectStore(DB_STORE).delete(id);
    });
  } catch {
    /* ignore */
  }
}

async function loadRecord(id: string): Promise<UserProfileRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve((req.result as UserProfileRecord) ?? null);
      req.onerror = () => reject(req.error ?? new Error("idb"));
    });
  } catch {
    return null;
  }
}

async function nativeInstall(id: string, json: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await installNativeUserProfile(id, json);
}

async function nativeRemove(id: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await removeNativeUserProfile(id);
}

export function uniqueUserId(wanted: string): string {
  const bundled = bundledIds();
  if (bundled.has(wanted)) {
    const preferred = `${wanted}_user`;
    if (extras.some((m) => m.id === preferred)) return preferred;
    const taken = new Set([...bundled, ...extras.map((m) => m.id)]);
    let next = preferred;
    let i = 2;
    while (taken.has(next) && i < 20) {
      next = `${wanted}_user${i}`;
      i += 1;
    }
    return next;
  }
  return wanted;
}

export async function installUserProfile(parsed: ParsedSpectralProfile): Promise<{
  id: string;
  added: boolean;
  name: string;
  support: ProfileMeta["support"];
}> {
  const id = uniqueUserId(parsed.id);
  const meta: ProfileMeta = { ...parsed.meta, id, user: true };
  const jsProfile: FilmProfile = { ...parsed.jsProfile, ...meta, id };
  const existing = extras.find((m) => m.id === id);
  if (!existing && extras.length >= USER_PROFILE_CAP) {
    throw new Error("full");
  }
  const rec: UserProfileRecord = {
    id,
    meta,
    jsProfile,
    nativeJson: parsed.nativeJson,
    at: Date.now(),
  };
  await putRecord(rec);
  await nativeInstall(id, parsed.nativeJson);
  putUserJsProfile(jsProfile);
  const next = existing
    ? extras.map((m) => (m.id === id ? meta : m))
    : [...extras.filter((m) => m.id !== id), meta];
  writeMeta(next);
  return { id, added: !existing, name: meta.name, support: meta.support };
}

export async function removeUserProfile(id: string): Promise<void> {
  await dropRecord(id);
  await nativeRemove(id);
  dropUserJsProfile(id);
  writeMeta(extras.filter((m) => m.id !== id));
}

export async function hydrateUserProfiles(): Promise<Catalog> {
  extras = readMeta();
  for (const meta of extras) {
    const rec = await loadRecord(meta.id);
    if (rec?.jsProfile) putUserJsProfile({ ...rec.jsProfile, ...meta, user: true });
  }
  notify();
  return currentCatalog();
}

export function shelfGroups(
  kind: "film" | "paper",
  catalog: Catalog,
  base: { label: string; ids: string[] }[],
): { label: string; ids: string[] }[] {
  const known = new Set(base.flatMap((g) => g.ids));
  const experimental = (kind === "film" ? catalog.films : catalog.papers).filter(x=>x.experimental).map(x=>x.id);
  experimental.forEach(id=>known.add(id));
  const negs=(kind==="film"?catalog.films:catalog.papers).filter(x=>x.negs).map(x=>x.id);negs.forEach(id=>known.add(id));
  const extra = (kind === "film" ? catalog.films : catalog.papers)
    .filter((x) => !known.has(x.id) && x.id !== "none")
    .map((x) => x.id);
  return [...base, ...(negs.length?[{label:"Negs · Fotufilm",ids:negs}]:[]), ...(experimental.length?[{label:"Spektrafilm · experimental",ids:experimental}]:[]), ...(extra.length?[{label:"Импорт",ids:extra}]:[])];
}
