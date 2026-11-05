const KEY = "spektrafilm-gallery";
export const GALLERY_CAP = 48;

export type GalleryShot = {
  id: string;
  name: string;
  at: number;
  w: number;
  h: number;
  uri?: string;
  thumb: string;
};

function read(): GalleryShot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isShot).slice(0, GALLERY_CAP);
  } catch {
    return [];
  }
}

function isShot(v: unknown): v is GalleryShot {
  if (!v || typeof v !== "object") return false;
  const o = v as GalleryShot;
  return typeof o.id === "string" && typeof o.thumb === "string" && typeof o.name === "string";
}

function write(items: GalleryShot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, GALLERY_CAP)));
  } catch {
    /* quota — drop oldest thumbs */
    try {
      const slim = items.slice(0, 12).map((s) => ({ ...s, thumb: s.thumb }));
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      /* ignore */
    }
  }
}

export function loadLocalGallery(): GalleryShot[] {
  return read();
}

export function pushLocalShot(shot: GalleryShot): GalleryShot[] {
  const prev = read().filter((s) => s.id !== shot.id && (!shot.uri || s.uri !== shot.uri));
  const next = [shot, ...prev].slice(0, GALLERY_CAP);
  write(next);
  return next;
}

export function removeLocalShot(id: string): GalleryShot[] {
  const next = read().filter((s) => s.id !== id);
  write(next);
  return next;
}

export async function makeThumbFromUrl(url: string, edge = 176): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("thumb"));
    img.src = url;
  });
  const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scale = Math.min(1, edge / long);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.62);
}
