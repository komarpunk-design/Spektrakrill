import { haptic } from "@/lib/film/haptic";
import { engineFullLabel } from "@/lib/film/engine-slots";
import { spektraToParams } from "@/lib/film/preset-json";
import { serializeLook, unwrapPresetText } from "@/lib/film/preset-json";
import { applySpektraImport, importNotice } from "@/lib/film/import-pack";
import { useDarkroom, type Look } from "@/lib/film/store";
import { filmPack, isFilmBypass, type DarkroomParams } from "@/lib/film/types";
import { sanitizeRawEngine, type RawEngine } from "@/lib/film/raw-engine";
import { Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type FactoryLook = { id: string; name: string; group: string; params: DarkroomParams };

type FilterId = "all" | "fav" | "mine" | "import";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "fav", label: "Избранное" },
  { id: "mine", label: "Мои" },
  { id: "import", label: "Импорт" },
];

function engineOf(params: DarkroomParams): RawEngine {
  if (!isFilmBypass(params.filmStock)) return "spektrafilm";
  return sanitizeRawEngine(params.rawEngine);
}

function engineBadge(params: DarkroomParams): string {
  const e = engineOf(params);
  if (e === "spektrafilm") return "SF";
  if (e === "hasselblad") return "HNCS";
  if (e === "lumix") return "LX";
  if (e === "adobe") return "Adobe";
  return "SF";
}

function liveFilter(params: DarkroomParams): string {
  if (isFilmBypass(params.filmStock)) {
    const b = 1 + (params.toneBrightness ?? 0) * 0.45;
    const c = 1 + (params.toneContrast ?? 0) * 0.4;
    const s = 1 + (params.toneSaturation ?? 0) * 0.5;
    const h = (params.toneWarmth ?? 0) * 14;
    return `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${h}deg)`;
  }
  const pack = filmPack(params.filmStock);
  if (pack === "kodak") return "saturate(1.12) contrast(1.06) sepia(0.12)";
  if (pack === "fuji") return "saturate(1.18) contrast(1.08) hue-rotate(-8deg)";
  if (pack === "cine") return "saturate(0.92) contrast(1.14) brightness(0.96)";
  if (pack === "slide") return "saturate(1.35) contrast(1.18)";
  return "saturate(1.08) contrast(1.05)";
}

type Card = {
  id: string;
  name: string;
  meta: string;
  params: DarkroomParams;
  favorite?: boolean;
  origin: "mine" | "import" | "factory";
};

export function PresetManager({
  previewUrl,
  onNotice,
}: {
  previewUrl?: string | null;
  onNotice?: (msg: string) => void;
}) {
  const looks = useDarkroom((s) => s.looks);
  const imported = useDarkroom((s) => s.imported);
  const appliedLookId = useDarkroom((s) => s.appliedLookId);
  const saveLook = useDarkroom((s) => s.saveLook);
  const applyLook = useDarkroom((s) => s.applyLook);
  const applyParams = useDarkroom((s) => s.applyParams);
  const deleteLook = useDarkroom((s) => s.deleteLook);
  const deleteImported = useDarkroom((s) => s.deleteImported);
  const renameLook = useDarkroom((s) => s.renameLook);
  const toggleFavorite = useDarkroom((s) => s.toggleFavorite);
  const reorderLooks = useDarkroom((s) => s.reorderLooks);
  const selectEngine = useDarkroom((s) => s.selectEngine);
  const params = useDarkroom((s) => s.params);

  const [factory, setFactory] = useState<FactoryLook[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveFav, setSaveFav] = useState(false);
  const [menu, setMenu] = useState<Card | null>(null);
  const [rename, setRename] = useState("");
  const saveRef = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);

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
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!saving) return;
    const t = window.setTimeout(() => saveRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [saving]);

  const cards = useMemo(() => {
    const mine: Card[] = looks.map((l) => ({
      id: l.id,
      name: l.name,
      meta: "Мои",
      params: l.params,
      favorite: l.favorite,
      origin: "mine",
    }));
    const imp: Card[] = imported.map((l) => ({
      id: l.id,
      name: l.name,
      meta: "Импорт",
      params: l.params,
      favorite: l.favorite,
      origin: "import",
    }));
    const fac: Card[] = factory.map((l) => ({
      id: l.id,
      name: l.name,
      meta: l.group,
      params: l.params,
      origin: "factory",
    }));
    if (filter === "fav") return [...mine, ...imp].filter((c) => c.favorite);
    if (filter === "mine") return mine;
    if (filter === "import") return imp;
    return [...mine, ...imp, ...fac];
  }, [looks, imported, factory, filter]);

  const applyCard = (card: Card) => {
    haptic("select");
    const eng = engineOf(card.params);
    if (eng !== params.rawEngine) selectEngine(eng);
    if (card.origin === "factory") applyParams(card.params, card.id);
    else applyLook(card.id);
  };

  const onSave = () => {
    const name = saveName.trim() || "Рецепт";
    saveLook(name, { favorite: saveFav });
    setSaving(false);
    setSaveName("");
    setSaveFav(false);
    setFilter(saveFav ? "fav" : "mine");
    onNotice?.("Пресет сохранён");
  };

  const onPickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((t) => {
        void applySpektraImport(unwrapPresetText(t), file.name)
          .then((r) => {
            setFilter(r.looksAdded || r.looksUpdated ? "import" : "all");
            onNotice?.(importNotice(r));
          })
          .catch(() => onNotice?.("Не удалось прочитать JSON"));
      });
    };
    input.click();
  };

  return (
    <div className="lab-presets">
      <div className="lab-preset-actions">
        <button type="button" className="lab-btn is-solid" onClick={() => setSaving(true)}>
          Сохранить
        </button>
        <button type="button" className="lab-btn is-ghost" onClick={onPickFile}>
          Импорт JSON
        </button>
      </div>
      <div className="lab-filters" role="tablist" aria-label="Каталог">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? "lab-filter is-on" : "lab-filter"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {cards.length ? (
        <div className="lab-preset-rail">
          {cards.map((card) => {
            const on = appliedLookId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                className={on ? "lab-pcard is-on" : "lab-pcard"}
                draggable={card.origin === "mine"}
                onDragStart={() => {
                  if (card.origin !== "mine") return;
                  dragFrom.current = looks.findIndex((l) => l.id === card.id);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from == null || card.origin !== "mine") return;
                  const to = looks.findIndex((l) => l.id === card.id);
                  if (to >= 0 && from !== to) reorderLooks(from, to);
                }}
                onClick={() => applyCard(card)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  haptic("menu");
                  setMenu(card);
                  setRename(card.name);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== "touch") return;
                  const target = e.currentTarget;
                  const hold = window.setTimeout(() => {
                    haptic("menu");
                    setMenu(card);
                    setRename(card.name);
                  }, 460);
                  const clear = () => {
                    window.clearTimeout(hold);
                    target.removeEventListener("pointerup", clear);
                    target.removeEventListener("pointercancel", clear);
                    target.removeEventListener("pointermove", move);
                  };
                  const originX = e.clientX;
                  const originY = e.clientY;
                  const move = (ev: PointerEvent) => {
                    if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > 12) clear();
                  };
                  target.addEventListener("pointerup", clear);
                  target.addEventListener("pointercancel", clear);
                  target.addEventListener("pointermove", move);
                }}
              >
                <span className="lab-pcard-thumb">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" style={{ filter: liveFilter(card.params) }} />
                  ) : (
                    <span className={`lab-pcard-ph is-${filmPack(card.params.filmStock)}`} />
                  )}
                  <span className="lab-pcard-badge">{engineBadge(card.params)}</span>
                  {card.favorite ? <Star className="lab-pcard-star" strokeWidth={2} /> : null}
                </span>
                <span className="lab-pcard-name">{card.name}</span>
                <span className="lab-pcard-meta">{engineFullLabel(engineOf(card.params))}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="lab-preset-empty">Пусто в этом разделе. Сохрани рецепт или импортируй JSON.</p>
      )}

      {saving ? (
        <div className="lab-sheet" role="dialog" aria-label="Сохранить пресет">
          <p className="lab-sheet-title">Новый пресет</p>
          <input
            ref={saveRef}
            className="lab-find"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Название"
            autoCapitalize="sentences"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") setSaving(false);
            }}
          />
          <div className="lab-filters">
            <button
              type="button"
              className={!saveFav ? "lab-filter is-on" : "lab-filter"}
              onClick={() => setSaveFav(false)}
            >
              Мои
            </button>
            <button
              type="button"
              className={saveFav ? "lab-filter is-on" : "lab-filter"}
              onClick={() => setSaveFav(true)}
            >
              Избранное
            </button>
          </div>
          <div className="lab-sheet-row">
            <button type="button" className="lab-btn is-ghost" onClick={() => setSaving(false)}>
              Отмена
            </button>
            <button type="button" className="lab-btn is-solid" onClick={onSave}>
              Сохранить
            </button>
          </div>
        </div>
      ) : null}

      {menu ? (
        <div className="lab-sheet" role="menu" aria-label={menu.name}>
          <div className="lab-sheet-head">
            <p className="lab-sheet-title">{menu.name}</p>
            <button type="button" className="lab-iconbtn" aria-label="Закрыть" onClick={() => setMenu(null)}>
              <X className="size-4" />
            </button>
          </div>
          {menu.origin !== "factory" ? (
            <input
              className="lab-find"
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              onBlur={() => {
                if (rename.trim() && rename.trim() !== menu.name) renameLook(menu.id, rename);
              }}
            />
          ) : null}
          <button
            type="button"
            className="lab-set-go"
            onClick={() => {
              if (menu.origin !== "factory") toggleFavorite(menu.id);
              setMenu(null);
            }}
            disabled={menu.origin === "factory"}
          >
            {menu.favorite ? "Убрать из избранного" : "В избранное"}
          </button>
          {menu.origin === "mine" ? (
            <>
              <button
                type="button"
                className="lab-set-go"
                onClick={() => {
                  const i = looks.findIndex((l) => l.id === menu.id);
                  if (i > 0) reorderLooks(i, i - 1);
                  setMenu(null);
                }}
              >
                Выше
              </button>
              <button
                type="button"
                className="lab-set-go"
                onClick={() => {
                  const i = looks.findIndex((l) => l.id === menu.id);
                  if (i >= 0 && i < looks.length - 1) reorderLooks(i, i + 1);
                  setMenu(null);
                }}
              >
                Ниже
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="lab-set-go"
            onClick={() => {
              const blob = new Blob([serializeLook(menu.name, menu.params)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${menu.name.replace(/\s+/g, "_")}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
              setMenu(null);
            }}
          >
            Экспорт JSON
          </button>
          {menu.origin !== "factory" ? (
            <button
              type="button"
              className="lab-set-go"
              onClick={() => {
                if (menu.origin === "import") deleteImported(menu.id);
                else deleteLook(menu.id);
                setMenu(null);
              }}
            >
              Удалить
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
