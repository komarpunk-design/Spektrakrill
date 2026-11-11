import { useEffect, useRef, useState } from "react";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import { TOOL_GUIDE } from "@/lib/film/workflow-guide";
import {
  Z_DECKS,
  Z_SERVICE,
  zPages,
  zDeck,
  zChanges,
  pageForTool,
  Z_PAGE_HINTS,
  type ZPage,
} from "./zalupa-navigation";
import index from "@/lib/film/control-index.json";
import { controlHelp } from "@/lib/film/control-guide";
export function ControlDirectory({
  close,
  select,
  notice,
  selectPage,
}: {
  close: () => void;
  select: (id: ToolId, label?: string) => void;
  selectPage?: (page: ZPage, label?: string) => void;
  notice: (text: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [source, setSource] = useState("all"),
    [changed, setChanged] = useState(false),
    params = useDarkroom((s) => s.params),
    box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    box.current?.showModal();
    return () => previous?.focus();
  }, []);
  const normalize = (text: string) => text.toLowerCase().replaceAll("ё", "е");
  const aliases: Record<string, string> = {
    пуш: "push",
    пул: "pull",
    пулл: "pull",
    лейер: "layered",
    лейеры: "layered",
    транспорт: "transport",
  };
  const words = normalize(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => aliases[word] ?? word);
  const matches = (text: string) => words.every((word) => normalize(text).includes(word));
  const q = query.trim();
  const candidates = index.rows
    .filter((r) => r.tool !== "edit")
    .map((r) => ({ ...r, page: pageForTool(r.tool as ToolId, r.label) }));
  const groups = [
    ...Z_DECKS.map((d) => ({ id: d.id, title: d.fullTitle, pages: [...d.pages] as ZPage[] })),
    { id: "app", title: "Приложение", pages: Z_SERVICE },
  ]
    .map((group) => ({
      ...group,
      pages: group.pages
        .filter((p) => !changed || zChanges(params, p) > 0)
        .map((page) => {
          const guide = TOOL_GUIDE[page.tool],
            purpose = Z_PAGE_HINTS[page.id] ?? zDeck(page.id)?.description ?? guide.purpose;
          const rows = candidates
            .filter(
              (r) =>
                r.page.id === page.id &&
                q &&
                matches(`${r.label} ${controlHelp(r.label, page.tool) ?? ""}`),
            )
            .filter((r, i, a) => a.findIndex((x) => x.label === r.label) === i);
          return {
            page,
            purpose,
            rows,
            match: !q || matches(`${page.title} ${purpose} ${group.title}`),
          };
        })
        .filter((r) => r.match || r.rows.length),
    }))
    .filter((g) => g.pages.length && (source === "all" || g.id === source));
  const open = (page: ZPage, label?: string) => {
    const tool = page.tool;
    if (selectPage) selectPage(page, label);
    else select(tool, label);
    close();
    if (label)
      window.setTimeout(() => {
        if (useDarkroom.getState().tool !== tool) return;
        const labels = [
            ...document.querySelectorAll<HTMLElement>(
              ".lab-sliders [data-control-label], .lab-sliders input[aria-label], .lab-sliders textarea[aria-label]",
            ),
          ],
          el = labels.find(
            (el) => (el.dataset.controlLabel ?? el.getAttribute("aria-label")) === label,
          );
        if (!el) {
          const reason =
            page.id === "grain" && /RMS|Равномерность [RGB]|Минимальная плотность|Размер частиц ·|резкости плотности/.test(label)
              ? "выберите «RMS» в поле «Модель зерна» и включите зерно."
              : page.id === "halation" && /Антигаляционный|Толщина основы|Отражение прижимной|Мутность основы/.test(label)
                ? "выберите «Layered Transport» в поле «Модель галяции» и включите галяцию."
                : page.id === "dir" && /донор|приёмник|приемник|хвост/i.test(label)
                  ? "выберите «Langmuir» в поле «Модель DIR» и включите DIR-каплеры."
                  : page.id === "output"
                    ? "выберите подходящий цифровой вывод; для Lab Scan нужна негативная плёнка и маршрут обычной фотографии."
                    : page.id === "frame"
                      ? "выберите плёночную рамку; DX-полоса доступна только у 135."
                      : page.id === "negative"
                        ? "выберите маршрут скана настоящего негатива. Полная конвертация доступна в Android APK."
                        : page.id === "paper"
                          ? "выберите вывод на фотобумагу; при цифровом выводе эта стадия обходится."
                          : page.id === "chemistry"
                            ? "включите химию по слоям; нужны параметрический профиль и, для выбора времени, временное семейство материала."
                            : null;
          if (reason) {
            notice(label + ": " + reason);
            return;
          }
          notice(
            tool === "fotufilm" &&
              [
                "Антигаляционный слой",
                "Толщина основы",
                "Отражение прижимной пластины",
                "Мутность основы",
              ].includes(label)
              ? label + ": выберите модель «Layered Transport» и включите галяцию."
              : label +
                  ": выберите соответствующую модель и включите эффект; условия указаны в разделе.",
          );
          return;
        }
        let parent = el.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        const row = el.closest<HTMLElement>(".lab-slider-row") ?? el;
        row.scrollIntoView({ block: "center" });
        row.classList.add("ux-found");
        window.setTimeout(() => row.classList.remove("ux-found"), 2400);
        (
          (row.matches("input,textarea,select")
            ? row
            : row.querySelector<HTMLElement>(
                '[role="slider"],[role="switch"],select,input,textarea',
              )) ?? row.querySelector<HTMLElement>("button")
        )?.focus({ preventScroll: true });
      }, 300);
  };
  return (
    <dialog
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      ref={box}
      aria-label="Инструменты и параметры"
      className="ux-directory"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <div>
          <h2>Инструменты и параметры</h2>
          <p>По названию, задаче или эффекту. Разделы доступны в любом порядке.</p>
        </div>
        <button aria-label="Закрыть поиск" onClick={close}>
          ✕
        </button>
      </header>
      <input
        autoFocus
        type="search"
        aria-label="Поиск инструмента или параметра"
        placeholder="Например: зерно, тени, толщина основы…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        className="lab-select"
        aria-label="Раздел обработки"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        <option value="all">Все разделы</option>
        {Z_DECKS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.fullTitle}
          </option>
        ))}
        <option value="app">Приложение</option>
      </select>
      <label className="ux-changed">
        <input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} />{" "}
        Только изменённые разделы
      </label>
      <div className="ux-results">
        {groups.map((group) => (
          <section key={group.id} data-source={group.id}>
            <h3 className="ux-source-heading">{group.title}</h3>
            {group.pages.map(({ page, purpose, rows }) => (
              <div key={page.id}>
                <button className="ux-tool-result" onClick={() => open(page)}>
                  <strong>
                    {page.title}
                    {zChanges(params, page) > 0 ? ` · ${zChanges(params, page)} изм.` : ""}
                  </strong>
                  <span>{purpose}</span>
                </button>
                {rows.map((r) => (
                  <button
                    className="ux-param-result"
                    key={r.label}
                    onClick={() => open(page, r.targetLabel)}
                  >
                    {r.label}
                    <small>
                      {controlHelp(r.label, page.tool) ??
                        "Откройте страницу для настройки этого параметра."}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </section>
        ))}
        {!groups.length ? (
          <p>Ничего не найдено. Попробуйте название эффекта или сбросьте фильтр изменений.</p>
        ) : null}
      </div>
    </dialog>
  );
}
