export type FrameStyle = "none" | "white" | "black" | "instant" | "film";
export const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "none", label: "Без рамки" }, { value: "white", label: "Белое паспарту" },
  { value: "black", label: "Чёрная рамка" }, { value: "instant", label: "Моментальный снимок" },
  { value: "film", label: "Плёнка 35 мм" },
];
export function sanitizeFrameStyle(value: unknown): FrameStyle {
  return FRAME_STYLES.some(style => style.value === value) ? value as FrameStyle : "none";
}
export function frameGeometry(w: number, h: number, style: FrameStyle, width: number) {
  const ratio = Number.isFinite(width) ? Math.max(0.01, Math.min(0.2, width)) : 0.04;
  const p = style === "none" ? 0 : Math.max(1, Math.round(Math.min(w, h) * ratio));
  const top = style === "film" ? 2 * p : p;
  const bottom = style === "instant" ? 3 * p : top;
  return { width: w + 2 * p, height: h + top + bottom, x: p, y: top, p };
}
/** Border is added outside the image; no image pixels are cropped or covered. */
export function framedCanvas(image: CanvasImageSource, w: number, h: number, style: FrameStyle, width: number): HTMLCanvasElement {
  const g = frameGeometry(w, h, style, width);
  const canvas = document.createElement("canvas"); canvas.width = g.width; canvas.height = g.height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas");
  ctx.fillStyle = style === "black" || style === "film" ? "#141414" : "#f5f2e9";
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.drawImage(image, g.x, g.y, w, h);
  if (style === "film") {
    const holeW = Math.max(1, Math.round(g.p * 0.7));
    const holeH = Math.max(1, Math.round(g.p * 0.48));
    const step = Math.max(2, Math.round(g.p * 1.4));
    ctx.fillStyle = "#ddd5bc";
    for (let x = g.p; x + holeW <= g.width - g.p; x += step) {
      ctx.fillRect(x, Math.round(g.p * 0.25), holeW, holeH);
      ctx.fillRect(x, g.height - Math.round(g.p * 0.25) - holeH, holeW, holeH);
    }
    ctx.fillStyle = "#dc9e40"; ctx.font = `${Math.max(1, Math.round(g.p * 0.42))}px monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SPEKTRAFILM  35", g.p, Math.round(g.p * 1.55));
    ctx.fillText("01  >", g.p, g.height - Math.round(g.p * 0.95));
  }
  return canvas;
}
export function frameImageData(data: ImageData, style: FrameStyle, width: number): ImageData {
  if (style === "none") return data;
  const source = document.createElement("canvas"); source.width = data.width; source.height = data.height;
  const ctx = source.getContext("2d"); if (!ctx) throw new Error("canvas"); ctx.putImageData(data, 0, 0);
  const result = framedCanvas(source, data.width, data.height, style, width);
  return result.getContext("2d")!.getImageData(0, 0, result.width, result.height);
}
