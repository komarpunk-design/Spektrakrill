import { TOOL_KEYS } from "./tool-state.ts";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { defaultParams, sanitizeParams } from "./defaults";
import { applyEngineSlot, snapshotEngine, type EngineSlots } from "./engine-slots";
import { sanitizeRawEngine, type RawEngine } from "./raw-engine";
import { stockParamsForFilm } from "./stock-look";
import type { DarkroomParams } from "./types";

export type SourceKind = "none" | "file";
export type ToolId =
  | "film"
  | "development"
  | "emulsion"
  | "tone"
  | "presets"
  | "camera"
  | "print"
  | "scan"
  | "crop"
  | "stock"
  | "gallery"
  | "lab"
  | "export"
  | "log"
  | "settings";

export type AppPrefs = {
  showToolLabels: boolean;
  confirmExport: boolean;
  resetOnOpen: boolean;
  showLabTabs: boolean;
  experimentalEnlarger: boolean;
  tapHidesChrome: boolean;
};

export const defaultAppPrefs = (): AppPrefs => ({
  showToolLabels: true,
  confirmExport: false,
  resetOnOpen: true,
  showLabTabs: false,
  experimentalEnlarger: false,
  tapHidesChrome: false,
});

export type Look = {
  id: string;
  name: string;
  at: number;
  params: DarkroomParams;
  favorite?: boolean;
};

export const LOOKS_CAP = 24;
export const IMPORTED_CAP = 80;

function debounceLocalStorage(ms: number): StateStorage {
  let timer = 0;
  let pendingName = "";
  let pendingValue: string | null = null;
  const flush = () => {
    timer = 0;
    if (pendingValue == null) return;
    try {
      localStorage.setItem(pendingName, pendingValue);
    } catch {
      /* quota */
    }
    pendingValue = null;
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && timer) {
        window.clearTimeout(timer);
        flush();
      }
    });
  }
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pendingName = name;
      pendingValue = value;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(flush, ms);
    },
    removeItem: (name) => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      pendingValue = null;
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

const TOOL_IDS: ToolId[] = [
  "film",
  "development",
  "emulsion",
  "tone",
  "presets",
  "camera",
  "print",
  "scan",
  "crop",
  "stock",
  "gallery",
  "lab",
  "export",
  "log",
  "settings",
];

const LEGACY_TOOLS: Record<string, ToolId> = {
  light: "camera",
  color: "print",
  effects: "film",
  detail: "scan",
};



interface DarkroomStore {
  params: DarkroomParams;
  source: SourceKind;
  fileName: string | null;
  compare: number;
  showOriginal: boolean;
  advanced: boolean;
  scrubbing: boolean;
  tool: ToolId;
  prefs: AppPrefs;
  chromeHidden: boolean;
  undoStack: DarkroomParams[];
  redoStack: DarkroomParams[];
  looks: Look[];
  imported: Look[];
  appliedLookId: string | null;
  showClip: boolean;
  frameW: number;
  frameH: number;
  engineSlots: EngineSlots;
  setParam: <K extends keyof DarkroomParams>(key: K, value: DarkroomParams[K]) => void;
  patch: (partial: Partial<DarkroomParams>) => void;
  reset: () => void;
  resetTool: () => void;
  newFrame: () => void;
  setSource: (s: SourceKind, fileName?: string | null) => void;
  setFrame: (w: number, h: number) => void;
  setCompare: (v: number) => void;
  setShowOriginal: (v: boolean) => void;
  setAdvanced: (v: boolean) => void;
  setScrubbing: (v: boolean) => void;
  setTool: (t: ToolId) => void;
  setPref: <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void;
  resetPrefs: () => void;
  setChromeHidden: (v: boolean) => void;
  setShowClip: (v: boolean) => void;
  undo: () => void;
  redo: () => void;
  saveLook: (name: string, extra?: { favorite?: boolean }) => void;
  applyLook: (id: string) => void;
  applyParams: (params: DarkroomParams, lookId?: string | null) => void;
  deleteLook: (id: string) => void;
  deleteImported: (id: string) => void;
  renameLook: (id: string, name: string) => void;
  toggleFavorite: (id: string) => void;
  reorderLooks: (from: number, to: number) => void;
  selectEngine: (engine: RawEngine) => void;
  importPresets: (incoming: Look[]) => { applied: Look | null; added: number; updated: number };
  applyFilmDefaults: (filmId: string) => Promise<void>;
}

const UNDO_CAP = 30;
const LOOKS_CAP_N = LOOKS_CAP;
const IMPORTED_CAP_N = IMPORTED_CAP;

function findLook(looks: Look[], imported: Look[], id: string): Look | undefined {
  return looks.find((l) => l.id === id) ?? imported.find((l) => l.id === id);
}

function sanitizeLooks(raw: unknown): Look[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((look) => look && typeof look === "object" && look.params)
    .map((look) => ({
      id: String(look.id ?? `look-${look.at ?? Date.now()}`),
      name: String(look.name ?? "Рецепт"),
      at: Number(look.at) || Date.now(),
      favorite: Boolean(look.favorite),
      params: sanitizeParams({
        ...defaultParams(),
        ...look.params,
        cameraDiffusion: look.params?.cameraDiffusion,
        printDiffusion: look.params?.printDiffusion,
      }),
    }));
}

function pushUndo(stack: DarkroomParams[], params: DarkroomParams): DarkroomParams[] {
  const next = stack.length >= UNDO_CAP ? stack.slice(stack.length - UNDO_CAP + 1) : stack.slice();
  next.push(params);
  return next;
}

export function cropForAspect(
  imgW: number,
  imgH: number,
  aw: number,
  ah: number,
  cover = 0.92,
): { cropSizeX: number; cropSizeY: number } {
  const w = Math.max(8, imgW);
  const h = Math.max(8, imgH);
  const imgA = w / h;
  const want = aw / ah;
  let cw: number;
  let ch: number;
  if (imgA > want) {
    ch = h * cover;
    cw = ch * want;
  } else {
    cw = w * cover;
    ch = cw / want;
  }
  const long = Math.max(w, h);
  return { cropSizeX: cw / long, cropSizeY: ch / long };
}

export const useDarkroom = create<DarkroomStore>()(
  persist(
    (set, get) => ({
      params: defaultParams(),
      source: "none",
      fileName: null,
      compare: 1,
      showOriginal: false,
      advanced: false,
      scrubbing: false,
      tool: "film",
      prefs: defaultAppPrefs(),
      chromeHidden: false,
      undoStack: [],
      redoStack: [],
      looks: [],
      imported: [],
      appliedLookId: null,
      showClip: false,
      frameW: 3,
      frameH: 2,
      engineSlots: {},
      setParam: (key, value) =>
        set((s) => {
          if (s.params[key] === value) return s;
          const params = { ...s.params, [key]: value };
          if (s.scrubbing) return { params };
          return {
            params,
            appliedLookId: null,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        }),
      patch: (partial) =>
        set((s) => {
          const params = { ...s.params, ...partial };
          if (s.scrubbing) return { params };
          return {
            params,
            appliedLookId: null,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        }),
      reset: () =>
        set((s) => ({
          params: defaultParams(),
          appliedLookId: null,
          engineSlots: {},
          advanced: false,
          undoStack: pushUndo(s.undoStack, s.params),
          redoStack: [],
        })),
      newFrame: () =>
        set((s) => {
          const next = s.prefs.resetOnOpen
            ? {
                ...defaultParams(),
                rawEngine: s.params.rawEngine,
                rawEngineStyle: s.params.rawEngineStyle,
              }
            : s.params;
          return {
            params: next,
            appliedLookId: s.prefs.resetOnOpen ? null : s.appliedLookId,
            showOriginal: false,
            compare: 1,
            showClip: false,
            tool: next.rawEngine === "spektrafilm" ? "film" : "tone",
            scrubbing: false,
            undoStack: [],
            redoStack: [],
          };
        }),
      resetTool: () =>
        set((s) => {
          const d = defaultParams();
          if (s.tool === "settings") {
            const next = { ...s.params };
            for (const k of TOOL_KEYS.settings) {
              (next as Record<string, unknown>)[k] = d[k];
            }
            return {
              prefs: defaultAppPrefs(),
              params: next,
              appliedLookId: null,
              undoStack: pushUndo(s.undoStack, s.params),
              redoStack: [],
            };
          }
          const next = { ...s.params };
          for (const k of TOOL_KEYS[s.tool]) {
            (next as Record<string, unknown>)[k] = d[k];
          }
          return {
            params: next,
            appliedLookId: null,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        }),
      setSource: (source, fileName = null) => set({ source, fileName }),
      setFrame: (frameW, frameH) => set({ frameW, frameH }),
      setCompare: (compare) => set({ compare }),
      setShowOriginal: (showOriginal) => set({ showOriginal }),
      setAdvanced: (advanced) => set({ advanced }),
      setScrubbing: (scrubbing) =>
        set((s) => {
          if (scrubbing === s.scrubbing) return s;
          if (scrubbing) {
            return {
              scrubbing: true,
              undoStack: pushUndo(s.undoStack, s.params),
              redoStack: [],
            };
          }
          return { scrubbing: false };
        }),
      setTool: (tool) => set({ tool, chromeHidden: false }),
      setPref: (key, value) =>
        set((s) => {
          if (s.prefs[key] === value) return s;
          return { prefs: { ...s.prefs, [key]: value } };
        }),
      resetPrefs: () => set({ prefs: defaultAppPrefs() }),
      setChromeHidden: (chromeHidden) => set({ chromeHidden }),
      setShowClip: (showClip) => set({ showClip }),
      undo: () =>
        set((s) => {
          if (!s.undoStack.length) return s;
          const params = s.undoStack[s.undoStack.length - 1];
          return {
            params,
            appliedLookId: null,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, s.params],
          };
        }),
      redo: () =>
        set((s) => {
          if (!s.redoStack.length) return s;
          const params = s.redoStack[s.redoStack.length - 1];
          return {
            params,
            appliedLookId: null,
            redoStack: s.redoStack.slice(0, -1),
            undoStack: pushUndo(s.undoStack, s.params),
          };
        }),
      saveLook: (name, extra) =>
        set((s) => {
          const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `look-${Date.now()}`;
          const look: Look = {
            id,
            name,
            at: Date.now(),
            params: { ...s.params },
            favorite: Boolean(extra?.favorite),
          };
          return { looks: [...s.looks, look].slice(-LOOKS_CAP_N), appliedLookId: id };
        }),
      applyLook: (id) =>
        set((s) => {
          const look = findLook(s.looks, s.imported, id);
          if (!look) return s;
          return {
            params: sanitizeParams(look.params),
            appliedLookId: look.id,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        }),
      applyParams: (next, lookId = null) =>
        set((s) => ({
          params: sanitizeParams(next),
          appliedLookId: lookId,
          undoStack: pushUndo(s.undoStack, s.params),
          redoStack: [],
        })),
      deleteLook: (id) =>
        set((s) => ({
          looks: s.looks.filter((l) => l.id !== id),
          appliedLookId: s.appliedLookId === id ? null : s.appliedLookId,
        })),
      deleteImported: (id) =>
        set((s) => ({
          imported: s.imported.filter((l) => l.id !== id),
          appliedLookId: s.appliedLookId === id ? null : s.appliedLookId,
        })),
      renameLook: (id, name) =>
        set((s) => {
          const n = name.trim();
          if (!n) return s;
          const map = (list: Look[]) => list.map((l) => (l.id === id ? { ...l, name: n } : l));
          return { looks: map(s.looks), imported: map(s.imported) };
        }),
      toggleFavorite: (id) =>
        set((s) => {
          const map = (list: Look[]) =>
            list.map((l) => (l.id === id ? { ...l, favorite: !l.favorite } : l));
          return { looks: map(s.looks), imported: map(s.imported) };
        }),
      reorderLooks: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.looks.length || to >= s.looks.length) {
            return s;
          }
          const next = s.looks.slice();
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
          return { looks: next };
        }),
      selectEngine: (engine) =>
        set((s) => {
          const nextEng = sanitizeRawEngine(engine);
          const current = sanitizeRawEngine(s.params.rawEngine);
          if (current === nextEng) return s;
          const slots: EngineSlots = {
            ...s.engineSlots,
            [current]: snapshotEngine(s.params, s.tool),
          };
          const applied = applyEngineSlot(s.params, nextEng, slots[nextEng]);
          let tool = (TOOL_IDS.includes(applied.tool as ToolId) ? applied.tool : "film") as ToolId;
          const stay: ToolId[] = ["settings", "presets", "gallery", "log", "lab", "export", "camera", "crop"];
          if (stay.includes(s.tool)) tool = s.tool;
          return {
            engineSlots: slots,
            params: applied.params,
            tool,
            appliedLookId: null,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        }),
      importPresets: (incoming) => {
        const result: { applied: Look | null; added: number; updated: number } = {
          applied: null,
          added: 0,
          updated: 0,
        };
        if (!incoming.length) return result;
        set((s) => {
          const next = s.imported.slice();
          let added = 0;
          let updated = 0;
          for (const inc of incoming) {
            const params = sanitizeParams(inc.params);
            const i = next.findIndex(
              (l) => l.name.trim().toLowerCase() === inc.name.trim().toLowerCase(),
            );
            if (i >= 0) {
              next[i] = { ...next[i], params, at: Date.now() };
              updated++;
            } else {
              next.push({ ...inc, params, at: Date.now() });
              added++;
            }
          }
          const imported =
            next.length > IMPORTED_CAP_N ? next.slice(next.length - IMPORTED_CAP_N) : next;
          const appliedName = incoming[0].name.trim().toLowerCase();
          const live = imported.find((l) => l.name.trim().toLowerCase() === appliedName) ?? {
            ...incoming[0],
            params: { ...incoming[0].params },
          };
          result.applied = live;
          result.added = added;
          result.updated = updated;
          return {
            imported,
            params: sanitizeParams(live.params),
            appliedLookId: live.id,
            undoStack: pushUndo(s.undoStack, s.params),
            redoStack: [],
          };
        });
        return result;
      },
      applyFilmDefaults: async (filmId) => {
        const prev = get().params;
        const next = stockParamsForFilm(filmId, prev);
        if (next === prev || next.filmStock === prev.filmStock) return;
        set((s) => ({
          params: next,
          appliedLookId: null,
          undoStack: pushUndo(s.undoStack, s.params),
          redoStack: [],
        }));
      },
    }),
    {
      name: "spektrafilm-lab",
      skipHydration: true,
      storage: createJSONStorage(() => debounceLocalStorage(450)),
      partialize: (s) => ({
        params: s.params,
        advanced: s.advanced,
        tool: s.tool,
        prefs: s.prefs,
        looks: s.looks,
        imported: s.imported,
        engineSlots: s.engineSlots,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.params = sanitizeParams(state.params);
        state.params.exportMaxEdge = 0;
        state.params.gpuExport = true;
        state.params.upscaleFactor = 1;
        const mapped = LEGACY_TOOLS[String(state.tool)] ?? state.tool;
        state.tool = TOOL_IDS.includes(mapped as ToolId) ? (mapped as ToolId) : "film";
        state.prefs = {
          ...defaultAppPrefs(),
          ...(state.prefs ?? {}),
        };
        state.prefs.showToolLabels = state.prefs.showToolLabels !== false;
        state.prefs.confirmExport = Boolean(state.prefs.confirmExport);
        state.prefs.resetOnOpen = state.prefs.resetOnOpen !== false;
        state.prefs.showLabTabs = Boolean(state.prefs.showLabTabs);
        state.prefs.experimentalEnlarger = state.prefs.experimentalEnlarger === true;
        state.prefs.tapHidesChrome = Boolean(state.prefs.tapHidesChrome);
        if (state.source !== "file") {
          state.source = "none";
          state.fileName = null;
        }
        state.scrubbing = false;
        state.chromeHidden = false;
        state.undoStack = [];
        state.redoStack = [];
        state.looks = sanitizeLooks(state.looks).slice(-LOOKS_CAP_N);
        state.imported = sanitizeLooks(state.imported).slice(-IMPORTED_CAP_N);
        state.engineSlots = state.engineSlots && typeof state.engineSlots === "object" ? state.engineSlots : {};
        state.appliedLookId = null;
        state.showClip = false;
      },
    },
  ),
);
