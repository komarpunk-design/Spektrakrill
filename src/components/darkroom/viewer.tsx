import { cn } from "@/lib/utils";
import { MIDGRAY_D, samplePrintDensity, type DensitySample } from "@/lib/film/densitometer";
import { Maximize2, Scan, Blend, Crosshair } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function fmtD(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function barPct(d: number): number {
  return Math.max(0, Math.min(100, (d / 2.4) * 100));
}

export function Viewer({
  originalUrl,
  processedUrl,
  showOriginal,
  gray18,
  padding,
  processing,
  chromeHidden,
  clip,
  sourceKey,
  pickingWb,
  onToggleChrome,
  onHoldOriginal,
  onToggleClip,
  onOpen,
  onInstall,
  onSample,
  onPickGray,
  onBrowse,
}: {
  originalUrl: string | null;
  processedUrl: string | null;
  showOriginal: boolean;
  gray18: boolean;
  padding: number;
  processing: boolean;
  chromeHidden: boolean;
  clip?: boolean;
  sourceKey?: string;
  pickingWb?: boolean;
  onToggleChrome: () => void;
  onHoldOriginal: (v: boolean) => void;
  onToggleClip?: () => void;
  onOpen?: () => void;
  onInstall?: () => void;
  onSample?: (url: string, name: string) => void;
  onPickGray?: (nx: number, ny: number) => void;
  onBrowse?: (dir: -1 | 1) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLCanvasElement>(null);
  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch0 = useRef<{ dist: number; scale: number } | null>(null);
  const pan0 = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const hold = useRef<number | null>(null);
  const moved = useRef(false);
  const holding = useRef(false);
  const pickStart = useRef<{ x: number; y: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [dens, setDens] = useState<DensitySample | null>(null);
  const [probe, setProbe] = useState(false);
  const [hud, setHud] = useState(false);
  const hudTimer = useRef<number | null>(null);

  const bumpHud = () => {
    setHud(true);
    if (hudTimer.current != null) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => {
      hudTimer.current = null;
      setHud(false);
    }, 2400);
  };

  const applyTransform = () => {
    const el = stageRef.current?.querySelector("[data-print]") as HTMLElement | null;
    if (!el) return;
    el.style.transform = `translate(${tx.current}px, ${ty.current}px) scale(${scale.current})`;
    const pct = Math.round(scale.current * 100);
    setZoomPct((z) => (z === pct ? z : pct));
  };

  const fitView = () => {
    scale.current = 1;
    tx.current = 0;
    ty.current = 0;
    applyTransform();
  };

  const actualView = (cx?: number, cy?: number) => {
    const img = stageRef.current?.querySelector("[data-print] img") as HTMLImageElement | null;
    const stage = stageRef.current;
    if (!img || !img.naturalWidth || !stage) return;
    const box = img.getBoundingClientRect();
    const disp = box.width / Math.max(0.01, scale.current);
    const next = Math.min(8, Math.max(1, img.naturalWidth / disp));
    if (cx != null && cy != null && next > 1.02) {
      zoomAt(cx, cy, next);
    } else {
      scale.current = next <= 1.02 ? 1 : next;
      if (scale.current <= 1.02) {
        scale.current = 1;
        tx.current = 0;
        ty.current = 0;
      }
      applyTransform();
    }
  };

  const zoomAt = (clientX: number, clientY: number, next: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    const clamped = Math.min(8, Math.max(1, next));
    const prev = scale.current;
    const px = (x - tx.current) / prev;
    const py = (y - ty.current) / prev;
    scale.current = clamped;
    if (clamped <= 1.02) {
      scale.current = 1;
      tx.current = 0;
      ty.current = 0;
    } else {
      tx.current = x - px * clamped;
      ty.current = y - py * clamped;
    }
    applyTransform();
  };

  useEffect(() => {
    fitView();
  }, [sourceKey]);

  useEffect(() => {
    return () => {
      if (hudTimer.current != null) window.clearTimeout(hudTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!processedUrl || processing) {
      if (!processedUrl) setDens(null);
      return;
    }
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      const w = Math.min(640, img.naturalWidth);
      const h = Math.max(1, Math.round((img.naturalHeight * w) / Math.max(1, img.naturalWidth)));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h);
      if (!dead) setDens(samplePrintDensity(px.data, w, h));
    };
    img.src = processedUrl;
    return () => {
      dead = true;
      img.onload = null;
      img.src = "";
    };
  }, [processedUrl, processing]);

  useEffect(() => {
    const canvas = clipRef.current;
    if (!canvas) return;
    if (!clip || !processedUrl || showOriginal) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead || !clipRef.current) return;
      const w = Math.min(960, img.naturalWidth);
      const h = Math.max(1, Math.round((img.naturalHeight * w) / Math.max(1, img.naturalWidth)));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const mx = Math.max(px[i], px[i + 1], px[i + 2]);
        const mn = Math.min(px[i], px[i + 1], px[i + 2]);
        if (mx >= 250) {
          px[i] = 255;
          px[i + 1] = 48;
          px[i + 2] = 160;
          px[i + 3] = 200;
        } else if (mn <= 10) {
          px[i] = 40;
          px[i + 1] = 170;
          px[i + 2] = 255;
          px[i + 3] = 200;
        } else {
          px[i + 3] = 0;
        }
      }
      ctx.putImageData(d, 0, 0);
    };
    img.src = processedUrl;
    return () => {
      dead = true;
      img.onload = null;
      img.src = "";
    };
  }, [clip, processedUrl, showOriginal]);

  const clearHold = () => {
    if (hold.current != null) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
    if (holding.current) {
      holding.current = false;
      onHoldOriginal(false);
    }
  };

  const sampleSpot = (clientX: number, clientY: number) => {
    const img = stageRef.current?.querySelector("[data-print] img") as HTMLImageElement | null;
    if (!img || !processedUrl) return;
    const rect = img.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const probeImg = new Image();
    probeImg.onload = () => {
      const w = Math.min(640, probeImg.naturalWidth);
      const h = Math.max(1, Math.round((probeImg.naturalHeight * w) / Math.max(1, probeImg.naturalWidth)));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(probeImg, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h);
      setDens(samplePrintDensity(px.data, w, h, nx, ny));
    };
    probeImg.src = processedUrl;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (processedUrl || originalUrl) bumpHud();
    if (pickingWb || probe) {
      pickStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (ptrs.current.size === 1) {
      pan0.current = { x: e.clientX, y: e.clientY, tx: tx.current, ty: ty.current };
      hold.current = window.setTimeout(() => {
        holding.current = true;
        onHoldOriginal(true);
      }, 280);
    } else {
      clearHold();
      const pts = [...ptrs.current.values()];
      if (pts.length >= 2) {
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinch0.current = { dist: Math.hypot(dx, dy), scale: scale.current };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pickingWb || probe) {
      const p = pickStart.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) moved.current = true;
      return;
    }
    const pts = [...ptrs.current.values()];
    if (pts.length >= 2 && pinch0.current) {
      moved.current = true;
      clearHold();
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      scale.current = Math.min(8, Math.max(1, (pinch0.current.scale * dist) / Math.max(1, pinch0.current.dist)));
      if (scale.current <= 1.02) {
        scale.current = 1;
        tx.current = 0;
        ty.current = 0;
      }
      applyTransform();
      return;
    }
    if (pan0.current && scale.current > 1.02) {
      const dx = e.clientX - pan0.current.x;
      const dy = e.clientY - pan0.current.y;
      if (Math.hypot(dx, dy) > 6) {
        moved.current = true;
        clearHold();
      }
      tx.current = pan0.current.tx + dx;
      ty.current = pan0.current.ty + dy;
      applyTransform();
      return;
    }
    const p = pan0.current;
    if (p) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        moved.current = true;
        clearHold();
        tx.current = dx;
        ty.current = 0;
        applyTransform();
      } else if (Math.hypot(dx, dy) > 8) {
        moved.current = true;
        clearHold();
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const origin = pan0.current;
    ptrs.current.delete(e.pointerId);
    pinch0.current = null;
    pan0.current = null;
    const wasHold = holding.current;
    const wasMoved = moved.current;
    const hasImage = Boolean(processedUrl || originalUrl);
    if (!pickingWb && !probe && !wasHold && origin && scale.current <= 1.02 && ptrs.current.size === 0) {
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        clearHold();
        tx.current = 0;
        ty.current = 0;
        applyTransform();
        onBrowse?.(dx < 0 ? 1 : -1);
        return;
      }
      if (Math.abs(tx.current) > 1) {
        tx.current = 0;
        ty.current = 0;
        applyTransform();
      }
    }
    if (pickingWb) {
      pickStart.current = null;
      if (!wasMoved && hasImage) {
        const img = stageRef.current?.querySelector("[data-print] img") as HTMLImageElement | null;
        if (img) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 4 && rect.height > 4) {
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) onPickGray?.(nx, ny);
          }
        }
      }
      return;
    }
    if (probe) {
      if (!wasMoved && hasImage) sampleSpot(e.clientX, e.clientY);
      return;
    }
    clearHold();
    if (!wasHold && !wasMoved && ptrs.current.size === 0 && hasImage) {
      onToggleChrome();
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (pickingWb || probe) return;
    if (!processedUrl && !originalUrl) return;
    e.preventDefault();
    if (scale.current > 1.05) fitView();
    else actualView(e.clientX, e.clientY);
  };

  const pad = Math.round(padding * 36);
  const shown = showOriginal ? originalUrl ?? processedUrl : processedUrl ?? originalUrl;
  const under = showOriginal ? null : originalUrl && processedUrl && originalUrl !== processedUrl ? originalUrl : null;

  return (
    <div
      ref={stageRef}
      className={cn(
        "relative h-full min-h-0 w-full touch-none overflow-hidden",
        gray18 ? "bg-gray18" : "bg-stage",
      )}
      aria-busy={processing}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div className="lab-print-well">
        {shown ? (
          <div
            data-print
            className="lab-print"
            style={{
              transformOrigin: "center center",
              boxShadow:
                pad > 0
                  ? `0 0 0 ${pad}px var(--color-accent-fg), var(--shadow-print)`
                  : "var(--shadow-print)",
            }}
          >
            {under ? (
              <img src={under} alt="" draggable={false} className="lab-print-img" />
            ) : null}
            <img
              src={shown}
              alt="Film simulation preview"
              draggable={false}
              className={cn("lab-print-img", under && "lab-print-img-over")}
            />
            {clip && !showOriginal ? (
              <canvas ref={clipRef} className="lab-print-clip" />
            ) : (
              <canvas ref={clipRef} className="hidden" />
            )}
          </div>
        ) : (
          <div className="lab-empty">
            <p className="lab-empty-brand">Spektrafilm</p>
            <p>Открой RAW или JPEG. Плёнка не применится, пока не выберешь коробку.</p>
            <button
              type="button"
              className="lab-btn is-solid"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpen?.()}
            >
              Открыть
            </button>
            {onSample ? (
              <div className="lab-empty-samples">
                <button
                  type="button"
                  className="lab-empty-sample"
                  aria-label="Пример: лес"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSample("/samples/forest.jpg", "forest.jpg")}
                >
                  <img src="/samples/forest.jpg" alt="" />
                  <span>Лес</span>
                </button>
                <button
                  type="button"
                  className="lab-empty-sample"
                  aria-label="Пример: натюрморт"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSample("/samples/still-life.jpg", "still-life.jpg")}
                >
                  <img src="/samples/still-life.jpg" alt="" />
                  <span>Натюрморт</span>
                </button>
              </div>
            ) : null}
            {onInstall ? (
              <button
                type="button"
                className="lab-empty-link"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onInstall()}
              >
                Скачать Android
              </button>
            ) : null}
          </div>
        )}
      </div>
      {!chromeHidden && processedUrl && !pickingWb ? (
        <div
          className={hud || clip || probe || zoomPct !== 100 ? "lab-hud is-on" : "lab-hud"}
          onPointerDown={(e) => {
            e.stopPropagation();
            bumpHud();
          }}
        >
          <button type="button" className="lab-hud-btn" onClick={fitView} aria-label="Вписать" title="Вписать">
            <Maximize2 className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" className="lab-hud-btn" onClick={() => actualView()} aria-label="1:1" title="1:1">
            <Scan className="size-4" strokeWidth={1.75} />
          </button>
          {zoomPct !== 100 ? (
            <button
              type="button"
              className="lab-hud-btn lab-hud-readout"
              onClick={fitView}
              aria-label="Вписать"
              title="Вписать в рамку"
            >
              {zoomPct}
            </button>
          ) : null}
          <button
            type="button"
            className={clip ? "lab-hud-btn is-on" : "lab-hud-btn"}
            onClick={() => onToggleClip?.()}
            aria-label="Зебра"
            title="Зебра"
          >
            <Blend className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className={probe ? "lab-hud-btn is-on" : "lab-hud-btn"}
            onClick={() => setProbe((v) => !v)}
            aria-label="Пятно"
            title="Пятно"
          >
            <Crosshair className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
      {!chromeHidden && dens && processedUrl && !pickingWb && probe ? (
        <div className="lab-dens" aria-label="Денситометр">
          <div className="lab-dens-head">
            <span>Status A</span>
            <strong>{dens.spot ? "пятно" : "кадр"}</strong>
          </div>
          {(
            [
              ["c", "C", dens.c],
              ["m", "M", dens.m],
              ["y", "Y", dens.y],
            ] as const
          ).map(([k, lab, val]) => (
            <div key={k} className={`lab-dens-row is-${k}`}>
              <span className="lab-dens-ch">{lab}</span>
              <span>{fmtD(val)}</span>
              <span className="lab-dens-bar">
                <span style={{ width: `${barPct(val)}%` }} />
              </span>
            </div>
          ))}
          <div className="lab-dens-spark" aria-hidden>
            {dens.hist.map((v, i) => (
              <i key={i} style={{ height: `${Math.max(6, Math.round(v * 100))}%` }} />
            ))}
          </div>
          <div className="lab-dens-meta">
            <span>
              Dmin <b>{fmtD(dens.dmin)}</b>
            </span>
            <span>
              Dmax <b>{fmtD(dens.dmax)}</b>
            </span>
          </div>
          <div className="lab-dens-meta">
            <span>
              ΔD <b>{fmtD(dens.dmax - dens.dmin)}</b>
            </span>
            <span>
              18% <b>{fmtD(MIDGRAY_D)}</b>
            </span>
          </div>
        </div>
      ) : null}
      {processing ? (
        <div className="lab-scan-tag">Проявка</div>
      ) : null}
      {pickingWb && (processedUrl || originalUrl) ? (
        <div className="lab-pick-banner" aria-live="polite">
          Коснись нейтрального
        </div>
      ) : null}
      {probe && processedUrl && !pickingWb ? (
        <div className="lab-pick-banner" aria-live="polite">
          Коснись пятна
        </div>
      ) : null}
    </div>
  );
}
