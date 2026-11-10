import scannerSpectra from "../../../public/profiles/scanner-spectra.json";
import catalogJson from "../../../public/profiles/catalog.json";
import { useEffect, useState } from "react";
import {
  getCachedProfile,
  putCachedProfile,
} from "./profile-cache.ts";
import type { FilmProfile, ProfileMeta } from "./types";

export interface Catalog {
  films: ProfileMeta[];
  papers: ProfileMeta[];
  license: string;
}

export const bundledCatalog = catalogJson as Catalog;

export { dropUserJsProfile, putUserJsProfile } from "./profile-cache.ts";

export function loadCatalog(): Promise<Catalog> {
  return Promise.resolve(bundledCatalog);
}

export async function loadProfile(id: string): Promise<FilmProfile> {
  const hit = getCachedProfile(id);
  if (hit) return hit;
  const r = await fetch(`/profiles/${id}.json`);
  if (!r.ok) throw new Error(`Missing profile ${id}`);
  const p = (await r.json()) as FilmProfile;
  p.scannerSpectra=(scannerSpectra as Record<string,FilmProfile["scannerSpectra"]>)[id];
  putCachedProfile(p);
  return p;
}

export async function loadProfileSafe(
  id: string,
  fallback = "kodak_portra_400",
): Promise<FilmProfile> {
  try {
    return await loadProfile(id);
  } catch {
    if (id !== fallback) return loadProfile(fallback);
    throw new Error("Нет профиля плёнки");
  }
}

export function filmLabel(id: string, catalog: Catalog = bundledCatalog): string {
  const hit =
    catalog.films.find((f) => f.id === id) ?? catalog.papers.find((f) => f.id === id);
  return hit?.name ?? id.replaceAll("_", " ");
}

export function useLiveCatalog(): Catalog {
  const [catalog, setCatalog] = useState(bundledCatalog);
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    void import("./user-profiles.ts").then((mod) => {
      if (!alive) return;
      setCatalog(mod.currentCatalog());
      unsub = mod.subscribeCatalog(() => {
        if (alive) setCatalog(mod.currentCatalog());
      });
      void mod.hydrateUserProfiles().then((next) => {
        if (alive) setCatalog(next);
      });
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return catalog;
}
