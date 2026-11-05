import { useEffect, useRef } from "react";

const BINS = 32;

export function Histogram({ url }: { url: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !url) return;
    let dead = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (dead) return;
      const w = 96;
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      octx.drawImage(img, 0, 0, w, h);
      let data: ImageData;
      try {
        data = octx.getImageData(0, 0, w, h);
      } catch {
        return;
      }
      const r = new Float32Array(BINS);
      const g = new Float32Array(BINS);
      const b = new Float32Array(BINS);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        r[(px[i] / 256) * BINS | 0]++;
        g[(px[i + 1] / 256) * BINS | 0]++;
        b[(px[i + 2] / 256) * BINS | 0]++;
      }
      let peak = 1;
      for (let i = 0; i < BINS; i++) peak = Math.max(peak, r[i], g[i], b[i]);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      const gap = 1;
      const col = (cw - gap * (BINS - 1)) / BINS;
      const bar = (arr: Float32Array, color: string) => {
        ctx.fillStyle = color;
        for (let i = 0; i < BINS; i++) {
          const bh = Math.max(1, (arr[i] / peak) * (ch - 2));
          ctx.fillRect(i * (col + gap), ch - bh, col, bh);
        }
      };
      ctx.globalCompositeOperation = "screen";
      bar(r, "#b45454");
      bar(g, "#4a9a62");
      bar(b, "#4a78b0");
      ctx.globalCompositeOperation = "source-over";
    };
    img.src = url;
    return () => {
      dead = true;
    };
  }, [url]);

  if (!url) return null;
  return <canvas ref={ref} className="lab-hist" width={160} height={48} aria-hidden />;
}
