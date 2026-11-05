import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { GALLERY_CAP, loadLocalGallery, pushLocalShot, type GalleryShot } from "./gallery.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
const shot = (id: string, uri?: string): GalleryShot => ({
  id,
  uri,
  name: `${id}.jpg`,
  at: 1,
  w: 10,
  h: 10,
  thumb: "data:image/jpeg;base64,AAAA",
});

describe("local gallery preserves independent browser exports", () => {
  beforeEach(() => storage.clear());
  it("retains multiple exports without native URIs", () => {
    pushLocalShot(shot("one"));
    pushLocalShot(shot("two"));
    assert.deepEqual(
      loadLocalGallery().map((s) => s.id),
      ["two", "one"],
    );
  });
  it("replaces the same id and native URI without removing unrelated shots", () => {
    pushLocalShot(shot("web"));
    pushLocalShot(shot("old", "content://photo/1"));
    pushLocalShot(shot("new", "content://photo/1"));
    pushLocalShot(shot("web"));
    assert.deepEqual(
      loadLocalGallery().map((s) => s.id),
      ["web", "new"],
    );
  });
  it("keeps only the most recent entries at the gallery limit", () => {
    for (let i = 0; i < GALLERY_CAP + 5; i++) pushLocalShot(shot(String(i)));
    assert.equal(loadLocalGallery().length, GALLERY_CAP);
    assert.equal(loadLocalGallery()[0].id, String(GALLERY_CAP + 4));
  });
});
