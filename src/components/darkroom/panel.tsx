import { FRAME_STYLES, isOriginalEdge } from "@/lib/film/photo-frame";
import { stockDetail, stockSpec, stockCategory } from "@/lib/film/stock-details";
import { Field, Select, Segmented, SliderRow, ToggleRow } from "@/components/ui/control";
import { isNativeRawAvailable, pickNativeText, getNativeLog, clearNativeLog, openExternalUrl } from "@/lib/film/native-raw";
import { clearJsLog, jsLogText, pushLabLog } from "@/lib/film/lab-log";
import { diffParams, GROUP_LABEL, type ParamChange } from "@/lib/film/preset-diff";
import { serializeLook, spektraToParams, unwrapPresetText, isPresetUrl } from "@/lib/film/preset-json";
import { applySpektraImport, importNotice } from "@/lib/film/import-pack";
import { isUserProfile, removeUserProfile, shelfGroups } from "@/lib/film/user-profiles";
import type { Catalog } from "@/lib/film/profiles";
import { APP_COPY, APP_NAME, APP_VERSION, CHANNEL_HANDLE, CHANNEL_URL } from "@/lib/brand";
import { cropForAspect, useDarkroom } from "@/lib/film/store";
import {
  boxShortName,
  FILM_GROUPS,
  PAPER_GROUPS,
  filmPack,
  type AutoExposureMethod,
  type DarkroomParams,
  type DiffusionFamily,
  type ExportColorSpace,
  type InputGamutMode,
  type OutputGamutMode,
  type RgbToRawMethod,
  isFilmBypass,
  isPaperBypass,
} from "@/lib/film/types";
import {
  RAW_ENGINES,
  rawEngineNeeded,
  rawEngineStyleLabel,
  stylesFor,
  type RawEngine,
  type RawEngineStyle,
} from "@/lib/film/raw-engine";
import { WB_TINT_MIN, WB_TMAX, WB_TMIN } from "@/lib/film/wb-temp-tint";
import { defaultDigitalTone, digitalToneNeeded } from "@/lib/film/digital-tone";
import { PresetManager } from "@/components/darkroom/preset-manager";
import { EngineBar } from "@/components/darkroom/engine-bar";
import { Copy, RotateCcw, RotateCw, Search, Trash2, ChevronRight, ChevronLeft, Info, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export const TOOLS = [
  { id: "film" as const, label: "Плёнка" },
  { id: "tone" as const, label: "Тон" },
  { id: "presets" as const, label: "Пресеты" },
  { id: "camera" as const, label: "Камера" },
  { id: "print" as const, label: "Печать" },
  { id: "scan" as const, label: "Скан" },
  { id: "crop" as const, label: "Кадр" },
  { id: "stock" as const, label: "Сток" },
  { id: "gallery" as const, label: "Галерея" },
  { id: "lab" as const, label: "Лаб" },
  { id: "export" as const, label: "Экспорт" },
  { id: "log" as const, label: "Журнал" },
  { id: "settings" as const, label: "Опции" },
];

const PREVIEW_SIZES = [960, 1280, 1600, 2048, 2560, 3200, 4096] as const;

function nearestPreview(n: number): number {
  let best: number = PREVIEW_SIZES[1];
  let dist = Infinity;
  for (const size of PREVIEW_SIZES) {
    const d = Math.abs(size - n);
    if (d < dist) {
      dist = d;
      best = size;
    }
  }
  return best;
}

export function dockTools(
  engine: string,
  filmStock: string,
  showLab: boolean,
  current: string,
): { id: (typeof TOOLS)[number]["id"]; label: string }[] {
  const spektra = engine === "spektrafilm";
  const bypass = isFilmBypass(filmStock);
  const order = ["gallery", "presets", "film", "tone", "camera", "print", "scan", "crop", "stock", "export", "lab", "log"];
  return TOOLS.filter((t) => {
    if (t.id === "settings") return false;

    if (t.id === "tone") return !spektra;
    if (t.id === "film") return spektra;
    if (t.id === "print" || t.id === "scan") return spektra && !bypass;
    if (t.id === "lab" || t.id === "log") return showLab || current === t.id;
    return true;
  }).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

type FactoryLook = { id: string; name: string; group: string; params: DarkroomParams };

const PRESET_GROUPS = ["Portrait", "Landscape", "Consumer", "Slide", "Cinema", "Low Light", "Creative", "Neutral"];
const PRESET_GROUP_RU: Record<string, string> = {
  Portrait: "Портрет",
  Landscape: "Пейзаж",
  Consumer: "Снимок",
  Slide: "Слайд",
  Cinema: "Кино",
  "Low Light": "Ночь",
  Creative: "Креатив",
  Neutral: "Нейтраль",
};

const STYLE_CHIP: Record<string, string> = {
  standard: "Std",
  nature: "Природа",
  portrait: "Портрет",
  landscape: "Пейзаж",
  vivid: "Vivid",
  natural: "Natural",
  reproduction: "Репро",
};

function hay(q: string, ...parts: Array<string | number | null | undefined>) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return parts.some((p) => String(p ?? "").toLowerCase().includes(n));
}

type Receipt = {
  title: string;
  subtitle: string;
  changes: ParamChange[];
};

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function BoxShelf({
  groups,
  value,
  onChange,
  items,
  kind,
  query = "",
}: {
  groups: { label: string; ids: string[] }[];
  value: string;
  onChange: (id: string) => void;
  items: { id: string; name: string; iso?: number | null }[];
  kind: "film" | "paper";
  query?: string;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ids = groups
    .flatMap((group) => group.ids)
    .filter((id) => {
      const item = byId.get(id);
      if (id === "none") {
        return kind === "paper"
          ? hay(query, "none", "без бумаги", "off", "no paper")
          : hay(query, "none", "без плёнки", "исходник", "raw");
      }
      return hay(query, id, item?.name, item?.iso, boxShortName(item?.name ?? id), stockDetail(id)?.summary, stockDetail(id)?.manufacturer, stockCategory(id));
    });
  const selected = byId.get(value);
  const selectedDetail = stockDetail(value);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = trackRef.current?.querySelector(".lab-box.is-on") as HTMLElement | null;
    on?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [value]);

  if (!ids.length) {
    return <p className="lab-find-empty">Нет такой плёнки</p>;
  }
  return (
    <div className="lab-shelf">
      {selected && value !== "none" ? <section className="lab-stock-detail" aria-label="Сведения о профиле" aria-live="polite">
        <strong>{selected.name}</strong>
        <span>{stockCategory(value)}{stockSpec(selected) ? ` · ${stockSpec(selected)}` : ""}</span>
        {selectedDetail ? <p>{selectedDetail.summary}</p> : <p>Пользовательский профиль. Проверьте результат на своём кадре.</p>}
      </section> : null}
      <div className="lab-shelf-track" ref={trackRef}>
        {ids.map((id) => {
          const item = byId.get(id);
          const none = id === "none";
          const name = none ? (kind === "paper" ? "Без бумаги" : "Без плёнки") : item?.name ?? id;
          const pack = filmPack(id);
          const iso = none
            ? kind === "paper"
              ? "OFF"
              : "RAW"
            : item?.iso == null
            ? kind === "paper"
              ? id.includes("2383") || id.includes("2393")
                ? "PF"
                : "RA4"
              : "—"
            : String(item.iso);
          return (
            <button
              key={id}
              type="button"
              className={`lab-box is-${pack}${none ? " is-none" : ""}${value === id ? " is-on" : ""}`}
              onClick={() => onChange(id)}
              title={name}
              aria-label={name}
              aria-pressed={value === id}
            >
              <span className="lab-box-band" />
              <span className="lab-box-iso">{iso}</span>
              <span className="lab-box-title">{boxShortName(name)}</span>
              {id !== "none" && stockDetail(id)?.balance ? <span className="lab-box-balance">{stockDetail(id)?.balance === "tungsten" ? "Лампы" : "Дневной"}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PresetRow({
  name,
  meta,
  on,
  onApply,
  onDelete,
}: {
  name: string;
  meta?: string;
  on: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`lab-preset${on ? " is-on" : ""}`}>
      <button type="button" className="lab-preset-main" onClick={onApply}>
        <span className="lab-preset-name">{name}</span>
        {meta ? <span className="lab-preset-meta">{meta}</span> : null}
      </button>
      {onDelete ? (
        <button
          type="button"
          className="lab-preset-del"
          aria-label={`Удалить ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function ReceiptCard({
  title,
  subtitle,
  changes,
  onClose,
}: {
  title: string;
  subtitle: string;
  changes: ParamChange[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? changes : changes.slice(0, 8);
  const more = changes.length - shown.length;
  let lastGroup = "";
  return (
    <div className="lab-receipt">
      <div className="lab-receipt-head">
        <span>{title}</span>
        <button type="button" className="lab-receipt-x" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      {subtitle ? <p className="lab-receipt-sub">{subtitle}</p> : null}
      {changes.length ? (
        <ul className="lab-receipt-list">
          {shown.map((c) => {
            const head = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.key}>
                {head ? <b className="lab-receipt-group">{GROUP_LABEL[c.group]}</b> : null}
                <span className="lab-receipt-label">{c.label}</span>
                <span className="lab-receipt-vals">
                  {c.from}
                  <i>→</i>
                  {c.to}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="lab-receipt-sub">Совпало с текущими.</p>
      )}
      {more > 0 ? (
        <button type="button" className="lab-receipt-more" onClick={() => setOpen(true)}>
          ещё {more}
        </button>
      ) : null}
    </div>
  );
}

export function Panel({
  catalog,
  onSave,
  saving,
  canSave,
  onNotice,
  onAutoWb,
  onPickWb,
  pickingWb,
  autoWbBusy = false,
  hasImage = false,
  previewUrl = null,
}: {
  catalog: Catalog;
  onSave?: () => void;
  saving?: boolean;
  canSave?: boolean;
  onNotice?: (msg: string) => void;
  onAutoWb?: () => void;
  onPickWb?: () => void;
  pickingWb?: boolean;
  autoWbBusy?: boolean;
  hasImage?: boolean;
  previewUrl?: string | null;
}) {
  const params = useDarkroom((s) => s.params);
  const setParam = useDarkroom((s) => s.setParam);
  const patch = useDarkroom((s) => s.patch);
  const applyFilmDefaults = useDarkroom((s) => s.applyFilmDefaults);
  const advanced = useDarkroom((s) => s.advanced);
  const tool = useDarkroom((s) => s.tool);
  const setTool = useDarkroom((s) => s.setTool);
  const looks = useDarkroom((s) => s.looks);
  const imported = useDarkroom((s) => s.imported);
  const appliedLookId = useDarkroom((s) => s.appliedLookId);
  const saveLook = useDarkroom((s) => s.saveLook);
  const applyLook = useDarkroom((s) => s.applyLook);
  const deleteLook = useDarkroom((s) => s.deleteLook);
  const deleteImported = useDarkroom((s) => s.deleteImported);
  const applyParams = useDarkroom((s) => s.applyParams);
  const setAdvanced = useDarkroom((s) => s.setAdvanced);
  const frameW = useDarkroom((s) => s.frameW);
  const frameH = useDarkroom((s) => s.frameH);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLTextAreaElement>(null);
  const [factory, setFactory] = useState<FactoryLook[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [find, setFind] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [dropArmed, setDropArmed] = useState(false);

  const names = useMemo(
    () => ({
      film: Object.fromEntries(catalog.films.map((f) => [f.id, f.name])),
      paper: Object.fromEntries(catalog.papers.map((p) => [p.id, p.name])),
    }),
    [catalog],
  );

  useEffect(() => {
    fetch("/profiles/presets.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.presets?.length) return;
        setFactory(
          data.presets.map((p: { id: string; name: string; group?: string; params?: Record<string, unknown> }) => ({
            id: p.id,
            name: p.name,
            group: p.group ?? "Look",
            params: spektraToParams(p.params ?? p),
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tool !== "presets") setReceipt(null);
    setFind("");
    setFindOpen(false);
    setDropArmed(false);
  }, [tool]);

  useEffect(() => {
    if (!receipt) return;
    const t = window.setTimeout(() => setReceipt(null), 4200);
    return () => window.clearTimeout(t);
  }, [receipt]);

  useEffect(() => {
    if (!dropArmed) return;
    const clear = (e: PointerEvent) => {
      const node = e.target as HTMLElement | null;
      if (node?.closest?.(".lab-film-drop")) return;
      setDropArmed(false);
    };
    window.addEventListener("pointerdown", clear, true);
    return () => window.removeEventListener("pointerdown", clear, true);
  }, [dropArmed]);

  const runWithReceipt = (title: string, subtitle: string, run: () => void) => {
    const before = useDarkroom.getState().params;
    run();
    const after = useDarkroom.getState().params;
    setReceipt({ title, subtitle, changes: diffParams(before, after, names) });
  };

  const onImportText = (text: string, sourceName?: string) => {
    setImportBusy(true);
    void applySpektraImport(unwrapPresetText(text), sourceName)
      .then((report) => {
        const bits: string[] = [];
        if (report.films.length) bits.push(report.films.join(", "));
        if (report.papers.length) bits.push(report.papers.join(", "));
        if (report.looksAdded) bits.push(`+${report.looksAdded} пресетов`);
        if (report.looksUpdated) bits.push(`обновлено ${report.looksUpdated}`);
        setReceipt({
          title: report.appliedLook ?? report.films[0] ?? report.papers[0] ?? "Импорт",
          subtitle: bits.join(" · "),
          changes: [],
        });
        onNotice?.(importNotice(report));
        if (importRef.current) importRef.current.value = "";
      })
      .catch((err) => {
        const code = err instanceof Error ? err.message : "";
        if (code === "full") onNotice?.("Слишком много своих профилей (16)");
        else if (code === "json" || code === "empty") onNotice?.("Не удалось прочитать JSON");
        else onNotice?.("JSON не похож на профиль или пресет Spektrafilm");
      })
      .finally(() => setImportBusy(false));
    return true;
  };

  const loadImportSource = async (text: string) => {
    const t = unwrapPresetText(text);
    if (!t) return;
    setImportBusy(true);
    try {
      if (isPresetUrl(t)) {
        const res = await fetch(t);
        if (!res.ok) throw new Error("http");
        onImportText(await res.text(), t);
        return;
      }
      onImportText(t);
    } catch {
      onNotice?.("Не удалось прочитать JSON");
    } finally {
      setImportBusy(false);
    }
  };

  const pickJson = () => {
    if (isNativeRawAvailable()) {
      pickNativeText()
        .then((file) => onImportText(file.text, file.name))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "cancelled" || /cancel/i.test(msg)) return;
          onNotice?.("Не удалось прочитать JSON");
        });
      return;
    }
    fileRef.current?.click();
  };

  const saveCurrentLook = () => {
    const stock = catalog.films.find((f) => f.id === params.filmStock)?.name ?? "Рецепт";
    const n = looks.filter((l) => l.name === stock || l.name.startsWith(`${stock} ·`)).length;
    saveLook(n ? `${stock} · ${n + 1}` : stock);
  };

  const exportCurrentJson = () => {
    const stock = catalog.films.find((f) => f.id === params.filmStock)?.name ?? "Рецепт";
    const blob = new Blob([serializeLook(stock, params)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${stock.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      className="flex flex-col py-1"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const jsonish =
          /\.json$/i.test(file.name) || /json|text/.test(file.type || "");
        if (!jsonish) return;
        e.preventDefault();
        void file.text().then((t) => onImportText(t, file.name));
      }}
    >
      {tool === "film" ? (
        <>
          <div className="lab-film-head">
            <button
              type="button"
              className="lab-ghost"
              disabled={importBusy}
              title="JSON профиля Spektrafilm — 81 полоса, как штатные кассеты"
              onClick={pickJson}
            >
              <Upload className="size-3.5" />
              Импорт
            </button>
            <button
              type="button"
              className={findOpen ? "lab-ghost is-on" : "lab-ghost"}
              onClick={() => setFindOpen((v) => !v)}
            >
              <Search className="size-3.5" />
              Найти
            </button>
          </div>
          {findOpen ? (
            <input
              className="lab-find"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Portra, C200, Vision…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          ) : null}
          <BoxShelf
            kind="film"
            groups={shelfGroups("film", catalog, FILM_GROUPS)}
            value={params.filmStock}
            onChange={(id) => void applyFilmDefaults(id)}
            items={catalog.films ?? []}
            query={find}
          />
          {isUserProfile(params.filmStock) ? (
            <button
              type="button"
              className={`lab-ghost lab-film-drop${dropArmed ? " is-warn" : ""}`}
              onClick={() => {
                if (!dropArmed) {
                  setDropArmed(true);
                  return;
                }
                const id = params.filmStock;
                setDropArmed(false);
                void removeUserProfile(id).then(() => {
                  void applyFilmDefaults("none");
                  onNotice?.("Кассета удалена");
                });
              }}
            >
              {dropArmed ? "Точно удалить кассету?" : "Удалить свою кассету"}
            </button>
          ) : null}
          {isFilmBypass(params.filmStock) ? (
            <p className="lab-note">
              Плёнка не применена. Кадр как снято. Движок RAW — в Опциях.
            </p>
          ) : (
            <>
          <SliderRow
            label="Гамма"
            hint={fmt(params.filmGamma)}
            min={0.5}
            max={1.6}
            step={0.05}
            value={params.filmGamma}
            onChange={(v) => setParam("filmGamma", v)}
          />
          <ToggleRow label="Зерно" checked={params.grainActive} onChange={(v) => setParam("grainActive", v)} />
          {params.grainActive ? (
            <>
              <SliderRow
                label="Частица, µm²"
                hint={fmt(params.grainParticleArea, 2)}
                min={0.04}
                max={1.2}
                step={0.02}
                value={params.grainParticleArea}
                onChange={(v) => setParam("grainParticleArea", v)}
              />
              <SliderRow
                label="Размытие"
                hint={fmt(params.grainBlur)}
                min={0}
                max={1.4}
                step={0.05}
                value={params.grainBlur}
                onChange={(v) => setParam("grainBlur", v)}
              />
              {advanced ? (
                <>
                  <ToggleRow
                    label="Подслои"
                    checked={params.grainSublayers}
                    onChange={(v) => setParam("grainSublayers", v)}
                  />
                  <SliderRow
                    label="Равномерность"
                    hint={fmt(params.grainUniformity)}
                    min={0.85}
                    max={0.995}
                    step={0.005}
                    value={params.grainUniformity}
                    onChange={(v) => setParam("grainUniformity", v)}
                  />
                  <SliderRow
                    label="Dmin зерна"
                    hint={fmt(params.grainDensityMin, 3)}
                    min={0}
                    max={0.3}
                    step={0.01}
                    value={params.grainDensityMin}
                    onChange={(v) => setParam("grainDensityMin", v)}
                  />
                  <SliderRow
                    label="Облака, µm"
                    hint={fmt(params.grainDyeCloudsUm)}
                    min={0}
                    max={4}
                    step={0.1}
                    value={params.grainDyeCloudsUm}
                    onChange={(v) => setParam("grainDyeCloudsUm", v)}
                  />
                  <SliderRow
                    label="Масштаб R"
                    hint={fmt(params.grainScaleR)}
                    min={0.4}
                    max={4}
                    step={0.05}
                    value={params.grainScaleR}
                    onChange={(v) => setParam("grainScaleR", v)}
                  />
                  <SliderRow
                    label="Масштаб G"
                    hint={fmt(params.grainScaleG)}
                    min={0.4}
                    max={4}
                    step={0.05}
                    value={params.grainScaleG}
                    onChange={(v) => setParam("grainScaleG", v)}
                  />
                  <SliderRow
                    label="Масштаб B"
                    hint={fmt(params.grainScaleB)}
                    min={0.4}
                    max={5}
                    step={0.05}
                    value={params.grainScaleB}
                    onChange={(v) => setParam("grainScaleB", v)}
                  />
                </>
              ) : null}
            </>
          ) : null}
          <ToggleRow label="Галяция" checked={params.halationActive} onChange={(v) => setParam("halationActive", v)} />
          {params.halationActive ? (
            <>
              <SliderRow
                label="Сила"
                hint={fmt(params.halationAmount)}
                min={0}
                max={3}
                step={0.05}
                value={params.halationAmount}
                onChange={(v) => setParam("halationAmount", v)}
              />
              <SliderRow
                label="Размер"
                hint={fmt(params.halationSpatialScale)}
                min={0.2}
                max={3}
                step={0.1}
                value={params.halationSpatialScale}
                onChange={(v) => setParam("halationSpatialScale", v)}
              />
              <SliderRow
                label="Рассеяние"
                hint={fmt(params.scatterAmount)}
                min={0}
                max={2}
                step={0.05}
                value={params.scatterAmount}
                onChange={(v) => setParam("scatterAmount", v)}
              />
              {advanced ? (
                <>
                  <SliderRow
                    label="Масштаб рассеяния"
                    hint={fmt(params.scatterSpatialScale)}
                    min={0.2}
                    max={3}
                    step={0.1}
                    value={params.scatterSpatialScale}
                    onChange={(v) => setParam("scatterSpatialScale", v)}
                  />
                  <SliderRow
                    label="Подсветка EV"
                    hint={fmt(params.boostEv, 1)}
                    min={0}
                    max={4}
                    step={0.5}
                    value={params.boostEv}
                    onChange={(v) => setParam("boostEv", v)}
                  />
                  <SliderRow
                    label="Защита EV"
                    hint={fmt(params.protectEv, 1)}
                    min={0}
                    max={8}
                    step={0.5}
                    value={params.protectEv}
                    onChange={(v) => setParam("protectEv", v)}
                  />
                  <SliderRow
                    label="Диапазон"
                    hint={fmt(params.boostRange, 2)}
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={params.boostRange}
                    onChange={(v) => setParam("boostRange", v)}
                  />
                  <SliderRow
                    label="Отскоки"
                    hint={String(params.halationNBounces)}
                    min={1}
                    max={5}
                    step={1}
                    value={params.halationNBounces}
                    onChange={(v) => setParam("halationNBounces", v)}
                  />
                  <SliderRow
                    label="Затухание"
                    hint={fmt(params.halationBounceDecay, 2)}
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={params.halationBounceDecay}
                    onChange={(v) => setParam("halationBounceDecay", v)}
                  />
                  <ToggleRow
                    label="Нормализация"
                    checked={params.halationRenormalize}
                    onChange={(v) => setParam("halationRenormalize", v)}
                  />
                </>
              ) : null}
            </>
          ) : null}
          <ToggleRow
            label="DIR-каплеры"
            checked={params.couplersActive}
            onChange={(v) => setParam("couplersActive", v)}
          />
          {params.couplersActive ? (
            <>
              <SliderRow
                label="Количество"
                hint={fmt(params.couplersAmount)}
                min={0}
                max={2.5}
                step={0.05}
                value={params.couplersAmount}
                onChange={(v) => setParam("couplersAmount", v)}
              />
              <SliderRow
                label="Межслойное"
                hint={fmt(params.inhibitionInterlayer)}
                min={0}
                max={2}
                step={0.05}
                value={params.inhibitionInterlayer}
                onChange={(v) => setParam("inhibitionInterlayer", v)}
              />
              <SliderRow
                label="Свой слой"
                hint={fmt(params.inhibitionSamelayer)}
                min={0}
                max={2}
                step={0.05}
                value={params.inhibitionSamelayer}
                onChange={(v) => setParam("inhibitionSamelayer", v)}
              />
              {advanced ? (
                <SliderRow
                  label="Диффузия, µm"
                  hint={fmt(params.couplerDiffusionUm, 0)}
                  min={0}
                  max={80}
                  step={5}
                  value={params.couplerDiffusionUm}
                  onChange={(v) => setParam("couplerDiffusionUm", v)}
                />
              ) : null}
            </>
          ) : null}
            </>
          )}
        </>
      ) : null}
      {tool === "tone" ? (
        <>
          <p className="lab-note">Только без плёнки — в 81-полосную проявку не идёт.</p>
          {rawEngineNeeded(params.rawEngine) && stylesFor(params.rawEngine).length ? (
            <div className="px-4 py-1.5">
              <Field label="Стиль">
                <Segmented
                  value={params.rawEngineStyle}
                  onChange={(v) => setParam("rawEngineStyle", v as RawEngineStyle)}
                  options={stylesFor(params.rawEngine).map((id) => ({
                    value: id,
                    label: STYLE_CHIP[id] ?? rawEngineStyleLabel(id),
                  }))}
                />
              </Field>
            </div>
          ) : null}
          <p className="lab-kicker">Свет</p>
          <SliderRow
            label="Яркость"
            hint={fmt(params.toneBrightness)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneBrightness ?? 0}
            onChange={(v) => setParam("toneBrightness", v)}
          />
          <SliderRow
            label="Контраст"
            hint={fmt(params.toneContrast)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneContrast ?? 0}
            onChange={(v) => setParam("toneContrast", v)}
          />
          <SliderRow
            label="Света"
            hint={fmt(params.toneHighlights)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneHighlights ?? 0}
            onChange={(v) => setParam("toneHighlights", v)}
          />
          <SliderRow
            label="Тени"
            hint={fmt(params.toneShadows)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneShadows ?? 0}
            onChange={(v) => setParam("toneShadows", v)}
          />
          <p className="lab-kicker">Цвет</p>
          <SliderRow
            label="Насыщенность"
            hint={fmt(params.toneSaturation)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneSaturation ?? 0}
            onChange={(v) => setParam("toneSaturation", v)}
          />
          <SliderRow
            label="Теплота"
            hint={fmt(params.toneWarmth)}
            min={-1}
            max={1}
            step={0.02}
            value={params.toneWarmth ?? 0}
            onChange={(v) => setParam("toneWarmth", v)}
          />
          <button
            type="button"
            className="lab-btn is-ghost lab-tone-reset"
            disabled={!digitalToneNeeded(params)}
            onClick={() => patch(defaultDigitalTone())}
          >
            Сбросить тон
          </button>
        </>
      ) : null}
      {tool === "presets" ? (
        <PresetManager previewUrl={previewUrl} onNotice={onNotice} />
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,text/plain,text/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) void file.text().then((t) => onImportText(t, file.name));
        }}
      />
      {tool === "camera" ? (
        <>
          <SliderRow
            label="EV"
            hint={`${params.exposureCompensationEv > 0 ? "+" : ""}${params.exposureCompensationEv.toFixed(2)}`}
            min={-3}
            max={3}
            step={0.25}
            value={params.exposureCompensationEv}
            onChange={(v) => setParam("exposureCompensationEv", v)}
          />
          <ToggleRow
            label="Автоэкспозиция"
            checked={params.autoExposure}
            onChange={(v) => setParam("autoExposure", v)}
          />
          {params.autoExposure ? (
            <div className="px-4 py-1.5">
              <Field label="Замер">
                <Select
                  value={params.autoExposureMethod}
                  onChange={(v) => setParam("autoExposureMethod", v as AutoExposureMethod)}
                  options={[
                    { value: "center_weighted", label: "Центрально-взвешенный" },
                    { value: "average", label: "Средний" },
                    { value: "median", label: "Медиана" },
                    { value: "partial", label: "Точечный" },
                    { value: "matrix", label: "Матрица 5×5" },
                    { value: "multi_zone", label: "Мультизона" },
                    { value: "highlight_weighted", label: "По светам" },
                  ]}
                />
              </Field>
            </div>
          ) : null}
          <SliderRow
            label="Формат, мм"
            hint={fmt(params.filmFormatMm, 0)}
            min={8}
            max={120}
            step={1}
            value={params.filmFormatMm}
            onChange={(v) => setParam("filmFormatMm", v)}
          />
          <div className="px-4 py-1.5">
            <Field label="Баланс белого">
              <Select
                value={params.whiteBalance}
                onChange={(v) => {
                  if (v === "as_shot") {
                    patch({ whiteBalance: "as_shot" });
                    return;
                  }
                  if (v === "daylight") {
                    patch({ whiteBalance: "daylight", temperature: 5500, tint: 0 });
                    return;
                  }
                  if (v === "tungsten") {
                    patch({ whiteBalance: "tungsten", temperature: 3200, tint: 0 });
                    return;
                  }
                  patch({ whiteBalance: "custom" });
                }}
                options={[
                  { value: "as_shot", label: "Как снято" },
                  { value: "daylight", label: "День 5500 K" },
                  { value: "tungsten", label: "Лампа 3200 K" },
                  { value: "custom", label: "Температура" },
                ]}
              />
            </Field>
          </div>
          <SliderRow
            label="Температура, K"
            hint={`${fmt(params.temperature, 0)} K`}
            min={WB_TMIN}
            max={WB_TMAX}
            step={50}
            value={params.temperature}
            onChange={(v) => patch({ temperature: v, whiteBalance: "custom" })}
          />
          <SliderRow
            label="Тинт"
            hint={params.tint === 0 ? "0" : params.tint > 0 ? `+${fmt(params.tint, 0)} G` : `${fmt(params.tint, 0)} M`}
            min={WB_TINT_MIN}
            max={150}
            step={1}
            value={params.tint}
            onChange={(v) => patch({ tint: v, whiteBalance: "custom" })}
          />
          <div className="lab-wb-row">
            <button type="button" className="lab-btn is-solid" disabled={!hasImage || autoWbBusy} onClick={() => onAutoWb?.()}>
              {autoWbBusy ? "…" : "Авто"}
            </button>
            <button
              type="button"
              className={pickingWb ? "lab-btn is-solid" : "lab-btn is-ghost"}
              disabled={!hasImage || autoWbBusy}
              onClick={() => onPickWb?.()}
            >
              {pickingWb ? "Отмена" : "Пипетка"}
            </button>
          </div>
          <SliderRow
            label="UV-срез"
            hint={fmt(params.filterUvAmount, 2)}
            min={0}
            max={1}
            step={0.05}
            value={params.filterUvAmount}
            onChange={(v) => setParam("filterUvAmount", v)}
          />
          <SliderRow
            label="IR-срез"
            hint={fmt(params.filterIrAmount, 2)}
            min={0}
            max={1}
            step={0.05}
            value={params.filterIrAmount}
            onChange={(v) => setParam("filterIrAmount", v)}
          />
          <SliderRow
            label="Размытие объектива"
            hint={fmt(params.cameraLensBlurUm, 1)}
            min={0}
            max={12}
            step={0.1}
            value={params.cameraLensBlurUm}
            onChange={(v) => setParam("cameraLensBlurUm", v)}
          />
          <ToggleRow
            label="Диффузия"
            checked={params.cameraDiffusion.active}
            onChange={(v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, active: v } })}
          />
          {params.cameraDiffusion.active ? (
            <>
              <div className="px-4 py-1.5">
                <Field label="Фильтр">
                  <Select
                    value={params.cameraDiffusion.family}
                    onChange={(v) =>
                      patch({ cameraDiffusion: { ...params.cameraDiffusion, family: v as DiffusionFamily } })
                    }
                    options={[
                      { value: "black_pro_mist", label: "Black Pro-Mist" },
                      { value: "pro_mist", label: "Pro-Mist" },
                      { value: "glimmerglass", label: "Glimmerglass" },
                      { value: "cinebloom", label: "Cinebloom" },
                    ]}
                  />
                </Field>
              </div>
              <SliderRow
                label="Сила"
                hint={fmt(params.cameraDiffusion.strength, 3)}
                min={0}
                max={2}
                step={0.125}
                value={params.cameraDiffusion.strength}
                onChange={(v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, strength: v } })}
              />
              {advanced ? (
                <SliderRow
                  label="Масштаб PSF"
                  hint={fmt(params.cameraDiffusion.spatialScale, 2)}
                  min={0}
                  max={4}
                  step={0.1}
                  value={params.cameraDiffusion.spatialScale}
                  onChange={(v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, spatialScale: v } })}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {tool === "print" ? (
        <>
          <div className="lab-film-head">
            <button
              type="button"
              className="lab-ghost"
              disabled={importBusy}
              title="JSON профиля бумаги Spektrafilm — 81 полоса, как штатные"
              onClick={pickJson}
            >
              <Upload className="size-3.5" />
              Импорт
            </button>
            <button
              type="button"
              className={findOpen ? "lab-ghost is-on" : "lab-ghost"}
              onClick={() => setFindOpen((v) => !v)}
            >
              <Search className="size-3.5" />
              Найти
            </button>
          </div>
          {findOpen ? (
            <input
              className="lab-find"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Endura, Crystal, 2383…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          ) : null}
          <BoxShelf
            kind="paper"
            groups={shelfGroups("paper", catalog, PAPER_GROUPS)}
            value={params.printPaper}
            onChange={(id) => setParam("printPaper", id)}
            items={catalog.papers ?? []}
            query={find}
          />
          {isPaperBypass(params.printPaper) ? (
            <p className="lab-note">
              Без бумаги — скан самой плёнки. Кассету можно выбрать в любой момент.
            </p>
          ) : params.scanFilm ? (
            <p className="lab-note">
              Сейчас «Скан как плёнка». Бумага применится, когда выключишь скан.
            </p>
          ) : null}
          {isUserProfile(params.printPaper) ? (
            <button
              type="button"
              className={`lab-ghost lab-film-drop${dropArmed ? " is-warn" : ""}`}
              onClick={() => {
                if (!dropArmed) {
                  setDropArmed(true);
                  return;
                }
                const id = params.printPaper;
                setDropArmed(false);
                void removeUserProfile(id).then(() => {
                  const fallback =
                    catalog.papers.find((p) => p.id !== id && !p.user)?.id ?? "kodak_portra_endura";
                  setParam("printPaper", fallback);
                  onNotice?.("Бумага удалена");
                });
              }}
            >
              {dropArmed ? "Точно удалить бумагу?" : "Удалить свою бумагу"}
            </button>
          ) : null}
          {!isPaperBypass(params.printPaper) ? (
            <>
          <SliderRow
            label="Гамма"
            hint={fmt(params.printGamma)}
            min={0.5}
            max={2}
            step={0.05}
            value={params.printGamma}
            onChange={(v) => setParam("printGamma", v)}
          />
          <SliderRow
            label="Экспозиция"
            hint={fmt(params.printExposure)}
            min={0.2}
            max={3}
            step={0.02}
            value={params.printExposure}
            onChange={(v) => setParam("printExposure", v)}
          />
          <ToggleRow
            label="Автоэкспозиция"
            checked={params.printExposureCompensation}
            onChange={(v) => setParam("printExposureCompensation", v)}
          />
          <SliderRow
            label="Y, CC"
            hint={fmt(params.printYFilterShift, 0)}
            min={-40}
            max={40}
            step={1}
            value={params.printYFilterShift}
            onChange={(v) => setParam("printYFilterShift", v)}
          />
          <SliderRow
            label="M, CC"
            hint={fmt(params.printMFilterShift, 0)}
            min={-40}
            max={40}
            step={1}
            value={params.printMFilterShift}
            onChange={(v) => setParam("printMFilterShift", v)}
          />
          <SliderRow
            label="Предвспышка"
            hint={fmt(params.preflashExposure, 3)}
            min={0.01}
            max={0.2}
            step={0.005}
            value={params.preflashExposure}
            onChange={(v) => setParam("preflashExposure", v)}
          />
          {advanced ? (
            <>
              <SliderRow
                label="Предвспышка Y"
                hint={fmt(params.preflashYShift, 0)}
                min={-20}
                max={20}
                step={1}
                value={params.preflashYShift}
                onChange={(v) => setParam("preflashYShift", v)}
              />
              <SliderRow
                label="Предвспышка M"
                hint={fmt(params.preflashMShift, 0)}
                min={-20}
                max={20}
                step={1}
                value={params.preflashMShift}
                onChange={(v) => setParam("preflashMShift", v)}
              />
            </>
          ) : null}
          <ToggleRow
            label="Химия бумаги"
            checked={params.chemistryActive}
            onChange={(v) => setParam("chemistryActive", v)}
          />
          {params.chemistryActive ? (
            <SliderRow
              label="Истощение"
              hint={fmt(params.developerExhaustion)}
              min={0}
              max={1}
              step={0.02}
              value={params.developerExhaustion}
              onChange={(v) => setParam("developerExhaustion", v)}
            />
          ) : null}
          {advanced && params.chemistryActive ? (
            <>
              <SliderRow
                label="γ быстрая"
                hint={fmt(params.printGammaFast, 2)}
                min={0.4}
                max={2}
                step={0.05}
                value={params.printGammaFast}
                onChange={(v) => setParam("printGammaFast", v)}
              />
              <SliderRow
                label="γ медленная"
                hint={fmt(params.printGammaSlow, 2)}
                min={0.4}
                max={2}
                step={0.05}
                value={params.printGammaSlow}
                onChange={(v) => setParam("printGammaSlow", v)}
              />
              <SliderRow
                label="γ R"
                hint={fmt(params.printGammaR, 2)}
                min={0.4}
                max={2}
                step={0.05}
                value={params.printGammaR}
                onChange={(v) => setParam("printGammaR", v)}
              />
              <SliderRow
                label="γ G"
                hint={fmt(params.printGammaG, 2)}
                min={0.4}
                max={2}
                step={0.05}
                value={params.printGammaG}
                onChange={(v) => setParam("printGammaG", v)}
              />
              <SliderRow
                label="γ B"
                hint={fmt(params.printGammaB, 2)}
                min={0.4}
                max={2}
                step={0.05}
                value={params.printGammaB}
                onChange={(v) => setParam("printGammaB", v)}
              />
            </>
          ) : null}
          <ToggleRow
            label="Диффузия печати"
            checked={params.printDiffusion.active}
            onChange={(v) => patch({ printDiffusion: { ...params.printDiffusion, active: v } })}
          />
          {params.printDiffusion.active && !params.scanFilm && !isPaperBypass(params.printPaper) ? (
            <>
              <div className="px-4 py-1.5">
                <Field label="Фильтр">
                  <Select
                    value={params.printDiffusion.family}
                    onChange={(v) =>
                      patch({ printDiffusion: { ...params.printDiffusion, family: v as DiffusionFamily } })
                    }
                    options={[
                      { value: "black_pro_mist", label: "Black Pro-Mist" },
                      { value: "pro_mist", label: "Pro-Mist" },
                      { value: "glimmerglass", label: "Glimmerglass" },
                      { value: "cinebloom", label: "Cinebloom" },
                    ]}
                  />
                </Field>
              </div>
              <SliderRow
                label="Сила"
                hint={fmt(params.printDiffusion.strength, 3)}
                min={0}
                max={2}
                step={0.125}
                value={params.printDiffusion.strength}
                onChange={(v) => patch({ printDiffusion: { ...params.printDiffusion, strength: v } })}
              />
              {advanced ? (
                <SliderRow
                  label="Масштаб PSF"
                  hint={fmt(params.printDiffusion.spatialScale, 2)}
                  min={0}
                  max={4}
                  step={0.1}
                  value={params.printDiffusion.spatialScale}
                  onChange={(v) => patch({ printDiffusion: { ...params.printDiffusion, spatialScale: v } })}
                />
              ) : null}
            </>
          ) : null}
          <ToggleRow label="Блик" checked={params.glareActive} onChange={(v) => setParam("glareActive", v)} />
          {params.glareActive ? (
            <SliderRow
              label="Блик, %"
              hint={fmt(params.glarePercent, 2)}
              min={0}
              max={0.25}
              step={0.01}
              value={params.glarePercent}
              onChange={(v) => setParam("glarePercent", v)}
            />
          ) : null}
          {advanced && params.glareActive ? (
            <>
              <SliderRow
                label="Шероховатость"
                hint={fmt(params.glareRoughness)}
                min={0}
                max={1}
                step={0.05}
                value={params.glareRoughness}
                onChange={(v) => setParam("glareRoughness", v)}
              />
              <SliderRow
                label="Размытие блика"
                hint={fmt(params.glareBlur)}
                min={0}
                max={2}
                step={0.05}
                value={params.glareBlur}
                onChange={(v) => setParam("glareBlur", v)}
              />
            </>
          ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {tool === "scan" ? (
        <>
          <ToggleRow
            label="Скан как плёнка"
            checked={params.scanFilm}
            onChange={(v) => setParam("scanFilm", v)}
          />
          <SliderRow
            label="Unsharp σ"
            hint={fmt(params.scanUnsharpSigma)}
            min={0}
            max={2}
            step={0.05}
            value={params.scanUnsharpSigma}
            onChange={(v) => setParam("scanUnsharpSigma", v)}
          />
          <SliderRow
            label="Unsharp сила"
            hint={fmt(params.scanUnsharpAmount)}
            min={0}
            max={2}
            step={0.05}
            value={params.scanUnsharpAmount}
            onChange={(v) => setParam("scanUnsharpAmount", v)}
          />
          <SliderRow
            label="Размытие сканера"
            hint={fmt(params.scanLensBlur)}
            min={0}
            max={8}
            step={0.1}
            value={params.scanLensBlur}
            onChange={(v) => setParam("scanLensBlur", v)}
          />
          <ToggleRow
            label="Коррекция белого"
            checked={params.scanWhiteCorrection}
            onChange={(v) => setParam("scanWhiteCorrection", v)}
          />
          <ToggleRow
            label="Коррекция чёрного"
            checked={params.scanBlackCorrection}
            onChange={(v) => setParam("scanBlackCorrection", v)}
          />
          {advanced ? (
            <>
              <SliderRow
                label="Белая точка"
                hint={fmt(params.scanWhiteLevel, 2)}
                min={0.7}
                max={1}
                step={0.01}
                value={params.scanWhiteLevel}
                onChange={(v) => setParam("scanWhiteLevel", v)}
              />
              <SliderRow
                label="Чёрная точка"
                hint={fmt(params.scanBlackLevel, 3)}
                min={0}
                max={0.2}
                step={0.005}
                value={params.scanBlackLevel}
                onChange={(v) => setParam("scanBlackLevel", v)}
              />
            </>
          ) : null}
        </>
      ) : null}
      {tool === "crop" ? (
        <>
          <div className="px-4 py-1.5">
            <Field label="Поворот">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="lab-btn is-ghost flex-1"
                  onClick={() =>
                    setParam(
                      "orientation",
                      ((((params.orientation - 90) % 360) + 360) % 360) as DarkroomParams["orientation"],
                    )
                  }
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  className="lab-btn is-ghost flex-1"
                  onClick={() =>
                    setParam("orientation", ((params.orientation + 90) % 360) as DarkroomParams["orientation"])
                  }
                >
                  <RotateCw className="size-4" />
                </button>
              </div>
            </Field>
          </div>
          <div className="px-4 py-1.5">
            <Field label="Кадр">
              <Segmented
                value={params.cropAspect}
                onChange={(v) => {
                  if (v === "free") {
                    patch({ cropAspect: "free" });
                    return;
                  }
                  const [aw, ah] = v.split(":").map(Number);
                  const size = cropForAspect(frameW, frameH, aw, ah);
                  patch({ crop: true, cropAspect: v, cropCenterX: 0.5, cropCenterY: 0.5, ...size });
                }}
                options={[
                  { value: "free", label: "Своб." },
                  { value: "3:2", label: "3:2" },
                  { value: "4:5", label: "4:5" },
                  { value: "1:1", label: "1:1" },
                  { value: "16:9", label: "16:9" },
                ]}
              />
            </Field>
          </div>
          <ToggleRow label="Кроп" checked={params.crop} onChange={(v) => setParam("crop", v)} />
          {params.crop ? (
            <>
              <SliderRow
                label="Размер"
                hint={fmt(params.cropSizeX, 2)}
                min={0.08}
                max={0.8}
                step={0.01}
                value={params.cropSizeX}
                onChange={(v) => patch({ cropSizeX: v, cropSizeY: v })}
              />
              <SliderRow
                label="X"
                hint={fmt(params.cropCenterX, 2)}
                min={0.1}
                max={0.9}
                step={0.01}
                value={params.cropCenterX}
                onChange={(v) => setParam("cropCenterX", v)}
              />
              <SliderRow
                label="Y"
                hint={fmt(params.cropCenterY, 2)}
                min={0.1}
                max={0.9}
                step={0.01}
                value={params.cropCenterY}
                onChange={(v) => setParam("cropCenterY", v)}
              />
            </>
          ) : null}
          <ToggleRow
            label="Холст 18%"
            checked={params.gray18Canvas}
            onChange={(v) => setParam("gray18Canvas", v)}
          />
          <div className="lab-frame-picker" role="group" aria-label="Рамка фотографии">
            <p>Оформление фотографии</p>
            {FRAME_STYLES.map(style => <button key={style.value} type="button" className={params.frameStyle === style.value ? "is-selected" : ""} aria-pressed={params.frameStyle === style.value} onClick={() => setParam("frameStyle", style.value)}><span className={`lab-frame-swatch is-${style.value}`} /><span>{style.label}</span></button>)}
            <small>Рамка сохраняется в готовом JPEG или PNG. Исходник не обрезается.</small>
          </div>
          {isOriginalEdge(params.frameStyle) ? <>
            <SliderRow label="Номер кадра" min={1} max={99} step={1} value={params.frameNumber} hint={String(params.frameNumber)} onChange={v => setParam("frameNumber",v)} />
            {params.frameStyle === "135" ? <ToggleRow label="DX-полоса" hint="Декоративная полоса по рисунку оригинала" checked={params.frameBarcode} onChange={v => setParam("frameBarcode",v)} /> : null}
            <label className="lab-frame-date">Дата на снимке<input aria-label="Дата на снимке" maxLength={32} value={params.frameDate} placeholder="Не печатать" onChange={e=>setParam("frameDate",e.target.value)} /></label>
            <p className="px-4 py-2 text-xs text-muted">Пропорции края соответствуют оригиналу: 135, 120 или минималистичная кромка.</p>
          </> : null}
        </>
      ) : null}
      {tool === "lab" ? (
        <>
          <div className="px-4 py-1.5">
            <Field label="RGB → спектр">
              <Select
                value={params.rgbToRawMethod}
                onChange={(v) => setParam("rgbToRawMethod", v as RgbToRawMethod)}
                options={[
                  { value: "hanatos2025", label: "Hanatos 2025" },
                  { value: "mallett2019", label: "Mallett 2019" },
                ]}
              />
            </Field>
          </div>
          <ToggleRow
            label="Hanatos окно"
            checked={params.hanatosWindow}
            onChange={(v) => setParam("hanatosWindow", v)}
          />
          <ToggleRow
            label="Hanatos поверхность"
            checked={params.hanatosSurface}
            onChange={(v) => setParam("hanatosSurface", v)}
          />
          <SliderRow
            label="Спектр. размытие"
            hint={fmt(params.spectralBlur, 2)}
            min={0}
            max={4}
            step={0.1}
            value={params.spectralBlur}
            onChange={(v) => setParam("spectralBlur", v)}
          />
          <div className="px-4 py-1.5">
            <Field label="Входной гамут">
              <Select
                value={params.inputGamutCompress}
                onChange={(v) => setParam("inputGamutCompress", v as InputGamutMode)}
                options={[
                  { value: "off", label: "Выкл" },
                  { value: "xy", label: "xy locus" },
                ]}
              />
            </Field>
          </div>
          <div className="px-4 py-1.5">
            <Field label="Выходной гамут">
              <Select
                value={params.outputGamutCompress}
                onChange={(v) => setParam("outputGamutCompress", v as OutputGamutMode)}
                options={[
                  { value: "legacy_clip", label: "Legacy clip" },
                  { value: "off", label: "Выкл" },
                  { value: "aces_rgc", label: "ACES RGC" },
                  { value: "oklch", label: "Oklch" },
                  { value: "oklrab", label: "Oklrab" },
                ]}
              />
            </Field>
          </div>
          {advanced ? (
            <>
              <SliderRow
                label="LUT превью"
                hint={String(params.lutResolution)}
                min={9}
                max={33}
                step={4}
                value={params.lutResolution}
                onChange={(v) => setParam("lutResolution", v)}
              />
              <SliderRow
                label="Апскейл"
                hint={`${params.upscaleFactor}×`}
                min={1}
                max={4}
                step={1}
                value={params.upscaleFactor}
                onChange={(v) => setParam("upscaleFactor", v)}
              />
              <ToggleRow
                label="Декод CCTF"
                checked={params.applyCctfDecoding}
                onChange={(v) => setParam("applyCctfDecoding", v)}
              />
            </>
          ) : null}
        </>
      ) : null}
      {tool === "export" ? (
        <>
          <div className="px-4 py-1.5">
            <Field label="Формат">
              <Segmented
                value={params.exportFormat}
                onChange={(v) => setParam("exportFormat", v)}
                options={[
                  { value: "jpeg", label: "JPEG" },
                  { value: "png", label: "PNG" },
                ]}
              />
            </Field>
          </div>
          {params.exportFormat === "jpeg" ? (
            <SliderRow
              label="Качество"
              hint={String(params.exportQuality)}
              min={85}
              max={100}
              step={1}
              value={params.exportQuality}
              onChange={(v) => setParam("exportQuality", v)}
            />
          ) : null}
          <div className="px-4 py-1.5">
            <Field label="Цвет">
              <Select
                value={params.exportColorSpace}
                onChange={(v) => {
                  const cs = v as ExportColorSpace;
                  patch({ exportColorSpace: cs, outputCctf: cs !== "linear_srgb" });
                }}
                options={[
                  { value: "srgb", label: "sRGB" },
                  { value: "adobe_rgb", label: "Adobe RGB" },
                  { value: "prophoto", label: "ProPhoto RGB" },
                  { value: "rec2020", label: "Rec. 2020" },
                  { value: "linear_srgb", label: "Linear sRGB" },
                ]}
              />
            </Field>
          </div>
          <ToggleRow label="Выходной CCTF" checked={params.outputCctf} onChange={(v) => setParam("outputCctf", v)} />
          <ToggleRow label="Сжатие гамута" checked={params.gamutCompress} onChange={(v) => setParam("gamutCompress", v)} />
          <p className="px-4 pt-1 pb-2 text-[0.65rem] leading-snug text-muted">
            {isNativeRawAvailable()
              ? "Кадр сохраняется в Pictures / Spektrafilm. Не закрывайте приложение до завершения экспорта."
              : "Кадр будет скачан на компьютер. Для экспорта используйте кнопку сверху или Ctrl S."}
          </p>
        </>
      ) : null}
      {tool === "log" ? <LogPane onNotice={onNotice} /> : null}
      {tool === "settings" ? <SettingsPane onNotice={onNotice} /> : null}
    </div>
  );
}

function SettingsPane({ onNotice }: { onNotice?: (msg: string) => void }) {
  const params = useDarkroom((s) => s.params);
  const setParam = useDarkroom((s) => s.setParam);
  const advanced = useDarkroom((s) => s.advanced);
  const setAdvanced = useDarkroom((s) => s.setAdvanced);
  const prefs = useDarkroom((s) => s.prefs);
  const setPref = useDarkroom((s) => s.setPref);
  const reset = useDarkroom((s) => s.reset);
  const resetPrefs = useDarkroom((s) => s.resetPrefs);
  const setTool = useDarkroom((s) => s.setTool);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => {
    if (!resetArmed) return;
    const clear = (e: PointerEvent) => {
      const node = e.target as HTMLElement | null;
      if (node?.closest?.(".lab-set-reset")) return;
      setResetArmed(false);
    };
    window.addEventListener("pointerdown", clear, true);
    return () => window.removeEventListener("pointerdown", clear, true);
  }, [resetArmed]);

  if (aboutOpen) {
    return (
      <div className="lab-set">
        <button type="button" className="lab-set-go" onClick={() => setAboutOpen(false)}>
          <span className="lab-about-back">
            <ChevronLeft className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="lab-set-go-title">Назад</span>
          </span>
        </button>
        <p className="lab-kicker">О приложении</p>
        <div className="lab-set-card">
          <div className="lab-about">
            <p className="lab-about-name">{APP_NAME}</p>
            <p className="lab-about-ver">Версия {APP_VERSION}</p>
            <p className="lab-about-copy">Улучшения по материалам Spektrafilm for Android. Лицензия GPLv3.</p>
            {[{name: "Spektrafilm for Android — Akshay Sharma", url: "https://github.com/thetechgeekko/Spektrafilm-android"}, {name: "Моделирование плёнки — Andrea Volpato", url: "https://github.com/andreavolpato/spektrafilm"}, {name: "Использованный форк — hwx959", url: "https://github.com/hwx959/Spektrafilm-android"}].map(credit => <a key={credit.url} className="lab-credit" href={credit.url} target="_blank" rel="noopener noreferrer" onClick={event => { event.preventDefault(); void openExternalUrl(credit.url); }}>{credit.name}</a>)}
            {APP_COPY.map((p) => (
              <p key={p.slice(0, 24)} className="lab-about-copy">
                {p}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lab-set">
      <button
        type="button"
        className={resetArmed ? "lab-btn is-line lab-set-reset is-warn" : "lab-btn is-line lab-set-reset"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (!resetArmed) {
            setResetArmed(true);
            return;
          }
          setResetArmed(false);
          reset();
          resetPrefs();
          setAdvanced(false);
          onNotice?.("Все настройки сброшены");
        }}
      >
        {resetArmed ? "Точно сбросить?" : "Сбросить все настройки"}
      </button>
      <p className="lab-kicker">О приложении</p>
      <div className="lab-set-card">
        <div className="lab-about">
          <p className="lab-about-name">{APP_NAME}</p>
          <p className="lab-about-ver">Версия {APP_VERSION}</p>
        </div>
        <button type="button" className="lab-set-go" onClick={() => setAboutOpen(true)}>
          <span>
            <span className="lab-set-go-title">О приложении</span>
            <span className="lab-set-go-hint">Информация</span>
          </span>
          <Info className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        </button>
        <a
          className="lab-set-go"
          href={CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void openExternalUrl(CHANNEL_URL);
          }}
        >
          <span>
            <span className="lab-set-go-title">Исходный проект</span>
            <span className="lab-set-go-hint">{CHANNEL_HANDLE}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        </a>
      </div>
      <p className="lab-kicker">Интерфейс</p>
      <div className="lab-set-card">
        <ToggleRow
          label="Подписи вкладок"
          hint="Названия под иконками справа"
          checked={prefs.showToolLabels}
          onChange={(v) => setPref("showToolLabels", v)}
        />
        <ToggleRow
          label="Лаб и журнал в рейке"
          hint="Иначе открываются из этой вкладки"
          checked={prefs.showLabTabs}
          onChange={(v) => setPref("showLabTabs", v)}
        />
        <ToggleRow
          label="Точные ползунки"
          hint="Мелкий шаг и скрытые параметры"
          checked={advanced}
          onChange={setAdvanced}
        />
        <ToggleRow
          label="Касание прячет панели"
          hint="Тап по кадру — полный экран"
          checked={prefs.tapHidesChrome}
          onChange={(v) => setPref("tapHidesChrome", v)}
        />
      </div>
      <p className="lab-kicker">Кадр</p>
      <div className="lab-set-card">
        <ToggleRow
          label="Сброс на новый файл"
          hint="Плёнка сбрасывается, движок RAW остаётся"
          checked={prefs.resetOnOpen}
          onChange={(v) => setPref("resetOnOpen", v)}
        />
        <ToggleRow
          label="Спросить перед сохранением"
          hint="Подтверждение перед полной проявкой"
          checked={prefs.confirmExport}
          onChange={(v) => setPref("confirmExport", v)}
        />
      </div>
      <p className="lab-kicker">Движок RAW</p>
      <div className="lab-set-card">
        <div className="px-3 py-3">
          <p className="mb-2 text-xs font-medium text-muted">Цветонаука</p>
          <EngineBar />
        </div>
        <p className="px-4 pb-3 pt-0.5 text-[0.65rem] leading-snug text-muted">
          {RAW_ENGINES.find((e) => e.id === params.rawEngine)?.hint}. Не LUT — цвет
          сенсора до спектральной плёнки. Стили HNCS / Lumix / Adobe — во вкладке Тон.
          Spektrafilm оставляет текущий экспорт как есть.
        </p>
      </div>
      <p className="lab-kicker">Производительность</p>
      <div className="lab-set-card">
        <ToggleRow
          label="GPU превью"
          hint="Vulkan на предпросмотре"
          checked={params.gpuPreview}
          onChange={(v) => setParam("gpuPreview", v)}
        />
        <ToggleRow
          label="GPU экспорт"
          hint="Полный спектр, без LUT"
          checked={params.gpuExport}
          onChange={(v) => setParam("gpuExport", v)}
        />
        <p className="px-4 pb-1 pt-3 text-xs font-medium text-fg">Размер превью</p>
        <div className="lab-size-grid">
          {PREVIEW_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              className={nearestPreview(params.previewMaxSize) === n ? "is-on" : ""}
              onClick={() => setParam("previewMaxSize", n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="px-4 pb-3 pt-0 text-[0.65rem] leading-snug text-muted">
          Длинная сторона на экране. Меньше — легче крутить, больше — резче. Сохранение всегда в полном размере.
        </p>
      </div>
      <p className="lab-kicker">Разделы</p>
      <div className="lab-set-card">
        <button type="button" className="lab-set-go" onClick={() => setTool("export")}>
          <span>
            <span className="lab-set-go-title">Экспорт</span>
            <span className="lab-set-go-hint">Формат, качество, цвет</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        </button>
        <button type="button" className="lab-set-go" onClick={() => setTool("lab")}>
          <span>
            <span className="lab-set-go-title">Лаб</span>
            <span className="lab-set-go-hint">Спектр, гамут, Hanatos</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        </button>
        <button type="button" className="lab-set-go" onClick={() => setTool("log")}>
          <span>
            <span className="lab-set-go-title">Журнал</span>
            <span className="lab-set-go-hint">Трасса проявки и экспорта</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        </button>
      </div>
      <p className="lab-set-foot">Удержание вкладки сбрасывает её параметры.</p>
    </div>
  );
}

function LogPane({ onNotice }: { onNotice?: (msg: string) => void }) {
  const [text, setText] = useState("Загружаю журнал…");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLPreElement>(null);

  const load = async () => {
    setBusy(true);
    try {
      const native = await getNativeLog();
      const web = jsLogText();
      const parts = [
        native.trim() ? native.trim() : "",
        web ? `--- web ---\n${web}` : "",
      ].filter(Boolean);
      setText(parts.join("\n\n") || "Журнал пуст. Открой кадр или сохрани экспорт.");
    } catch (e) {
      setText(`Не удалось прочитать журнал\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard");
      }
      onNotice?.("Журнал скопирован");
      pushLabLog("I", "log", "copied");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        onNotice?.("Журнал скопирован");
      } catch {
        onNotice?.("Не удалось скопировать");
      }
    }
  };

  const clear = async () => {
    clearJsLog();
    await clearNativeLog();
    await load();
    onNotice?.("Журнал очищен");
  };

  return (
    <div className="lab-log">
      <p className="lab-log-hint">
        Скопируй журнал и пришли его, если экспорт глючит или картинка с артефактами.
      </p>
      <pre ref={boxRef} className="lab-log-pre" tabIndex={0}>
        {text}
      </pre>
      <div className="lab-log-bar">
        <button type="button" className="lab-log-btn" onClick={() => void load()} disabled={busy}>
          Обновить
        </button>
        <button type="button" className="lab-log-btn is-copy" onClick={() => void copy()}>
          <Copy className="size-3.5" />
          Копировать
        </button>
        <button type="button" className="lab-log-btn" onClick={() => void clear()}>
          <Trash2 className="size-3.5" />
          Очистить
        </button>
      </div>
    </div>
  );
}
