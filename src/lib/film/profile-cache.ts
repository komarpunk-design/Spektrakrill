import type { FilmProfile } from "./types.ts";

const userJs = new Map<string, FilmProfile>();
const cache = new Map<string, FilmProfile>();

export function putUserJsProfile(profile: FilmProfile): void {
  userJs.set(profile.id, profile);
  cache.set(profile.id, profile);
}

export function dropUserJsProfile(id: string): void {
  userJs.delete(id);
  cache.delete(id);
}

export function getUserJsProfile(id: string): FilmProfile | undefined {
  return userJs.get(id);
}

export function getCachedProfile(id: string): FilmProfile | undefined {
  return userJs.get(id) ?? cache.get(id);
}

export function putCachedProfile(profile: FilmProfile): void {
  cache.set(profile.id, profile);
}
