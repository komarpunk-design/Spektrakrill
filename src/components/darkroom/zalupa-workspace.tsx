// UI adaptation of Fotufilm phone_editor.dart / phone_decks.dart (Apache-2.0).
// The engine, history and document remain owned by DarkroomApp.
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  Aperture,
  ArrowLeft,
  Bookmark,
  Camera,
  Crop,
  Download,
  Film,
  FlaskConical,
  Grid2X2,
  Images,
  Layers,
  MoreHorizontal,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useDarkroom } from "@/lib/film/store";
import {
  Z_DECKS,
  Z_SERVICE,
  Z_PAGE_HINTS,
  zDeck,
  zPage,
  zChanges,
  type ZPage,
} from "./zalupa-navigation";
const icons: Record<string, LucideIcon> = {
  film: Film,
  spektrafilm: Aperture,
  experimental: FlaskConical,
  grain: Grid2X2,
  lens: Aperture,
  print: Printer,
  light: Sun,
  crop: Crop,
  negs: FlaskConical,
  fotufilm: Layers,
};
function Round({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="z-round"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function ZalupaWorkspace({
  page,
  open,
  onOpen,
  onPage,
  viewer,
  panel,
  fileName,
  hasImage,
  working,
  canSave,
  canUndo,
  canRedo,
  onImport,
  onSave,
  onUndo,
  onRedo,
  onGallery,
  onSearch,
  onReset,
  onResetAll,
  onCompare,
  showOriginal,
  hidden,
  onShowChrome,
  extraActions,
  children,
}: {
  page: ZPage;
  open: boolean;
  onOpen: (open: boolean) => void;
  onPage: (page: ZPage) => void;
  viewer: ReactNode;
  panel: ReactNode;
  fileName: string | null;
  hasImage: boolean;
  working: boolean;
  canSave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onImport: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onGallery: () => void;
  onSearch: () => void;
  onReset: () => void;
  onResetAll: () => void;
  onCompare: () => void;
  showOriginal: boolean;
  hidden: boolean;
  onShowChrome: () => void;
  extraActions?: { label: string; run: () => void; disabled?: boolean }[];
  children?: ReactNode;
}) {
  const params = useDarkroom((s) => s.params),
    prefs = useDarkroom((s) => s.prefs),
    [menu, setMenu] = useState(false),
    [resetArmed, setResetArmed] = useState(false),
    [height, setHeight] = useState(322);
  const body = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    lastPages = useRef<Record<string, string>>({}),
    drag = useRef<{ y: number; height: number } | null>(null),
    moved = useRef(false);
  const inactiveNative =
    (page.id === "grain" && params.experimental.grainRms) ||
    (page.id === "emulsion-dir" && params.experimental.dirLangmuir) ||
    (page.id === "halation" && params.transport.model === "layered");
  const deck = zDeck(page.id),
    library = page.tool === "gallery" || page.tool === "stock";
  useEffect(() => {
    if (deck) lastPages.current[deck.id] = page.id;
    document
      .getElementById("z-tab-" + page.id)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page.id, deck]);
  useEffect(() => {
    if (!menu) {
      setResetArmed(false);
      return;
    }
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, [menu]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open]"))
        onOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onOpen]);
  const choose = (next: ZPage) => {
    setMenu(false);
    onPage(next);
  };
  const pressDeck = (id: string) => {
    const next = Z_DECKS.find((d) => d.id === id)!;
    if (deck?.id === id && open) {
      onOpen(false);
      return;
    }
    choose(zPage(lastPages.current[id] ?? next.pages[0].id));
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const delta = drag.current.y - e.clientY;
    if (Math.abs(delta) > 4) moved.current = true;
    setHeight(
      Math.max(
        120,
        Math.min((body.current?.clientHeight ?? 600) - 120, drag.current.height + delta),
      ),
    );
  };
  return (
    <>
      <header className="z-topbar" aria-label="Действия с фотографией">
        <div className="z-top-start">
          <Round label="Открыть" onClick={onImport} disabled={working}>
            <Plus size={23} />
          </Round>
          <Round
            label={library ? "Вернуться к фотографии" : "Галерея"}
            onClick={onGallery}
            disabled={working}
          >
            {library ? <ArrowLeft size={21} /> : <Images size={21} />}
          </Round>
          {canUndo || canRedo ? (
            <>
              <Round label="Отменить" onClick={onUndo} disabled={!canUndo || working}>
                <Undo2 size={20} />
              </Round>
              <Round label="Повторить" onClick={onRedo} disabled={!canRedo || working}>
                <Redo2 size={20} />
              </Round>
            </>
          ) : null}
        </div>
        <div className="z-desktop-brand">
          <Aperture size={19} />
          <strong>SPEKTRAFILM</strong>
          <span>{fileName ?? "Новый кадр"}</span>
        </div>
        <div className="z-top-end">
          <Round label="Ещё" onClick={() => setMenu(true)}>
            <MoreHorizontal size={23} />
          </Round>
          <Round label="Экспортировать кадр" onClick={onSave} disabled={!canSave}>
            <Download size={21} />
          </Round>
        </div>
      </header>
      <div
        className={"z-body" + (open ? " has-panel" : "") + (library ? " is-library" : "")}
        ref={body}
        style={{ "--z-sheet": height + "px" } as CSSProperties}
      >
        <main className="z-picture" aria-label={library ? page.title : "Фотография"}>
          {viewer}
          {hidden ? (
            <button type="button" className="z-show-chrome" onClick={onShowChrome}>
              Показать инструменты
            </button>
          ) : null}
        </main>
        {open && !library ? (
          <aside
            className="z-inspector"
            aria-label="Инструменты фотографии"
            data-source={deck?.source ?? "app"}
          >
            <button
              type="button"
              className="z-grabber"
              aria-label="Скрыть или изменить размер панели"
              onPointerDown={(e) => {
                moved.current = false;
                drag.current = {
                  y: e.clientY,
                  height:
                    body.current?.querySelector("aside")?.getBoundingClientRect().height ?? height,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
                if (height < 150) onOpen(false);
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onClick={() => {
                if (!moved.current) onOpen(false);
              }}
            >
              <span />
            </button>
            <div className="z-page-tabs">
              <div role="tablist" aria-label={deck?.title ?? page.title}>
                {(deck ? deck.pages : [page]).map((p) => (
                  <button
                    type="button"
                    role="tab"
                    aria-label={p.title}
                    key={p.id}
                    id={"z-tab-" + p.id}
                    aria-controls="z-tool-panel"
                    aria-selected={p.id === page.id}
                    onClick={() => choose(p)}
                  >
                    {p.title}
                    {zChanges(params, p) > 0 ? <i aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
              {!inactiveNative &&
              ![
                "films",
                "negs-profiles",
                "gallery",
                "stock",
                "settings",
                "presets",
                "log",
              ].includes(page.id) ? (
                <button
                  type="button"
                  className="z-panel-action"
                  aria-label="Сбросить текущую страницу"
                  title="Сбросить только эту страницу"
                  onClick={onReset}
                >
                  <RotateCcw size={16} />
                </button>
              ) : null}
              <button
                type="button"
                className="z-panel-action"
                aria-label="Закрыть панель"
                onClick={() => onOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            {page.id !== "films" ? (
              <>
                {" "}
                <div className="z-panel-context">
                  <span>{deck?.fullTitle ?? "Приложение"}</span>
                  {zChanges(params, page) > 0 ? <span>{zChanges(params, page)} изм.</span> : null}
                </div>
              </>
            ) : null}
            {deck && deck.source !== "catalog" ? (
              <p className="z-source-description">{Z_PAGE_HINTS[page.id] ?? deck.description}</p>
            ) : null}
            <div
              id="z-tool-panel"
              role="tabpanel"
              aria-label={page.title}
              className="lab-sliders z-control-page"
              data-page={page.id}
              key={page.id}
            >
              {panel}
            </div>
          </aside>
        ) : null}
      </div>
      <nav
        className={"z-decks" + (prefs.showToolLabels ? "" : " no-labels")}
        aria-label="Группы инструментов"
      >
        {Z_DECKS.map((d) => {
          const Icon = icons[d.icon],
            changed = d.pages.some((p) => zChanges(params, p) > 0),
            selected = deck?.id === d.id && open;
          return (
            <button
              type="button"
              key={d.id}
              aria-label={d.title}
              aria-pressed={selected}
              disabled={!hasImage}
              title={!hasImage ? "Сначала откройте фотографию" : d.title}
              onClick={() => pressDeck(d.id)}
            >
              <span className="z-deck-icon">
                <Icon size={22} strokeWidth={1.6} />
                {changed ? <i /> : null}
              </span>
              {prefs.showToolLabels ? <span data-z-deck-label>{d.title}</span> : null}
            </button>
          );
        })}
        {prefs.showLabTabs
          ? Z_SERVICE.filter((p) => p.id === "lab" || p.id === "log").map((p) => (
              <button
                type="button"
                key={p.id}
                aria-label={p.title}
                aria-pressed={open && page.id === p.id}
                onClick={() => choose(p)}
              >
                <span className="z-deck-icon">
                  <SlidersHorizontal size={22} />
                </span>
                {prefs.showToolLabels ? <span data-z-deck-label>{p.title}</span> : null}
              </button>
            ))
          : null}
      </nav>
      {children}
      {menu
        ? createPortal(
            <dialog
              ref={dialog}
              className="z-more"
              aria-label="Меню редактора"
              onCancel={(e) => {
                e.preventDefault();
                setMenu(false);
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setMenu(false);
              }}
            >
              <header>
                <strong>Редактор</strong>
                <button type="button" aria-label="Закрыть меню" onClick={() => setMenu(false)}>
                  <X size={20} />
                </button>
              </header>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onSearch();
                }}
              >
                <Search size={18} />
                Найти инструмент или параметр
              </button>
              {hasImage ? (
                <button
                  type="button"
                  aria-pressed={showOriginal}
                  onClick={() => {
                    setMenu(false);
                    onCompare();
                  }}
                >
                  <Camera size={18} />
                  {showOriginal ? "Показать обработку" : "Сравнить с исходником"}
                </button>
              ) : null}
              {extraActions?.map((a) => (
                <button
                  type="button"
                  key={a.label}
                  disabled={a.disabled}
                  onClick={() => {
                    setMenu(false);
                    a.run();
                  }}
                >
                  <Plus size={18} />
                  {a.label}
                </button>
              ))}
              <div className="z-menu-label">Работа с фотографиями</div>
              {Z_SERVICE.filter((p) => p.id !== "edit").map((p) => (
                <button type="button" key={p.id} onClick={() => choose(p)}>
                  {p.id === "settings" ? (
                    <Settings size={18} />
                  ) : p.id === "presets" ? (
                    <Bookmark size={18} />
                  ) : (
                    <SlidersHorizontal size={18} />
                  )}{" "}
                  {p.title}
                </button>
              ))}
              <div className="z-menu-label">Инструменты по источникам</div>
              {Z_DECKS.map((d) => {
                const Icon = icons[d.icon];
                return (
                  <button
                    type="button"
                    key={d.id}
                    disabled={!hasImage}
                    onClick={() => {
                      setMenu(false);
                      pressDeck(d.id);
                    }}
                  >
                    <Icon size={18} />
                    {d.title}
                  </button>
                );
              })}
              <div className="z-menu-label">Сброс</div>
              <button
                type="button"
                disabled={working}
                onClick={() => {
                  if (!resetArmed) {
                    setResetArmed(true);
                    return;
                  }
                  onResetAll();
                  setMenu(false);
                }}
              >
                {resetArmed
                  ? "Подтвердить сброс обработки и настроек"
                  : "Сбросить обработку и настройки"}
              </button>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
