import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus } from "lucide-react";
import {
  DEFAULT_DEVELOP,
  GROUPS,
  STOCKS,
  decodeSrgb,
  densityAt,
  develop,
  resizeLinear,
  stockById,
  type DevelopOptions,
  type OutputMode,
  type Stock,
} from "@/lib/latent/engine";
import "./latent.css";

const SCENES = [
  { id: "ridge", name: "Хребет", src: "/latent/ridge.jpg" },
  { id: "coast", name: "Берег", src: "/latent/coast.jpg" },
  { id: "portrait", name: "Портрет", src: "/latent/portrait.jpg" },
] as const;

type SceneId = (typeof SCENES)[number]["id"] | "file";

const LIGHTS: { id: string; label: string; kelvin: number | null }[] = [
  { id: "shot", label: "Как в кадре", kelvin: null },
  { id: "day", label: "День", kelvin: 5500 },
  { id: "shade", label: "Тень", kelvin: 7500 },
  { id: "lamp", label: "Лампа", kelvin: 3200 },
];

function CurveChart({ stock }: { stock: Stock }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 280;
    const h = 96;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(36,28,22,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(8, h - 10);
    ctx.lineTo(w - 8, h - 10);
    ctx.stroke();
    const colors = ["#9a3b32", "#2f6a45", "#2c4f78"];
    for (let ch = 0; ch < 3; ch++) {
      ctx.beginPath();
      ctx.strokeStyle = colors[ch]!;
      ctx.lineWidth = 1.6;
      for (let i = 0; i <= 64; i++) {
        const x = -3 + (6 * i) / 64;
        const d = densityAt(stock.curves[ch]!, x);
        const px = 8 + (i / 64) * (w - 20);
        const py = h - 12 - Math.min(h - 22, d * 16);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }, [stock]);
  return <canvas ref={ref} className="latent-curve" aria-hidden />;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="latent-slider">
      <span>
        {label}
        <em>{format(value)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function LatentApp() {
  const [stockId, setStockId] = useState("portra400");
  const [query, setQuery] = useState("");
  const [opt, setOpt] = useState<DevelopOptions>(DEFAULT_DEVELOP);
  const [light, setLight] = useState("shot");
  const [scene, setScene] = useState<SceneId>("ridge");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [split, setSplit] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("Хребет");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<{ linear: Float32Array; w: number; h: number; image: HTMLImageElement } | null>(null);
  const [gen, setGen] = useState(0);

  const stock = stockById(stockId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STOCKS.filter((s) => !q || `${s.name} ${s.subtitle} ${s.iso ?? ""}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    const src = scene === "file" ? fileUrl : SCENES.find((s) => s.id === scene)?.src;
    if (!src) return;
    let dead = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (dead) return;
      const edge = 1600;
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      sourceRef.current = { linear: decodeSrgb(data.data, w, h), w, h, image };
      setGen((n) => n + 1);
    };
    image.src = src;
    return () => {
      dead = true;
    };
  }, [scene, fileUrl]);

  useEffect(() => {
    const src = sourceRef.current;
    const canvas = canvasRef.current;
    if (!src || !canvas) return;
    let dead = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      const edge = 900;
      const scale = Math.min(1, edge / Math.max(src.w, src.h));
      const dw = Math.max(1, Math.round(src.w * scale));
      const dh = Math.max(1, Math.round(src.h * scale));
      const linear = scale === 1 ? src.linear : resizeLinear(src.linear, src.w, src.h, dw, dh);
      const frame = develop(linear, dw, dh, stock, opt);
      if (dead) return;
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(frame, 0, 0);
      if (split < 0.995) {
        const cut = Math.max(1, Math.round(dw * split));
        const sw = Math.max(1, src.image.naturalWidth * (cut / dw));
        ctx.drawImage(src.image, 0, 0, sw, src.image.naturalHeight, 0, 0, cut, dh);
        ctx.fillStyle = "rgba(244,239,230,0.92)";
        ctx.fillRect(Math.max(0, cut - 1), 0, 2, dh);
      }
      setBusy(false);
    }, 30);
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
  }, [gen, stock, opt, split]);

  function patch(partial: Partial<DevelopOptions>) {
    setOpt((o) => ({ ...o, ...partial }));
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setScene("file");
    setNote(file.name);
  }

  function saveJpeg() {
    const src = sourceRef.current;
    if (!src) return;
    const edge = Math.min(2000, Math.max(src.w, src.h));
    const scale = edge / Math.max(src.w, src.h);
    const dw = Math.max(1, Math.round(src.w * scale));
    const dh = Math.max(1, Math.round(src.h * scale));
    const linear = scale === 1 ? src.linear : resizeLinear(src.linear, src.w, src.h, dw, dh);
    const frame = develop(linear, dw, dh, stock, opt);
    const c = document.createElement("canvas");
    c.width = dw;
    c.height = dh;
    c.getContext("2d")?.putImageData(frame, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `latent-${stock.id}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/jpeg", 0.92);
  }

  const outputLabel =
    opt.mode === "scan" ? "Скан негатива" : opt.mode === "print" ? "Печать" : stock.reversal ? "Прямой просмотр" : "Печать на бумаге";

  return (
    <div className="latent">
      <header className="latent-top">
        <div>
          <p className="latent-mark">Latent</p>
          <p className="latent-tag">Свет, эмульсия, отпечаток.</p>
        </div>
        <div className="latent-actions">
          <button type="button" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={18} aria-hidden />
            Открыть
          </button>
          <button type="button" className="is-solid" onClick={saveJpeg}>
            <Download size={18} aria-hidden />
            JPEG
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </header>

      <div className="latent-body">
        <aside className="latent-shelf">
          <input
            className="latent-search"
            value={query}
            placeholder="Найти плёнку"
            aria-label="Найти плёнку"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="latent-groups">
            {GROUPS.map((group) => {
              const items = filtered.filter((s) => s.group === group.id);
              if (!items.length) return null;
              return (
                <section key={group.id}>
                  <h2>{group.label}</h2>
                  <ul>
                    {items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={s.id === stock.id ? "is-on" : ""}
                          onClick={() => setStockId(s.id)}
                        >
                          <strong>{s.name}</strong>
                          <span>{s.iso ? `ISO ${s.iso}` : s.subtitle}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {!filtered.length ? <p className="latent-empty">Нет такой плёнки</p> : null}
          </div>
        </aside>

        <main className="latent-stage">
          <div className="latent-frame">
            <canvas ref={canvasRef} aria-label="Отпечаток" />
            {busy ? <div className="latent-bar" /> : null}
          </div>
          <Slider
            label="До и после"
            value={split}
            min={0}
            max={1}
            step={0.01}
            format={(v) => (v > 0.98 ? "отпечаток" : v < 0.02 ? "оригинал" : "сравнение")}
            onChange={setSplit}
          />
          <div className="latent-scenes" role="list">
            {SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="listitem"
                className={scene === s.id ? "is-on" : ""}
                onClick={() => {
                  setScene(s.id);
                  setNote(s.name);
                }}
              >
                <img src={s.src} alt="" />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <p className="latent-note">{note}</p>
        </main>

        <aside className="latent-dock">
          <div className="latent-stockhead">
            <h1>{stock.name}</h1>
            <p>{stock.subtitle || outputLabel}</p>
            <p className="latent-out">{outputLabel}</p>
          </div>
          <CurveChart stock={stock} />
          <p className="latent-chartcap">Кривая H&D, три слоя. Середина кадра — ноль log H.</p>

          <Slider label="Экспозиция" value={opt.ev} min={-3} max={3} step={0.05} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`} onChange={(v) => patch({ ev: v })} />

          <div className="latent-lights" role="group" aria-label="Свет сцены">
            {LIGHTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={light === l.id ? "is-on" : ""}
                onClick={() => {
                  setLight(l.id);
                  patch({ kelvin: l.kelvin });
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <Slider label="Зерно" value={opt.grain} min={0} max={2} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ grain: v })} />
          <Slider label="Ореол" value={opt.halation} min={0} max={2} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ halation: v })} />
          <Slider label="Печать" value={opt.printEv} min={-1.5} max={1.5} step={0.05} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`} onChange={(v) => patch({ printEv: v })} />
          <Slider label="Грейд" value={opt.grade} min={0.65} max={1.45} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ grade: v })} />
          <Slider label="Тени" value={opt.shadows} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ shadows: v })} />
          <Slider label="Света" value={opt.highlights} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ highlights: v })} />

          <div className="latent-lights" role="group" aria-label="Формат кадра">
            {[
              [8, "8 мм"],
              [16, "16 мм"],
              [36, "35 мм"],
              [70, "6×7"],
            ].map(([mm, label]) => (
              <button
                key={label}
                type="button"
                className={opt.formatMm === mm ? "is-on" : ""}
                onClick={() => patch({ formatMm: Number(mm) })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="latent-lights" role="group" aria-label="Как смотреть">
            {(
              [
                ["match", "Как задумано"],
                ["print", "Бумага"],
                ["scan", "Скан"],
              ] as [OutputMode, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className={opt.mode === id ? "is-on" : ""} onClick={() => patch({ mode: id })}>
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <footer className="latent-foot">
        Кривые, зерно и ореол сняты с профилей Fotufilm (CC BY-SA 4.0, Dhaliwal). В браузере это аналитическая модель
        Хёртера–Дриффильда, не спектральный движок Halide.
      </footer>
    </div>
  );
}
