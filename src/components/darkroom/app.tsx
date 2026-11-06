import { TestPrint } from "@/components/darkroom/test-print";
import { printTrialParams, type PrintTrialImage } from "@/lib/film/test-print";
import { nativeTestPrint, jpegB64ToObjectUrl } from "@/lib/film/native-raw";
import { frameImageData, edgeLabel } from "@/lib/film/photo-frame";
import { toolChangeCount } from "@/lib/film/tool-state";
import { Histogram } from "@/components/darkroom/histogram";
import { Panel, TOOLS, dockTools } from "@/components/darkroom/panel";
import { GalleryPane } from "@/components/darkroom/gallery";
import { StockPane } from "@/components/darkroom/stock";
import { Viewer } from "@/components/darkroom/viewer";
import { cn } from "@/lib/utils";
import { defaultParams, sanitizeParams } from "@/lib/film/defaults";
import { haptic } from "@/lib/film/haptic";
import { installLabLogHooks, pushLabLog } from "@/lib/film/lab-log";
import { pushLocalShot, makeThumbFromUrl } from "@/lib/film/gallery";
import {
  cancelNative,
  exportNativeStock,
  dropNativeStockSource,
  isNativeEngineAvailable,
  isNativeRawAvailable,
  keepNativeStockSource,
  loadNativeStockSource,
  nativeImageUrl,
  peekNativeExport,
  pickNativeRaw,
  pollNativeExport,
  saveNativeJpeg,
  simulateNative,
  openNativeLibrary,
  nativeWbBase,
  listPhoneLibrary,
} from "@/lib/film/native-raw";
import {
  clearNegCache,
  cropImageData,
  cropPlanar,
  imageDataToLinear,
  linearToImageData,
  resizeImageData,
  resizePlanar,
  rotateImageData,
  simulate,
  type PlanarImage,
} from "@/lib/film/pipeline";
import { previewSignature } from "@/lib/film/preview-key";
import { loadProfileSafe, useLiveCatalog } from "@/lib/film/profiles";
import { decodeRawFile, isRawFile, sniffRawContainer } from "@/lib/film/raw";
import {
  addStockItem,
  clearDoneStock,
  deleteStockBlob,
  getStockBlob,
  loadStock,
  makeStockId,
  patchStock,
  putStockBlob,
  queuedStock,
  removeStock,
  reviveStockExports,
  stockLookLabel,
  type StockItem,
} from "@/lib/film/stock";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import { isFilmBypass, isPaperBypass, type DarkroomParams } from "@/lib/film/types";
import { estimateAutoWb, sampleGrayPatch } from "@/lib/film/wb-auto";
import {
  Aperture,
  Bookmark,
  Camera,
  Check,
  Crop,
  Eye,
  FolderOpen,
  ChevronRight,
  Monitor,
  Redo2,
  Film,
  FlaskConical,
  ImageDown,
  Images,
  Library,
  ListPlus,
  Printer,
  RotateCcw,
  ScanLine,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type SheetId = "peek" | "half" | "full";
type LookMode = "draft" | "full" | null;
type Status = { label: string; pct: number; busy?: boolean } | null;

const ACCEPT =
  "image/jpeg,image/jpg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic,.dng,.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.pef";

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  film: Film,
  tone: SlidersHorizontal,
  presets: Bookmark,
  camera: Camera,
  print: Printer,
  scan: ScanLine,
  crop: Crop,
  stock: Library,
  gallery: Images,
  lab: FlaskConical,
  export: ImageDown,
  log: ScrollText,
  settings: Settings,
};

function previewEdge(maxSize: number, draft: boolean): number {
  const n = Math.min(4096, Math.max(256, maxSize || 960));
  return draft ? Math.min(512, n) : n;
}

function safeFileStem(
  name: string | null | undefined,
  filmStock: string,
  ext = ".jpg",
  engine?: string,
): string {
  const stem = (name ?? "frame")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  const mid = isFilmBypass(filmStock)
    ? engine && engine !== "spektrafilm"
      ? engine
      : "raw"
    : filmStock;
  return `spektrafilm-${mid}-${stem || "frame"}${suffix}`;
}

function imageDataToBlob(data: ImageData, mime = "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("canvas"));
      return;
    }
    ctx.putImageData(data, 0, 0);
    const type = mime === "image/png" ? "image/png" : "image/jpeg";
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 32) {
          resolve(blob);
          return;
        }
        try {
          const b64 = canvas.toDataURL(type, quality).split(",")[1] ?? "";
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(new Blob([bytes], { type }));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("encode"));
        }
      },
      type,
      quality,
    );
  });
}

function loadUrl(url: string, maxEdge = 0): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = maxEdge > 0 && long > maxEdge ? maxEdge / long : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

async function loadDisplayImage(file: Blob): Promise<ImageData> {
  const cap = 4096;
  try {
    const bmp = await createImageBitmap(file, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
      imageOrientation: "from-image",
    });
    const long = Math.max(bmp.width, bmp.height);
    const scale = long > cap ? cap / long : 1;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      bmp.close();
      throw new Error("canvas");
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    bmp.close();
    return data;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      return await loadUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function loadFile(file: File): Promise<ImageData> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  return isRawFile(file) || sniffRawContainer(head) ? decodeRawFile(file) : loadDisplayImage(file);
}

function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2500);
}

function revoke(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function sheetMetrics() {
  const land =
    typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  return land
    ? { land: true, peek: 22, half: Math.min(300, w * 0.36), full: Math.min(380, w * 0.44) }
    : { land: false, peek: 22, half: h * 0.32, full: Math.min(h * 0.58, h - 148) };
}

function snapPx(id: SheetId, m = sheetMetrics()): number {
  return id === "peek" ? m.peek : id === "full" ? m.full : m.half;
}

function snapFromVelocity(px: number, vel: number, m = sheetMetrics()): SheetId {
  const stops: { id: SheetId; v: number }[] = [
    { id: "peek", v: m.peek },
    { id: "half", v: m.half },
    { id: "full", v: m.full },
  ];
  if (vel > 900) {
    const next = stops.find((s) => s.v > px + 8);
    if (next) return next.id;
  } else if (vel < -900) {
    const prev = [...stops].reverse().find((s) => s.v < px - 8);
    if (prev) return prev.id;
  }
  const target = px + vel * 0.16;
  let best = stops[0];
  let dist = Infinity;
  for (const s of stops) {
    const d = Math.abs(s.v - target);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best.id;
}

function snapForTool(tool: string): SheetId {
  if (tool === "gallery" || tool === "stock") return "peek";
  if (tool === "presets" || tool === "settings" || tool === "log" || tool === "lab") return "full";
  return "half";
}

function simErrorMessage(e: unknown): string | null {
  const t = e instanceof Error ? e.message : String(e ?? "");
  if (!t || t === "cancelled" || /cancel/i.test(t) || t === "stale") return null;
  pushLabLog("E", "sim", t);
  if (/Missing profile/i.test(t)) return "Нет такого профиля плёнки";
  if (/Open a RAW|empty image/i.test(t)) return "Сначала открой кадр";
  if (/памяти|memory|OutOfMemory/i.test(t)) {
    return "Не хватает памяти. Закрой другие приложения и открой кадр снова.";
  }
  if (/simulate|engine returned/i.test(t) || t.length > 90) return "Не удалось проявить кадр";
  return t;
}

function IconBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("lab-iconbtn", active && "is-on")}
    >
      {children}
    </button>
  );
}

function asNativeParams(p: DarkroomParams): Record<string, unknown> {
  return { ...p, frameStockLabel: edgeLabel(p) } as unknown as Record<string, unknown>;
}

export function DarkroomApp() {
  const params = useDarkroom((s) => s.params);
  const setSource = useDarkroom((s) => s.setSource);
  const canRedo = useDarkroom((state) => state.redoStack.length > 0);
  const fileName = useDarkroom((s) => s.fileName);
  const showOriginal = useDarkroom((s) => s.showOriginal);
  const setShowOriginal = useDarkroom((s) => s.setShowOriginal);
  const scrubbing = useDarkroom((s) => s.scrubbing);
  const tool = useDarkroom((s) => s.tool);
  const prefs = useDarkroom((s) => s.prefs);
  const setTool = useDarkroom((s) => s.setTool);
  const chromeHidden = useDarkroom((s) => s.chromeHidden);
  const setChromeHidden = useDarkroom((s) => s.setChromeHidden);
  const undo = useDarkroom((s) => s.undo);
  const undoStack = useDarkroom((s) => s.undoStack);
  const resetTool = useDarkroom((s) => s.resetTool);
  const newFrame = useDarkroom((s) => s.newFrame);
  const setFrame = useDarkroom((s) => s.setFrame);
  const applyParams = useDarkroom((s) => s.applyParams);
  const showClip = useDarkroom((s) => s.showClip);
  const setShowClip = useDarkroom((s) => s.setShowClip);
  const patch = useDarkroom((s) => s.patch);
  const catalog = useLiveCatalog();

  const [enlargerOpen,setEnlargerOpen]=useState(false);
  const [testPrinting,setTestPrinting]=useState(false);
  const [preview, setPreview] = useState<ImageData | null>(null);
  const [previewLinear, setPreviewLinear] = useState<PlanarImage | null>(null);
  const [full, setFull] = useState<ImageData | null>(null);
  const [fullLinear, setFullLinear] = useState<PlanarImage | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [procUrl, setProcUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [renderMs, setMs] = useState<number | null>(null);
  const [engineOn, setEngineOn] = useState(false);
  const [, setLook] = useState<LookMode>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pickingWb, setPickingWb] = useState(false);
  const [autoWbBusy, setAutoWbBusy] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [galleryTick, setGalleryTick] = useState(0);
  const [stockItems, setStockItems] = useState<StockItem[]>(() => loadStock());
  const [batching, setBatching] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [sheet, setSheet] = useState<SheetId>("half");

  const prevShowOrig = useRef(false);
  const pickingWbRef = useRef(false);
  const skipConfirm = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<File | null>(null);
  const batchingRef = useRef(false);
  const gen = useRef(0);
  const busyGen = useRef(0);
  const origUrlRef = useRef<string | null>(null);
  const procUrlRef = useRef<string | null>(null);
  const jpegSceneRef = useRef(false);
  const abortRef = useRef(false);
  const noteTick = useRef(0);
  const statusTick = useRef(0);
  const holdResetTimer = useRef<number | null>(null);
  const holdResetFired = useRef(false);
  const sheetDrag = useRef<{ y: number; x: number; start: SheetId; startPx: number } | null>(null);
  const sheetMoved = useRef(false);
  const appRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<{ uri: string; name: string; thumb: string }[]>([]);
  const rollAt = useRef(-1);
  const rollMore = useRef(false);
  const rollLoading = useRef(false);
  const openGen = useRef(0);
  const sheetPxRef = useRef(snapPx("half"));
  const sheetVel = useRef(0);
  const sheetRaf = useRef(0);
  const sheetTs = useRef(0);
  const [sheetLive, setSheetLive] = useState(false);
  const beforeAfterMoved = useRef(false);
  const beforeAfterStart = useRef<{ x: number; y: number } | null>(null);
  const [resetAllArmed, setResetAllArmed] = useState(false);

  const nativeEngine = isNativeEngineAvailable();
  const previewSig = useMemo(() => previewSignature(params), [params]);
  pickingWbRef.current = pickingWb;

  const applySheetPx = (px: number) => {
    const m = sheetMetrics();
    const n = Math.min(m.full, Math.max(m.peek, px));
    sheetPxRef.current = n;
    const el = appRef.current;
    if (el) {
      if (m.land) el.style.setProperty("--insp", `${Math.round(n)}px`);
      else el.style.setProperty("--dock-h", `${Math.round(n)}px`);
    }
  };

  const stopSheet = () => {
    if (sheetRaf.current) cancelAnimationFrame(sheetRaf.current);
    sheetRaf.current = 0;
  };

  const animateSheet = (id: SheetId) => {
    stopSheet();
    const target = snapPx(id);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      applySheetPx(target);
      sheetVel.current = 0;
      setSheet(id);
      setSheetLive(false);
      return;
    }
    sheetTs.current = performance.now();
    setSheetLive(true);
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - sheetTs.current) / 1000);
      sheetTs.current = now;
      const cur = sheetPxRef.current;
      const vel = sheetVel.current + (-1600 * (cur - target) - 80 * sheetVel.current) * dt;
      const next = cur + vel * dt;
      sheetVel.current = vel;
      applySheetPx(next);
      if (Math.abs(next - target) < 0.7 && Math.abs(vel) < 14) {
        applySheetPx(target);
        sheetVel.current = 0;
        sheetRaf.current = 0;
        setSheet(id);
        setSheetLive(false);
        return;
      }
      sheetRaf.current = requestAnimationFrame(step);
    };
    sheetRaf.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const id = snapForTool(tool);
    setSheet(id);
    stopSheet();
    applySheetPx(snapPx(id));
    setSheetLive(false);
  }, [tool]);

  useEffect(() => {
    const onResize = () => applySheetPx(snapPx(sheet));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      stopSheet();
    };
  }, [sheet]);

  useEffect(() => {
    if (!resetAllArmed) return;
    const onDown = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.(".lab-dock-resetall")) setResetAllArmed(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [resetAllArmed]);

  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
      document.documentElement.style.setProperty("--kb", kb > 48 ? `${kb}px` : "0px");
    };
    sync();
    vp.addEventListener("resize", sync);
    vp.addEventListener("scroll", sync);
    return () => {
      vp.removeEventListener("resize", sync);
      vp.removeEventListener("scroll", sync);
      document.documentElement.style.setProperty("--kb", "0px");
    };
  }, []);

  const setOrig = useCallback((url: string | null) => {
    revoke(origUrlRef.current);
    origUrlRef.current = url;
    setOrigUrl(url);
  }, []);

  const setProc = useCallback((url: string | null) => {
    revoke(procUrlRef.current);
    procUrlRef.current = url;
    setProcUrl(url);
  }, []);

  const flashNote = useCallback((msg: string | null, ms = 2400) => {
    const id = ++noteTick.current;
    setError(null);
    setNote(msg);
    if (msg) {
      window.setTimeout(() => {
        if (noteTick.current === id) setNote(null);
      }, ms);
    }
  }, []);

  const flashError = useCallback((msg: string | null) => {
    const id = ++noteTick.current;
    setNote(null);
    setError(msg);
    if (msg) {
      pushLabLog("E", "ui", msg);
      window.setTimeout(() => {
        if (noteTick.current === id) setError(null);
      }, 4500);
    }
  }, []);

  const clearToasts = useCallback(() => {
    noteTick.current += 1;
    setNote(null);
    setError(null);
  }, []);

  const clearStatusSoon = useCallback((ms = 600) => {
    const id = ++statusTick.current;
    window.setTimeout(() => {
      if (statusTick.current === id) setStatus(null);
    }, ms);
  }, []);

  const stopWbPick = useCallback(() => {
    if (pickingWbRef.current) {
      setPickingWb(false);
      setShowOriginal(prevShowOrig.current);
    }
  }, [setShowOriginal]);

  const selectTool = useCallback(
    (id: ToolId) => {
      stopWbPick();
      clearToasts();
      setTool(id);
    },
    [stopWbPick, clearToasts, setTool],
  );

  const rememberShot = useCallback(async (name: string, w: number, h: number, uri?: string) => {
    try {
      const src = procUrlRef.current || origUrlRef.current;
      const thumb = src ? await makeThumbFromUrl(src) : "";
      pushLocalShot({
        id: `${Date.now()}-${name}`,
        name,
        at: Date.now(),
        w,
        h,
        uri,
        thumb,
      });
    } catch {
      /* ignore */
    }
    setGalleryTick((n) => n + 1);
  }, []);

  const reloadStock = useCallback(() => {
    setStockItems(loadStock());
  }, []);

  const dropStockItem = useCallback(async (id: string, native: boolean) => {
    if (native) await dropNativeStockSource(id);
    else await deleteStockBlob(id);
    setStockItems(removeStock(id));
  }, []);

  const addToStock = useCallback(async () => {
    if (!fileName && !origUrl && !full && !preview) {
      flashNote("Сначала открой кадр");
      return;
    }
    const snap = sanitizeParams(useDarkroom.getState().params);
    const id = makeStockId();
    const native = isNativeRawAvailable();
    let raw = false;
    const name = fileName || "кадр";
    const state = useDarkroom.getState();
    try {
      if (native) {
        raw = (await keepNativeStockSource(id)).raw;
      } else {
        let blob: Blob | null = sourceFileRef.current;
        if (!blob && preview) blob = await imageDataToBlob(preview, "image/jpeg", 0.95);
        if (!blob && origUrl) blob = await (await fetch(origUrl)).blob();
        if (!blob) {
          flashNote("Нет исходника для стока");
          return;
        }
        raw = sourceFileRef.current ? isRawFile(sourceFileRef.current) : false;
        await putStockBlob(id, blob);
      }
      const src = procUrlRef.current || origUrlRef.current;
      const thumb = src ? await makeThumbFromUrl(src) : "";
      const added = addStockItem({
        id,
        name,
        at: Date.now(),
        w: state.frameW,
        h: state.frameH,
        thumb,
        params: snap,
        native,
        raw,
        status: "queued",
      });
      if (!added.ok) {
        if (native) await dropNativeStockSource(id);
        else await deleteStockBlob(id);
        flashNote("Сток полный · 16 кадров");
        setStockItems(added.items);
        return;
      }
      setStockItems(added.items);
      haptic("select");
      flashNote(`В стоке · ${stockLookLabel(snap)} · ${added.items.length}`, 2200);
    } catch {
      if (native) await dropNativeStockSource(id);
      else await deleteStockBlob(id);
      flashError("Не удалось положить кадр в сток");
    }
  }, [fileName, origUrl, full, preview, flashNote, flashError]);

  const openStock = useCallback(
    async (item: StockItem) => {
      flashError(null);
      flashNote(null);
      setBusy(true);
      setStatus({ label: "Открываю сток", pct: 18, busy: true });
      try {
        gen.current += 1;
        clearNegCache();
        applyParams(item.params);
        if (item.native && isNativeRawAvailable()) {
          const res = await loadNativeStockSource(
            item.id,
            item.name,
            useDarkroom.getState().params.previewMaxSize,
            asNativeParams(item.params),
          );
          sourceFileRef.current = null;
          jpegSceneRef.current = !item.raw;
          setEngineOn(true);
          setPreviewLinear(null);
          setPreview(null);
          setFullLinear(null);
          setFull(null);
          if (res.sourceJpeg) setOrig(res.sourceJpeg);
          if (res.processedJpeg) {
            setProc(res.processedJpeg);
            setLook("draft");
          } else setProc(null);
          setSource("file", res.name || item.name);
          setFrame(res.width || item.w, res.height || item.h);
        } else {
          const blob = await getStockBlob(item.id);
          if (!blob) throw new Error("stock missing");
          const file = new File([blob], item.name, { type: blob.type || "image/jpeg" });
          sourceFileRef.current = file;
          const data = await loadFile(file);
          jpegSceneRef.current = !isRawFile(file);
          const linear = imageDataToLinear(
            data.data,
            data.width,
            data.height,
            useDarkroom.getState().params.applyCctfDecoding,
            jpegSceneRef.current,
          );
          setEngineOn(false);
          setPreviewLinear(linear);
          setPreview(data);
          setFrame(data.width, data.height);
          setSource("file", file.name);
        }
        setChromeHidden(false);
        selectTool(item.params.rawEngine === "spektrafilm" ? "film" : "tone");
        flashNote(`Сток · ${stockLookLabel(item.params)}`);
      } catch {
        flashError("Не удалось открыть кадр из стока");
      } finally {
        setBusy(false);
        setStatus(null);
      }
    },
    [
      applyParams,
      setOrig,
      setProc,
      setChromeHidden,
      flashNote,
      flashError,
      setFrame,
      setSource,
      selectTool,
    ],
  );

  const deleteStock = useCallback(
    async (id: string) => {
      const item = loadStock().find((s) => s.id === id);
      await dropStockItem(id, !!item?.native);
      haptic("select");
    },
    [dropStockItem],
  );

  const clearDone = useCallback(async () => {
    const done = loadStock().filter((s) => s.status === "done");
    for (const item of done) {
      if (item.native) await dropNativeStockSource(item.id);
      else await deleteStockBlob(item.id);
    }
    setStockItems(clearDoneStock());
  }, []);

  const exportStockAll = useCallback(async () => {
    if (batchingRef.current) {
      flashNote("Уже проявляется");
      return;
    }
    if (exporting) {
      let pending = !isNativeRawAvailable();
      if (isNativeRawAvailable()) {
        try {
          pending = !!(await peekNativeExport())?.pending;
        } catch {
          pending = false;
        }
      }
      if (pending) {
        flashNote("Уже проявляется");
        return;
      }
      setExporting(false);
    }
    setStockItems(reviveStockExports());
    const queue = queuedStock();
    if (!queue.length) {
      flashNote("В стоке нечего проявлять");
      return;
    }
    abortRef.current = false;
    batchingRef.current = true;
    setBatching(true);
    flashError(null);
    const total = queue.length;
    let ok = 0;
    let fail = 0;
    pushLabLog("I", "stock", `batch ${total}`);
    try {
      for (const rawItem of queuedStock()) {
        if (abortRef.current) break;
        const item = loadStock().find((s) => s.id === rawItem.id) ?? rawItem;
        if (item.status === "done") continue;
        setStockItems(patchStock(item.id, { status: "exporting", error: undefined }));
        const p = item.params;
        const png = p.exportFormat === "png";
        const mime = png ? "image/png" : "image/jpeg";
        const ext = png ? ".png" : ".jpg";
        const q = Math.max(0.82, Math.min(1, (p.exportQuality || 98) / 100));
        const name = safeFileStem(item.name, p.filmStock, ext, p.rawEngine);
        const expParams = {
          ...p,
          gpuExport: p.gpuExport !== false,
          exportMaxEdge: 0,
          upscaleFactor: 1,
          exportName: name,
        };
        setStatus({
          label: `Сток ${ok + fail + 1} / ${total} · ${stockLookLabel(p)}`,
          pct: Math.round(((ok + fail) / total) * 90) + 6,
          busy: true,
        });
        try {
          if (item.native && isNativeRawAvailable()) {
            const res = await exportNativeStock(item.id, asNativeParams(expParams), item.raw);
            await rememberShot(name, res.width, res.height, res.uri);
            setStockItems(patchStock(item.id, { status: "done", exportedUri: res.uri }));
          } else {
            const blob = await getStockBlob(item.id);
            if (!blob) throw new Error("stock missing");
            const file = new File([blob], item.name, { type: blob.type || "image/jpeg" });
            const data = await loadFile(file);
            const [film, paper] = isFilmBypass(p.filmStock)
              ? [null, null]
              : [
                  await loadProfileSafe(p.filmStock),
                  isPaperBypass(p.printPaper)
                    ? null
                    : await loadProfileSafe(p.printPaper, "kodak_portra_endura"),
                ];
            if (abortRef.current) throw new Error("cancelled");
            let planar = imageDataToLinear(
              data.data,
              data.width,
              data.height,
              p.applyCctfDecoding,
              !isRawFile(file),
            );
            if (p.crop) {
              planar = cropPlanar(planar, p.cropCenterX, p.cropCenterY, p.cropSizeX, p.cropSizeY);
            }
            const encoded = rotateImageData(
              linearToImageData(simulate(planar, film, paper, p), p.outputCctf),
              p.orientation,
            );
            const framed = frameImageData(encoded, p.frameStyle, p.whitePadding, p);
            const out = await imageDataToBlob(framed, mime, png ? 1 : q);
            if (isNativeRawAvailable()) {
              const saved = await saveNativeJpeg(name, out, mime);
              await rememberShot(name, framed.width, framed.height, saved.uri);
              setStockItems(patchStock(item.id, { status: "done", exportedUri: saved.uri }));
            } else {
              downloadBlob(out, name);
              await rememberShot(name, framed.width, framed.height);
              setStockItems(patchStock(item.id, { status: "done" }));
              await new Promise((r) => setTimeout(r, 450));
            }
          }
          ok += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "cancelled" || /cancel/i.test(msg)) {
            setStockItems(patchStock(item.id, { status: "queued" }));
            break;
          }
          fail += 1;
          pushLabLog("E", "stock", `${item.name} ${msg}`);
          setStockItems(patchStock(item.id, { status: "error", error: msg || "export" }));
        }
      }
      reloadStock();
      if (abortRef.current) {
        flashNote("Сток остановлен");
        setStatus(null);
        return;
      }
      if (fail && ok) flashNote(`Сток · готово ${ok}, ошибок ${fail}`, 4000);
      else if (fail) flashError(`Не удалось проявить ${fail} кадр.`);
      else flashNote(`Сток проявлен · ${ok} кадр.`, 4000);
      setStatus({ label: "Готово", pct: 100 });
    } finally {
      batchingRef.current = false;
      setBatching(false);
      if (abortRef.current) setStockItems(reviveStockExports());
      clearStatusSoon(1200);
    }
  }, [exporting, flashNote, flashError, rememberShot, reloadStock, clearStatusSoon]);

  useEffect(() => {
    clearToasts();
    if (tool !== "camera") stopWbPick();
    const on = document.querySelector(".lab-tool.is-on");
    if (on instanceof HTMLElement) on.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tool, clearToasts, stopWbPick]);

  useEffect(() => {
    const ids = dockTools(params.rawEngine, params.filmStock, prefs.showLabTabs, tool).map(
      (t) => t.id,
    );
    if (tool !== "settings" && !ids.includes(tool)) {
      setTool(params.rawEngine === "spektrafilm" ? "film" : "tone");
    }
  }, [params.rawEngine, params.filmStock, prefs.showLabTabs, tool, setTool]);

  useEffect(() => {
    void useDarkroom.persist.rehydrate();
    installLabLogHooks();
    pushLabLog("I", "boot", nativeEngine ? "native" : "web");
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) useDarkroom.getState().redo();
      else useDarkroom.getState().undo();
    };
    const onUp = () => {
      if (useDarkroom.getState().scrubbing) useDarkroom.getState().setScrubbing(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [nativeEngine]);

  useEffect(() => {
    if (!nativeEngine) return;
    let dead = false;
    void (async () => {
      const st = await peekNativeExport();
      if (dead || !st || st.idle) return;
      if (st.pending) {
        setExporting(true);
        setStatus({ label: "Проявляю полный кадр", pct: 40, busy: true });
        try {
          const done = await pollNativeExport();
          if (dead) return;
          if (done?.saved) {
            const size = done.width > 0 ? ` · ${done.width}×${done.height}` : "";
            flashNote(`Сохранено · оригинал${size}`, 4000);
            setStatus({ label: "Готово", pct: 100 });
            setGalleryTick((n) => n + 1);
          }
        } catch (e) {
          if (dead) return;
          const msg = simErrorMessage(e);
          if (msg) flashError(msg);
        } finally {
          if (!dead) {
            setExporting(false);
            clearStatusSoon(900);
          }
        }
        return;
      }
      if ((st.ok || st.saved) && (st.width ?? 0) > 0 && (st.t ?? 0) > Date.now() - 900000) {
        flashNote(`Сохранено · оригинал · ${st.width}×${st.height}`, 4000);
      }
    })();
    return () => {
      dead = true;
    };
  }, [nativeEngine, flashNote, flashError, clearStatusSoon]);

  useEffect(
    () => () => {
      revoke(origUrlRef.current);
      revoke(procUrlRef.current);
      noteTick.current += 1;
      statusTick.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (engineOn && nativeEngine) return;
    let dead = false;
    if (previewLinear) {
      let work = previewLinear;
      if (params.crop) {
        work = cropPlanar(
          work,
          params.cropCenterX,
          params.cropCenterY,
          params.cropSizeX,
          params.cropSizeY,
        );
      }
      work = resizePlanar(work, previewEdge(params.previewMaxSize, false));
      setFullLinear(work);
      const display = rotateImageData(linearToImageData(work, true), params.orientation);
      setFull(display);
      void imageDataToBlob(display, "image/jpeg", 0.9).then((blob) => {
        if (!dead) setOrig(URL.createObjectURL(blob));
      });
      return () => {
        dead = true;
      };
    }
    setFullLinear(null);
    if (!preview) return;
    let work = preview;
    if (params.crop) {
      work = cropImageData(
        work,
        params.cropCenterX,
        params.cropCenterY,
        params.cropSizeX,
        params.cropSizeY,
      );
    }
    work = resizeImageData(work, previewEdge(params.previewMaxSize, false));
    setFull(work);
    const linear = imageDataToLinear(
      work.data,
      work.width,
      work.height,
      params.applyCctfDecoding,
      jpegSceneRef.current,
    );
    setFullLinear(linear);
    void imageDataToBlob(work, "image/jpeg", 0.9).then((blob) => {
      if (!dead) setOrig(URL.createObjectURL(blob));
    });
    return () => {
      dead = true;
    };
  }, [
    engineOn,
    nativeEngine,
    preview,
    previewLinear,
    params.crop,
    params.cropCenterX,
    params.cropCenterY,
    params.cropSizeX,
    params.cropSizeY,
    params.previewMaxSize,
    params.orientation,
    params.applyCctfDecoding,
    setOrig,
  ]);

  useEffect(() => {
    if (engineOn && nativeEngine) {
      if (!origUrl && !preview) return;
      const id = ++gen.current;
      const draftOnly = scrubbing;
      let settled = false;
      const runNative = (draft: boolean) => {
        void (async () => {
          try {
            if (!draft) {
              statusTick.current += 1;
              busyGen.current = id;
              setBusy(true);
              setStatus({ label: "Проявка", pct: 40, busy: true });
            } else if (busyGen.current !== 0) {
              busyGen.current = id;
              setBusy(false);
            }
            const t0 = performance.now();
            const res = await simulateNative(asNativeParams(params), draft);
            if (id !== gen.current) return;
            if (res.stale) return;
            if (draft && settled) return;
            const url = nativeImageUrl(res);
            if (!url) return;
            if (!draft) settled = true;
            setProc(url);
            setLook(draft ? (res.mode === "full" ? "full" : "draft") : "full");
            setMs(res.ms ?? Math.round(performance.now() - t0));
            if (!draft) setStatus({ label: "Готово", pct: 100 });
          } catch (e) {
            if (id !== gen.current) return;
            const msg = simErrorMessage(e);
            if (msg) flashError(msg);
          } finally {
            if (!draft && busyGen.current === id) {
              busyGen.current = 0;
              setBusy(false);
              if (id === gen.current) clearStatusSoon(600);
            }
          }
        })();
      };
      if (draftOnly) {
        const draftTimer = window.setTimeout(() => runNative(true), 16);
        return () => window.clearTimeout(draftTimer);
      }
      // One pass. A draft ahead of the real preview just occupies the engine
      // thread, so the sharp frame starts late.
      const fullTimer = window.setTimeout(() => runNative(false), 48);
      return () => window.clearTimeout(fullTimer);
    }
    if (!full) return;
    const id = ++gen.current;
    const draftOnly = scrubbing;
    let settled = false;
    const runJs = async (draft: boolean) => {
      try {
        if (!draft) {
          statusTick.current += 1;
          busyGen.current = id;
          setBusy(true);
          setStatus({ label: "Проявка", pct: 40, busy: true });
        }
        const [film, paper] = isFilmBypass(params.filmStock)
          ? [null, null]
          : await Promise.all([
              loadProfileSafe(params.filmStock),
              isPaperBypass(params.printPaper)
                ? Promise.resolve(null)
                : loadProfileSafe(params.printPaper, "kodak_portra_endura"),
            ]);
        if (id !== gen.current) return;
        const t0 = performance.now();
        let work = fullLinear
          ? fullLinear
          : imageDataToLinear(
              full.data,
              full.width,
              full.height,
              params.applyCctfDecoding,
              jpegSceneRef.current,
            );
        const cap = previewEdge(params.previewMaxSize, draft);
        if (Math.max(work.w, work.h) > cap) work = resizePlanar(work, cap);
        const encoded = rotateImageData(
          linearToImageData(simulate(work, film, paper, params, draft), params.outputCctf),
          params.orientation,
        );
        if (id !== gen.current || (draft && settled)) return;
        if (!draft) settled = true;
        const blob = await imageDataToBlob(encoded, "image/jpeg", draft ? 0.72 : 0.82);
        if (id !== gen.current || (draft && settled)) return;
        setProc(URL.createObjectURL(blob));
        setMs(Math.round(performance.now() - t0));
        setLook(draft ? "draft" : "full");
        if (!draft) setStatus({ label: "Готово", pct: 100 });
      } catch (e) {
        if (id !== gen.current) return;
        const msg = simErrorMessage(e);
        if (msg) flashError(msg);
      } finally {
        if (id === gen.current && !draft) {
          if (busyGen.current === id) busyGen.current = 0;
          setBusy(false);
          clearStatusSoon(600);
        }
      }
    };
    if (draftOnly) {
      const t = window.setTimeout(() => {
        void runJs(true);
      }, 16);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      void runJs(false);
    }, 48);
    return () => window.clearTimeout(t);
  }, [
    preview,
    previewLinear,
    previewSig,
    engineOn,
    nativeEngine,
    scrubbing,
    origUrl,
    full,
    fullLinear,
    params,
    setProc,
    flashError,
    clearStatusSoon,
  ]);

  const takeNativeFrame = useCallback(
    (
      res: {
        sourceJpeg?: string;
        processedJpeg?: string;
        name: string;
        width: number;
        height: number;
        ms?: number;
      },
      opts?: { keepTool?: boolean },
    ) => {
      gen.current += 1;
      if (!opts?.keepTool) newFrame();
      clearNegCache();
      sourceFileRef.current = null;
      setEngineOn(true);
      setPreviewLinear(null);
      setPreview(null);
      setFullLinear(null);
      setFull(null);
      setOrig(res.sourceJpeg ?? null);
      if (res.processedJpeg) {
        setProc(res.processedJpeg);
        if (res.ms != null) setMs(res.ms);
        setLook("draft");
      } else setProc(null);
      setSource("file", res.name);
      setFrame(res.width, res.height);
      flashNote(null);
      setBusy(false);
      setStatus(null);
      if (opts?.keepTool) return;
      setChromeHidden(false);
      const engine = useDarkroom.getState().params.rawEngine;
      selectTool(engine === "spektrafilm" ? "film" : "tone");
    },
    [newFrame, setSource, setOrig, setProc, setChromeHidden, setFrame, flashNote, selectTool],
  );

  const nativeOpenParams = () => {
    const live = useDarkroom.getState();
    return live.prefs.resetOnOpen
      ? ({
          ...defaultParams(),
          rawEngine: live.params.rawEngine,
          rawEngineStyle: live.params.rawEngineStyle,
          filmStock: "none",
          scanFilm: false,
        } as unknown as Record<string, unknown>)
      : asNativeParams(live.params);
  };

  const seedRoll = useCallback(async (name: string) => {
    if (rollRef.current.length > 1) return;
    try {
      const page = await listPhoneLibrary(0, 48);
      if (!page.granted || page.items.length === 0) return;
      const items = page.items.map((s) => ({ uri: s.uri, name: s.name, thumb: s.thumb }));
      const at = items.findIndex((s) => s.name === name);
      rollRef.current = items;
      rollAt.current = at;
      rollMore.current = page.more;
    } catch {
      /* the roll is optional */
    }
  }, []);

  const openFromFiles = useCallback(async () => {
    setPickingWb(false);
    if (!isNativeRawAvailable()) {
      fileRef.current?.click();
      return;
    }
    flashError(null);
    flashNote(null);
    setBusy(true);
    setStatus({ label: "Открываю", pct: 18, busy: true });
    try {
      const live = useDarkroom.getState();
      const res = await pickNativeRaw(live.params.previewMaxSize, true, nativeOpenParams());
      if (res.mode === "engine" && res.sourceJpeg) {
        rollRef.current = [];
        rollAt.current = -1;
        takeNativeFrame(res);
        void seedRoll(res.name);
        return;
      }
      setEngineOn(false);
      throw new Error("raw");
    } catch (e) {
      setBusy(false);
      setStatus(null);
      const msg = e instanceof Error ? e.message : "";
      if (msg === "cancelled" || /cancel/i.test(msg)) return;
      flashError("Не удалось открыть файл. JPEG, PNG или RAW (CR2, NEF, ARW, DNG, RAF).");
    }
  }, [takeNativeFrame, flashNote, flashError, seedRoll]);

  const openFromPhone = useCallback(
    async (uri: string, name: string, opts?: { keepTool?: boolean; thumb?: string }) => {
      const ticket = ++openGen.current;
      gen.current += 1;
      setPickingWb(false);
      flashError(null);
      flashNote(null);
      if (opts?.thumb) {
        setProc(opts.thumb);
        setSource("file", name);
      }
      setBusy(true);
      setStatus({ label: "Открываю", pct: 18, busy: true });
      try {
        const live = useDarkroom.getState();
        const openParams = opts?.keepTool ? asNativeParams(live.params) : nativeOpenParams();
        const res = await openNativeLibrary(uri, live.params.previewMaxSize, openParams);
        if (ticket !== openGen.current) return;
        if (res.sourceJpeg) {
          takeNativeFrame({ ...res, name: res.name || name }, { keepTool: opts?.keepTool });
          return;
        }
        throw new Error("raw");
      } catch (e) {
        if (ticket !== openGen.current) return;
        setBusy(false);
        setStatus(null);
        const msg = e instanceof Error ? e.message : "";
        if (msg === "cancelled" || /cancel/i.test(msg)) return;
        flashError("Не удалось открыть кадр. JPEG, PNG, HEIC или RAW.");
      }
    },
    [takeNativeFrame, flashNote, flashError, setProc, setSource],
  );

  const fillRoll = useCallback(async () => {
    if (!rollMore.current || rollLoading.current) return;
    if (rollAt.current < rollRef.current.length - 4) return;
    rollLoading.current = true;
    try {
      const page = await listPhoneLibrary(rollRef.current.length, 36);
      const seen = new Set(rollRef.current.map((s) => s.uri));
      const add = page.items
        .filter((s) => s.uri && !seen.has(s.uri))
        .map((s) => ({ uri: s.uri, name: s.name, thumb: s.thumb }));
      if (add.length) rollRef.current = [...rollRef.current, ...add];
      rollMore.current = page.more;
    } finally {
      rollLoading.current = false;
    }
  }, []);

  const browseRoll = useCallback(
    (dir: -1 | 1) => {
      const next = rollAt.current + dir;
      const item = rollRef.current[next];
      if (!item) {
        if (dir < 0 || !rollMore.current) return;
        void fillRoll().then(() => {
          const again = rollRef.current[next];
          if (!again || rollAt.current !== next - dir) return;
          rollAt.current = next;
          void openFromPhone(again.uri, again.name, { keepTool: true, thumb: again.thumb });
        });
        return;
      }
      rollAt.current = next;
      void openFromPhone(item.uri, item.name, { keepTool: true, thumb: item.thumb });
      void fillRoll();
    },
    [openFromPhone, fillRoll],
  );

  const openNativeOrPicker = useCallback(async () => {
    setPickingWb(false);
    if (isNativeRawAvailable()) {
      flashError(null);
      flashNote(null);
      setChromeHidden(false);
      selectTool("gallery");
      return;
    }
    fileRef.current?.click();
  }, [setChromeHidden, selectTool, flashNote, flashError]);

  const onPickedFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPickingWb(false);
      flashError(null);
      setBusy(true);
      setStatus({ label: "Читаю файл", pct: 15, busy: true });
      flashNote(null);
      try {
        const data = await loadFile(file);
        gen.current += 1;
        newFrame();
        clearNegCache();
        sourceFileRef.current = file;
        jpegSceneRef.current = !isRawFile(file);
        const linear = imageDataToLinear(
          data.data,
          data.width,
          data.height,
          useDarkroom.getState().params.applyCctfDecoding,
          jpegSceneRef.current,
        );
        setEngineOn(false);
        setPreviewLinear(linear);
        setPreview(data);
        setFrame(data.width, data.height);
        setSource("file", file.name);
        setChromeHidden(false);
      } catch {
        setBusy(false);
        setStatus(null);
        flashError(
          isRawFile(file)
            ? "У этого RAW нет JPEG-превью, которое браузер умеет читать. В Android-приложении «Открыть» идёт через LibRaw."
            : "Не удалось открыть файл. JPEG, PNG или RAW (CR2, NEF, ARW, DNG, RAF).",
        );
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [newFrame, setSource, setChromeHidden, setFrame, flashNote, flashError],
  );

  const openSample = useCallback(
    async (url: string, name: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("sample");
        const blob = await res.blob();
        await onPickedFile(new File([blob], name, { type: blob.type || "image/jpeg" }));
      } catch {
        flashError("Не удалось открыть пример.");
      }
    },
    [onPickedFile, flashError],
  );

  const sourceLinear = useCallback(async () => {
    if (nativeEngine) {
      const url = await nativeWbBase(useDarkroom.getState().params.previewMaxSize);
      if (url) {
        try {
          const data = await loadUrl(url, 768);
          return imageDataToLinear(data.data, data.width, data.height, true, false);
        } catch {
          /* fall through */
        }
      }
    }
    if (origUrl) {
      try {
        const data = await loadUrl(origUrl, 768);
        return imageDataToLinear(data.data, data.width, data.height, true, false);
      } catch {
        /* lifted preview is a last resort — the toe changes channel ratios */
      }
    }
    if (fullLinear) return fullLinear;
    if (previewLinear) return previewLinear;
    return null;
  }, [fullLinear, previewLinear, origUrl, nativeEngine]);

  const renderPrintTrials = useCallback(async (snapshot: DarkroomParams, exposures: number[], signal: AbortSignal, progress: (value:number)=>void): Promise<PrintTrialImage[]> => {
    const created: PrintTrialImage[] = [];
    const check = () => { if (signal.aborted) throw new DOMException("Расчёт отменён", "AbortError"); };
    try {
      check();
      if (nativeEngine && engineOn) {
        const result = await nativeTestPrint(asNativeParams(snapshot), exposures);
        check();
        for (const image of result) created.push({url:jpegB64ToObjectUrl(image.jpeg),width:image.width,height:image.height});
        progress(5); return created;
      }
      let source = fullLinear || previewLinear;
      if (!source && (full || preview)) { const image=(full || preview)!; source=imageDataToLinear(image.data,image.width,image.height,snapshot.applyCctfDecoding,jpegSceneRef.current); }
      if (!source) throw new Error("Сначала откройте фотографию");
      source=resizePlanar(source,384);
      if(snapshot.crop) source=cropPlanar(source,snapshot.cropCenterX,snapshot.cropCenterY,snapshot.cropSizeX,snapshot.cropSizeY);
      const [film,paper]=await Promise.all([loadProfileSafe(snapshot.filmStock),loadProfileSafe(snapshot.printPaper,"kodak_portra_endura")]);
      for(let index=0;index<exposures.length;index++) {
        check();
        const trial=printTrialParams(snapshot,exposures[index]);
        const pixels=rotateImageData(linearToImageData(simulate(source,film,paper,trial),trial.outputCctf),trial.orientation);
        const blob=await imageDataToBlob(pixels,"image/jpeg",.9);check();
        created.push({url:URL.createObjectURL(blob),width:pixels.width,height:pixels.height});progress(index+1);
        await new Promise(resolve=>setTimeout(resolve,16));
      }
      return created;
    } catch(error) { created.forEach(image=>revoke(image.url));throw error; }
  },[nativeEngine,engineOn,fullLinear,previewLinear,full,preview]);

  const applyWb = useCallback(
    (wb: { temperature: number; tint: number }, label: string) => {
      patch({ whiteBalance: "custom", temperature: wb.temperature, tint: wb.tint });
      const tint = wb.tint === 0 ? "0" : wb.tint > 0 ? `+${wb.tint} G` : `${wb.tint} M`;
      flashNote(`${label} · ${wb.temperature} K · ${tint}`, 2600);
    },
    [patch, flashNote],
  );

  const runAutoWb = useCallback(async () => {
    if (autoWbBusy) return;
    stopWbPick();
    setAutoWbBusy(true);
    try {
      const img = await sourceLinear();
      if (!img) {
        flashNote("Сначала открой кадр");
        return;
      }
      const wb = estimateAutoWb(img, nativeEngine ? "prophoto" : "srgb");
      applyWb(wb, "Авто");
    } catch {
      flashError("Не удалось оценить баланс белого");
    } finally {
      setAutoWbBusy(false);
    }
  }, [autoWbBusy, sourceLinear, applyWb, stopWbPick, flashNote, flashError, nativeEngine]);

  const togglePickWb = useCallback(() => {
    if (pickingWb) {
      stopWbPick();
      return;
    }
    if (!origUrl && !fullLinear) {
      flashNote("Сначала открой кадр");
      return;
    }
    prevShowOrig.current = showOriginal;
    setShowOriginal(true);
    setPickingWb(true);
    setChromeHidden(false);
    selectTool("camera");
  }, [
    pickingWb,
    origUrl,
    fullLinear,
    showOriginal,
    setShowOriginal,
    setChromeHidden,
    selectTool,
    stopWbPick,
    flashNote,
  ]);

  const pickGray = useCallback(
    async (nx: number, ny: number) => {
      stopWbPick();
      try {
        let img: PlanarImage | null = null;
        if (nativeEngine) {
          const url = await nativeWbBase(useDarkroom.getState().params.previewMaxSize);
          if (url) {
            const data = await loadUrl(url);
            img = imageDataToLinear(data.data, data.width, data.height, true, false);
          }
        }
        if (!img && origUrl) {
          try {
            const data = await loadUrl(origUrl);
            img = imageDataToLinear(data.data, data.width, data.height, true, false);
          } catch {
            img = fullLinear;
          }
        } else if (!img) {
          img = fullLinear;
        }
        if (!img) {
          flashNote("Нет исходника для пипетки");
          return;
        }
        const wb = sampleGrayPatch(img, nx, ny, nativeEngine ? "prophoto" : "srgb");
        if (!wb) {
          flashNote("Точка слишком тёмная или выбита — коснись серого");
          return;
        }
        applyWb(wb, "Пипетка");
      } catch {
        flashError("Не удалось взять пробу");
      }
    },
    [origUrl, fullLinear, applyWb, stopWbPick, flashNote, flashError, nativeEngine],
  );

  const downloadApk = useCallback(async () => {
    window.open(
      "https://github.com/komarpunk-design/Spektrakrill/releases/latest",
      "_blank",
      "noopener,noreferrer",
    );
  }, []);

  const saveFrame = useCallback(async () => {
    if (batchingRef.current) {
      flashNote("Сток проявляется — подожди или отмени");
      return;
    }
    if ((!procUrl && !full) || exporting) return;
    if (prefs.confirmExport && !skipConfirm.current) {
      setConfirmExport(true);
      return;
    }
    skipConfirm.current = false;
    setConfirmExport(false);
    abortRef.current = false;
    gen.current += 1;
    statusTick.current += 1;
    busyGen.current = 0;
    setBusy(false);
    setExporting(true);
    flashError(null);
    flashNote(null);
    setStatus({ label: "Готовлю кадр", pct: 8, busy: true });
    const png = params.exportFormat === "png";
    const mime = png ? "image/png" : "image/jpeg";
    const ext = png ? ".png" : ".jpg";
    const q = Math.max(0.82, Math.min(1, (params.exportQuality || 98) / 100));
    const name = safeFileStem(fileName, params.filmStock, ext, params.rawEngine);
    const expParams = {
      ...params,
      gpuExport: params.gpuExport !== false,
      exportMaxEdge: 0,
      upscaleFactor: 1,
      exportName: name,
    };
    pushLabLog(
      "I",
      "export",
      `start gpu=${expParams.gpuExport} engine=${expParams.rawEngine ?? "spektrafilm"} ${name}`,
    );
    try {
      if (nativeEngine && engineOn) {
        setStatus({ label: "Проявляю полный кадр", pct: 35, busy: true });
        const labels = ["Декодирую RAW", "Считаю спектр", "Проявляю", "Собираю кадр"];
        let i = 0;
        const tick = window.setInterval(() => {
          i = Math.min(i + 1, labels.length - 1);
          setStatus({ label: labels[i], pct: 35 + i * 14, busy: true });
        }, 12000);
        try {
          const res = await simulateNative(asNativeParams(expParams), false, true, false);
          if (abortRef.current) throw new Error("cancelled");
          if (res.saved) await rememberShot(name, res.width, res.height, res.uri);
          else {
            setStatus({ label: "Пишу файл", pct: 90 });
            const saved = await saveNativeJpeg(name, undefined, mime);
            await rememberShot(name, res.width, res.height, saved.uri || res.uri);
          }
          setLook("full");
          const size = res.width > 0 && res.height > 0 ? ` · ${res.width}×${res.height}` : "";
          pushLabLog(
            "I",
            "export",
            `saved ${res.width}x${res.height} ${res.ms ?? 0}ms gpu=${expParams.gpuExport}`,
          );
          flashNote(
            `Сохранено · ${png ? "PNG" : `JPEG ${params.exportQuality}`} · оригинал${size}`,
            3200,
          );
          setStatus({ label: "Готово", pct: 100 });
          return;
        } finally {
          window.clearInterval(tick);
        }
      }
      let blob: Blob;
      if (preview || previewLinear) {
        if (abortRef.current) throw new Error("cancelled");
        setStatus({ label: "Проявляю кадр", pct: 40, busy: true });
        const [film, paper] = isFilmBypass(params.filmStock)
          ? [null, null]
          : await Promise.all([
              loadProfileSafe(params.filmStock),
              isPaperBypass(params.printPaper)
                ? Promise.resolve(null)
                : loadProfileSafe(params.printPaper, "kodak_portra_endura"),
            ]);
        if (abortRef.current) throw new Error("cancelled");
        let work =
          previewLinear ||
          imageDataToLinear(
            preview!.data,
            preview!.width,
            preview!.height,
            params.applyCctfDecoding,
            jpegSceneRef.current,
          );
        if (params.crop) {
          work = cropPlanar(
            work,
            params.cropCenterX,
            params.cropCenterY,
            params.cropSizeX,
            params.cropSizeY,
          );
        }
        if (abortRef.current) throw new Error("cancelled");
        setStatus({ label: "Кодирую", pct: 80 });
        const encoded = rotateImageData(
          linearToImageData(simulate(work, film, paper, params), params.outputCctf),
          params.orientation,
        );
        if (abortRef.current) throw new Error("cancelled");
        blob = await imageDataToBlob(frameImageData(encoded, params.frameStyle, params.whitePadding, params), mime, png ? 1 : q);
      } else if (procUrl) {
        setStatus({ label: "Кодирую превью", pct: 70 });
        const data = await loadUrl(procUrl);
        blob = await imageDataToBlob(frameImageData(data, params.frameStyle, params.whitePadding, params), mime, png ? 1 : q);
      } else throw new Error("empty");
      if (abortRef.current) throw new Error("cancelled");
      setStatus({ label: "Пишу файл", pct: 92 });
      if (isNativeRawAvailable()) {
        const saved = await saveNativeJpeg(name, blob, mime);
        flashNote("Сохранено в Pictures / Spektrafilm", 3200);
        await rememberShot(name, 0, 0, saved.uri);
      } else {
        downloadBlob(blob, name);
        flashNote("Сохранено · " + name, 3200);
        await rememberShot(name, 0, 0);
      }
      setStatus({ label: "Готово", pct: 100 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      pushLabLog("E", "export", msg || "save failed");
      if (msg === "cancelled" || /cancel/i.test(msg)) {
        flashNote("Отменено");
        setStatus(null);
        return;
      }
      if (/памяти|memory|OutOfMemory/i.test(msg)) {
        flashError("Не хватает памяти. Закрой другие приложения и попробуй снова.");
        setStatus(null);
        return;
      }
      flashError("Не удалось сохранить обработанный файл.");
      setStatus(null);
    } finally {
      setExporting(false);
      clearStatusSoon(900);
    }
  }, [
    procUrl,
    full,
    exporting,
    fileName,
    params,
    engineOn,
    nativeEngine,
    preview,
    previewLinear,
    flashNote,
    flashError,
    clearStatusSoon,
    prefs.confirmExport,
    rememberShot,
  ]);

  const cancelWork = useCallback(() => {
    abortRef.current = true;
    gen.current += 1;
    statusTick.current += 1;
    busyGen.current = 0;
    batchingRef.current = false;
    setBatching(false);
    setStockItems(reviveStockExports());
    void cancelNative();
    setExporting(false);
    setBusy(false);
    setStatus(null);
    flashNote("Отменено");
  }, [flashNote]);

  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? "";
  const canUndo = undoStack.length > 0;
  const canSave = !!(procUrl || full || preview) && !exporting && !batching && !testPrinting;
  const canStock = !!(fileName || origUrl || full || preview);
  const pendingStock = stockItems.filter(
    (s) => s.status === "queued" || s.status === "error" || s.status === "exporting",
  ).length;
  const toast = note || error;

  useEffect(() => {
    const onCommand = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if (event.key === "Escape") {
        setShowOriginal(false);
        setChromeHidden(false);
        setConfirmExport(false);
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (!busy && !exporting && !batching) void openNativeOrPicker();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) void saveFrame();
      }
    };
    window.addEventListener("keydown", onCommand);
    return () => window.removeEventListener("keydown", onCommand);
  }, [openNativeOrPicker, saveFrame, canSave, busy, exporting, batching, setShowOriginal]);

  const onSheetDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    sheetMoved.current = false;
    stopSheet();
    setSheetLive(true);
    sheetDrag.current = { y: e.clientY, x: e.clientX, start: sheet, startPx: sheetPxRef.current };
    sheetVel.current = 0;
    sheetTs.current = performance.now();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onSheetMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    const land = window.matchMedia("(orientation: landscape)").matches;
    const along = land ? e.clientX - drag.x : e.clientY - drag.y;
    const delta = land ? drag.x - e.clientX : drag.y - e.clientY;
    if (Math.abs(along) < 10 && !sheetMoved.current) return;
    sheetMoved.current = true;
    const now = performance.now();
    const dt = Math.max(8, now - sheetTs.current);
    const px = drag.startPx + delta;
    sheetVel.current = Math.max(-4200, Math.min(4200, ((px - sheetPxRef.current) / dt) * 1000));
    sheetTs.current = now;
    applySheetPx(px);
  };

  const onSheetUp = () => {
    const drag = sheetDrag.current;
    sheetDrag.current = null;
    if (!drag) return;
    if (!sheetMoved.current) {
      setSheetLive(false);
      return;
    }
    haptic("select");
    animateSheet(snapFromVelocity(sheetPxRef.current, sheetVel.current));
  };

  const onSheetClick = () => {
    if (sheetMoved.current) return;
    haptic("select");
    animateSheet(sheet === "full" || sheet === "peek" ? "half" : "full");
  };

  const onToolHoldDown = (id: ToolId) => {
    holdResetFired.current = false;
    if (holdResetTimer.current != null) window.clearTimeout(holdResetTimer.current);
    holdResetTimer.current = window.setTimeout(() => {
      holdResetTimer.current = null;
      holdResetFired.current = true;
      selectTool(id);
      resetTool();
    }, 560);
  };

  const onToolHoldUp = () => {
    if (holdResetTimer.current != null) {
      window.clearTimeout(holdResetTimer.current);
      holdResetTimer.current = null;
    }
  };

  return (
    <div
      ref={appRef}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = busy || exporting || batching ? "none" : "copy";
        setDraggingFile(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDraggingFile(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingFile(false);
        if (busy || exporting || batching) return;
        const file = event.dataTransfer.files[0];
        if (file) void onPickedFile(file);
      }}
      className={[
        "lab-app text-fg",
        scrubbing && "is-scrubbing",
        chromeHidden && "is-chrome-hidden",
        sheetLive && "is-sheet-live",
        `is-sheet-${sheet}`,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void onPickedFile(file);
        }}
      />
      {draggingFile ? (
        <div className="workbench-drop" role="status">
          <FolderOpen size={40} />
          <strong>Откройте кадр в лаборатории</strong>
          <span>Перетащите RAW, JPEG или PNG</span>
        </div>
      ) : null}
      {enlargerOpen && prefs.experimentalEnlarger ? <TestPrint params={params} sourceKey={fileName+(origUrl||"")} hasImage={!!(fileName||origUrl)} blocked={busy||exporting||batching} render={renderPrintTrials} onBusy={setTestPrinting} cancelNative={()=>{if(nativeEngine&&engineOn)void cancelNative();}} apply={exposure=>{patch({printExposure:exposure});flashNote("Применена выдержка пробной печати");}} close={()=>setEnlargerOpen(false)} /> : null}
      <header className="lab-top">
        <div className="workbench-brand">
          <Aperture size={24} />
          <div>
            <strong>SPEKTRAFILM</strong>
            <span>PHOTO LABORATORY</span>
          </div>
        </div>
        <div className="lab-top-left">
          <IconBtn
            label="Открыть"
            disabled={busy || exporting || batching || testPrinting}
            onClick={() => void openNativeOrPicker()}
          >
            <Upload className="size-5" />
          </IconBtn>
          {canUndo ? (
            <IconBtn label="Отменить" onClick={() => undo()}>
              <Undo2 className="size-5" />
            </IconBtn>
          ) : null}
        </div>
        <div className="workbench-title">
          <span>{fileName || "Новый сеанс"}</span>
          <small>{fileName ? "Локальный файл" : "Откройте фотографию для обработки"}</small>
        </div>
        <div className="lab-top-right">
          {prefs.experimentalEnlarger ? <button type="button" className="workbench-command test-print-launch" aria-label="Пробная печать" title="Экспериментальная пробная печать" onClick={()=>setEnlargerOpen(true)}><FlaskConical size={16}/></button> : null}
          <button
            className="workbench-command"
            type="button"
            disabled={!canRedo}
            onClick={() => useDarkroom.getState().redo()}
            aria-label="Повторить"
          >
            <Redo2 size={16} />
          </button>
          {fileName || origUrl ? (
            <button
              type="button"
              className={showOriginal ? "lab-iconbtn is-on" : "lab-iconbtn"}
              aria-label="До / после"
              title="Удерживайте для просмотра оригинала"
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  setShowOriginal(true);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") setShowOriginal(false);
              }}
              onBlur={() => setShowOriginal(false)}
              onPointerDown={(e) => {
                e.preventDefault();
                beforeAfterMoved.current = false;
                beforeAfterStart.current = { x: e.clientX, y: e.clientY };
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                setShowOriginal(true);
              }}
              onPointerMove={(e) => {
                const start = beforeAfterStart.current;
                if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 16) {
                  beforeAfterMoved.current = true;
                }
              }}
              onPointerUp={() => {
                beforeAfterStart.current = null;
                setShowOriginal(false);
              }}
              onPointerCancel={() => {
                beforeAfterStart.current = null;
                beforeAfterMoved.current = true;
                setShowOriginal(false);
              }}
              onClick={(e) => {
                if (beforeAfterMoved.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <Eye className="size-5" strokeWidth={1.7} />
            </button>
          ) : null}
          {canStock ? (
            <IconBtn label="В сток" onClick={() => void addToStock()}>
              <ListPlus className="size-5" strokeWidth={1.7} />
            </IconBtn>
          ) : null}
        </div>
        <button
          type="button"
          className="workbench-export"
          aria-label="Экспортировать кадр"
          disabled={!canSave}
          onClick={() => void saveFrame()}
        >
          <ImageDown size={16} />
          <span>{exporting ? "Экспорт…" : "Экспорт"}</span>
        </button>
      </header>
      <aside className="workbench-library" aria-label="Библиотека и рабочий процесс">
        <div className="workbench-section-label">
          РАБОЧАЯ ОБЛАСТЬ <span>01</span>
        </div>
        <button
          type="button"
          className={`workbench-library-link ${tool !== "gallery" && tool !== "presets" ? "is-active" : ""}`}
          onClick={() => selectTool(params.rawEngine === "spektrafilm" ? "film" : "tone")}
        >
          <SlidersHorizontal size={16} />
          Проявочная
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          className={`workbench-library-link ${tool === "gallery" ? "is-active" : ""}`}
          onClick={() => selectTool("gallery")}
        >
          <Images size={16} />
          Галерея
        </button>
        <button
          type="button"
          className={`workbench-library-link ${tool === "presets" ? "is-active" : ""}`}
          onClick={() => selectTool("presets")}
        >
          <Bookmark size={16} />
          Мои пресеты
        </button>
        <div className="workbench-section-label">ТЕКУЩИЙ КАДР</div>
        {origUrl ? (
          <div className="workbench-source">
            <img src={origUrl} alt="Исходный кадр" />
            <strong>{fileName}</strong>
            <span>
              {full?.width || preview?.width} × {full?.height || preview?.height} px
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="workbench-source is-empty"
            disabled={busy || exporting || batching || testPrinting}
            onClick={() => void openNativeOrPicker()}
          >
            <FolderOpen size={26} />
            <strong>Добавить фотографию</strong>
            <span>RAW · JPEG · PNG</span>
          </button>
        )}
        <div className="workbench-section-label">
          ПРИМЕРЫ <span>02</span>
        </div>
        <div className="workbench-samples">
          {[
            { name: "Лес", file: "forest.jpg" },
            { name: "Натюрморт", file: "still-life.jpg" },
          ].map((sample) => (
            <button
              key={sample.file}
              type="button"
              disabled={busy || exporting || batching || testPrinting}
              onClick={() => void openSample(`/samples/${sample.file}`, sample.file)}
            >
              <img src={`/samples/${sample.file}`} alt="" />
              <span>{sample.name}</span>
            </button>
          ))}
        </div>
        <div className="workbench-pipeline">
          <div className="workbench-section-label">ПРОЦЕСС</div>
          {[
            { id: "camera" as const, name: "Источник и свет" },
            {
              id: params.rawEngine === "spektrafilm" ? ("film" as const) : ("tone" as const),
              name: "Цвет и проявка",
            },
            { id: "export" as const, name: "Готовый отпечаток" },
          ].map((step, i) => (
            <button key={step.id} type="button" onClick={() => selectTool(step.id)}>
              <span>0{i + 1}</span>
              {step.name}
              <ChevronRight size={12} />
            </button>
          ))}
        </div>
        <div className="workbench-local">
          <Monitor size={14} />
          <span>
            Обработка на устройстве
            <br />
            <small>Ваши фото остаются у вас</small>
          </span>
        </div>
      </aside>
      {tool === "gallery" || tool === "stock" ? (
        <div className="lab-stage is-gallery">
          {tool === "stock" ? (
            <StockPane
              items={stockItems}
              busy={batching}
              onExportAll={() => void exportStockAll()}
              onOpen={(item) => void openStock(item)}
              onDelete={(id) => void deleteStock(id)}
              onClearDone={() => void clearDone()}
            />
          ) : (
            <GalleryPane
              tick={galleryTick}
              onOpenFile={() => void openFromFiles()}
              onOpenPhone={(uri, name, roll, more) => {
                rollRef.current = roll.map((s) => ({ uri: s.uri, name: s.name, thumb: s.thumb }));
                rollMore.current = more;
                const at = roll.findIndex((s) => s.uri === uri);
                rollAt.current = at >= 0 ? at : 0;
                const shot = roll[rollAt.current];
                void openFromPhone(uri, name, { thumb: shot?.thumb });
              }}
            />
          )}
          {toast ? (
            <p
              className={error ? "lab-toast text-warn" : "lab-toast text-muted"}
              role="status"
              onClick={clearToasts}
            >
              {toast}
            </p>
          ) : null}
          {status ? (
            <div className="lab-status" role="status" aria-live="polite">
              <span className="shrink-0">{status.label}</span>
              <div className="lab-status-track">
                <div
                  className={status.busy ? "lab-status-fill is-busy" : "lab-status-fill"}
                  style={{ width: `${Math.max(6, status.pct)}%` }}
                />
              </div>
              <span className="tabular-nums">{status.pct}%</span>
              {status.busy || exporting || batching ? (
                <button type="button" className="lab-status-cancel" onClick={cancelWork}>
                  Отмена
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="lab-stage">
          <div className="lab-lcd">
            <div className="workbench-document">
              <span>
                <span className="workbench-live-dot" />
                {showOriginal ? "Оригинал" : "Предпросмотр"}
              </span>
              <span>{fileName || "Нет открытого кадра"}</span>
              <button
                type="button"
                aria-pressed={showClip}
                onClick={() => setShowClip(!showClip)}
                title="Показать пересветы (без рамки)"
                disabled={params.frameStyle !== "none"}
              >
                <ScanLine size={14} />
                Пересветы
              </button>
            </div>
            <div className="lab-hist-float">
              <Histogram url={showOriginal ? origUrl : procUrl || origUrl} />
            </div>
            <Viewer
              originalUrl={origUrl}
              processedUrl={procUrl}
              showOriginal={showOriginal}
              gray18={params.gray18Canvas}
              padding={params.whitePadding}
              frameStyle={params.frameStyle}
              frameSettings={params}
              processing={busy}
              chromeHidden={chromeHidden}
              clip={showClip}
              sourceKey={fileName ?? ""}
              pickingWb={pickingWb}
              onToggleChrome={() => {
                if (chromeHidden) {
                  setChromeHidden(false);
                  return;
                }
                if (prefs.tapHidesChrome) setChromeHidden(true);
              }}
              onHoldOriginal={setShowOriginal}
              onToggleClip={() => setShowClip(!showClip)}
              onOpen={() => void openNativeOrPicker()}
              onInstall={isNativeRawAvailable() ? undefined : () => void downloadApk()}
              onSample={(url, name) => void openSample(url, name)}
              onPickGray={(nx, ny) => void pickGray(nx, ny)}
              onBrowse={browseRoll}
            />
            {toast ? (
              <p
                className={error ? "lab-toast text-warn" : "lab-toast text-muted"}
                role="status"
                onClick={clearToasts}
              >
                {toast}
              </p>
            ) : null}
            {confirmExport ? (
              <div className="lab-confirm" role="dialog" aria-label="Подтверждение сохранения">
                <p>Сохранить полный кадр в галерею?</p>
                <div className="lab-confirm-row">
                  <button
                    type="button"
                    className="lab-log-btn"
                    onClick={() => setConfirmExport(false)}
                  >
                    Нет
                  </button>
                  <button
                    type="button"
                    className="lab-log-btn is-copy"
                    onClick={() => {
                      skipConfirm.current = true;
                      void saveFrame();
                    }}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : null}
            {status ? (
              <div className="lab-status" role="status" aria-live="polite">
                <span className="shrink-0">{status.label}</span>
                <div className="lab-status-track">
                  <div
                    className={status.busy ? "lab-status-fill is-busy" : "lab-status-fill"}
                    style={{ width: `${Math.max(6, status.pct)}%` }}
                  />
                </div>
                <span className="tabular-nums">{status.pct}%</span>
                {status.busy || exporting ? (
                  <button type="button" className="lab-status-cancel" onClick={cancelWork}>
                    Отмена
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
      <aside
        className={[
          "lab-dock",
          `is-${sheet}`,
          tool === "gallery" && "is-tools-only",
          tool === "stock" && "is-tools-only",
          tool === "presets" && "is-presets",
          tool === "log" && "is-log",
          tool === "settings" && "is-settings",
          tool === "tone" && "is-tone",
          tool === "film" && "is-film",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="lab-sheet-handle"
          aria-label="Размер панели"
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          onClick={onSheetClick}
        />
        <div className="lab-dock-head">
          <span className="lab-dock-title">
            {tool === "settings" ? "Опции" : toolLabel || "Develop"}
          </span>
          {tool === "settings" ? (
            <button
              type="button"
              className={resetAllArmed ? "lab-dock-resetall is-warn" : "lab-dock-resetall"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!resetAllArmed) {
                  setResetAllArmed(true);
                  return;
                }
                setResetAllArmed(false);
                const s = useDarkroom.getState();
                s.reset();
                s.resetPrefs();
                s.setAdvanced(false);
                haptic("menu");
                flashNote("Все настройки сброшены");
              }}
            >
              {resetAllArmed ? "Точно сбросить?" : "Сбросить всё"}
            </button>
          ) : tool !== "gallery" && tool !== "stock" && tool !== "presets" && tool !== "log" ? (
            <IconBtn label="Сбросить вкладку" onClick={() => resetTool()}>
              <RotateCcw className="size-4" />
            </IconBtn>
          ) : null}
        </div>
        {tool !== "gallery" && tool !== "stock" ? (
          <div className="lab-sliders" key={params.rawEngine}>
            <Panel
              catalog={catalog}
              onSave={() => void saveFrame()}
              saving={exporting}
              canSave={canSave}
              onNotice={flashNote}
              onOpenEnlarger={()=>setEnlargerOpen(true)}
              onAutoWb={() => void runAutoWb()}
              onPickWb={togglePickWb}
              pickingWb={pickingWb}
              autoWbBusy={autoWbBusy}
              hasImage={!!(fileName || origUrl || fullLinear)}
              previewUrl={procUrl || origUrl}
            />
          </div>
        ) : null}
      </aside>
      <footer className="workbench-status">
        <span>
          <span className={busy ? "workbench-live-dot is-busy" : "workbench-live-dot"} />
          {busy ? "Обработка кадра" : "Готово"}
        </span>
        <span>
          {nativeEngine ? "Нативный движок" : "Веб-движок"}
          {renderMs != null ? ` · ${Math.round(renderMs)} мс` : ""}
        </span>
        <span>
          {pendingStock} в очереди · {params.exportColorSpace.toUpperCase()}
        </span>
        <span className="workbench-shortcut">
          Ctrl O — открыть · Ctrl S — экспорт · Ctrl Z — отменить
        </span>
      </footer>
      <nav
        className={prefs.showToolLabels ? "lab-rail has-labels" : "lab-rail"}
        aria-label="Инструменты"
      >
        {dockTools(params.rawEngine, params.filmStock, prefs.showLabTabs, tool).map((item) => {
          const Icon = TOOL_ICONS[item.id];
          const on = tool === item.id;
          const changes = toolChangeCount(params, item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={on ? "lab-tool is-on" : "lab-tool"}
              aria-pressed={on}
              aria-label={item.label}
              title={changes ? `${item.label}: изменено параметров — ${changes}` : item.label}
              aria-description={changes ? `Изменено параметров: ${changes}` : "Без изменений"}
              onPointerDown={() => onToolHoldDown(item.id)}
              onPointerUp={onToolHoldUp}
              onPointerCancel={onToolHoldUp}
              onClick={() => {
                if (holdResetFired.current) return;
                if (on && sheet === "peek") {
                  animateSheet("half");
                  return;
                }
                selectTool(item.id);
              }}
            >
              <Icon className="size-5" strokeWidth={1.6} />
              {changes > 0 ? <span className="lab-edited-dot" aria-hidden="true" /> : null}
              {item.id === "stock" && pendingStock > 0 ? (
                <span className="lab-tool-badge">{pendingStock > 9 ? "9+" : pendingStock}</span>
              ) : null}
              {prefs.showToolLabels ? <span className="lab-tool-label">{item.label}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          className={tool === "settings" ? "lab-tool is-on" : "lab-tool"}
          aria-pressed={tool === "settings"}
          aria-label="Опции"
          title="Опции"
          onClick={() => {
            if (tool === "settings") {
              selectTool(params.rawEngine === "spektrafilm" ? "film" : "tone");
              return;
            }
            selectTool("settings");
          }}
        >
          <Settings className="size-5" strokeWidth={1.6} />
          {prefs.showToolLabels ? <span className="lab-tool-label">Опции</span> : null}
        </button>
      </nav>
    </div>
  );
}
