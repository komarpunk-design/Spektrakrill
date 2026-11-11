import { useEffect, useRef, useState } from "react";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import { TOOL_GUIDE } from "@/lib/film/workflow-guide";
import { toolChangeCount } from "@/lib/film/tool-state";
import index from "@/lib/film/control-index.json";
import { controlHelp } from "@/lib/film/control-guide";
const hidden = ["edit", "frame", "outputs", "texture"];
export function ControlDirectory({
  close,
  select,
  notice,
}: {
  close: () => void;
  select: (id: ToolId) => void;
  notice: (text: string) => void;
}) {
  const [query, setQuery] = useState(""),
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
  const q = query.trim(),
    tools = (Object.keys(TOOL_GUIDE) as ToolId[]).filter(
      (id) => !hidden.includes(id) && (!changed || toolChangeCount(params, id) > 0),
    );
  const open = (tool: ToolId, label?: string) => {
    select(tool);
    close();
    if (label)
      window.setTimeout(() => {
        if (useDarkroom.getState().tool !== tool) return;
        const labels = [
            ...document.querySelectorAll<HTMLElement>(".lab-sliders [data-control-label]"),
          ],
          el = labels.find((el) => el.dataset.controlLabel === label);
        if (!el) {
          const reason =
            tool === "fotufilm" && params.filmStock === "none"
              ? "сначала выберите плёнку на вкладке «Плёнка»."
              : tool === "fotufilm" &&
                  ["Характер минилаба", "Автонастройка минилаба"].includes(label)
                ? "выберите «Lab Scan · минилаб»; нужен негативный материал и обычный режим исходника."
                : tool === "fotufilm" &&
                    ["Яркость скана", "Ключ Cyan", "Ключ Magenta", "Ключ Yellow"].includes(label)
                  ? "выберите Digital Reference, Auto Levels или Lab Scan; нужен негативный материал и обычный режим исходника."
                  : tool === "crop" &&
                      ["Номер кадра", "DX-полоса", "Дата на снимке"].includes(label)
                    ? "выберите рамку 135, 120 или минималистичную кромку ниже; DX-полоса доступна только у 135."
                    : tool === "negative"
                      ? "выберите скан настоящего негатива в поле «Источник изображения». Для времени проявки нужен профиль соответствующей плёнки."
                      : tool === "print" && params.output.mode !== "paper"
                        ? "включите «Печать Spektrafilm» в этом разделе; выбранный сейчас цифровой результат пропускает бумагу."
                        : tool === "negs" &&
                            /RMS|Равномерность|Минимальная плотность|Размер частиц|резкости плотности/.test(
                              label,
                            )
                          ? "включите «Зернистость по RMS». Основной переключатель «Зерно» управляет вкладом эффекта в кадр."
                          : tool === "negs" && /донор|приемник|приёмник|хвост/i.test(label)
                            ? "включите «Нелинейная модель Langmuir» в группе DIR."
                            : tool === "development"
                              ? "включите «Химия плёнки по слоям»; выбор времени проявки появляется для материалов с временными профилями."
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
              ? label + ": включите «Использовать Layered Transport»."
              : label +
                  ": включите соответствующий эффект или выберите подходящий материал; условия указаны в разделе.",
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
          row.querySelector<HTMLElement>('[role="slider"],[role="switch"],select,input') ??
          row.querySelector<HTMLElement>("button")
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
      <label className="ux-changed">
        <input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} />{" "}
        Только изменённые разделы
      </label>
      <div className="ux-results">
        {tools.map((id) => {
          const guide = TOOL_GUIDE[id],
            rows = index.rows.filter(
              (r) => r.tool === id && q && matches(`${r.label} ${controlHelp(r.label, id) ?? ""}`),
            ),
            match = !q || matches(`${guide.title} ${guide.purpose}`);
          if (!match && !rows.length) return null;
          return (
            <section key={id}>
              <button className="ux-tool-result" onClick={() => open(id)}>
                <strong>
                  {guide.title}
                  {toolChangeCount(params, id) > 0 ? ` · ${toolChangeCount(params, id)} изм.` : ""}
                </strong>
                <span>{guide.purpose}</span>
              </button>
              {rows
                .filter((r, i, a) => a.findIndex((x) => x.label === r.label) === i)
                .map((r) => (
                  <button
                    className="ux-param-result"
                    key={r.label}
                    onClick={() => open(id, r.targetLabel)}
                  >
                    {r.label}
                    <small>
                      {controlHelp(r.label, id) ??
                        "Откройте инструмент для настройки этого параметра."}
                    </small>
                  </button>
                ))}
            </section>
          );
        })}
        {!tools.some(
          (id) =>
            !q ||
            matches(`${TOOL_GUIDE[id].title} ${TOOL_GUIDE[id].purpose}`) ||
            index.rows.some(
              (r) => r.tool === id && matches(`${r.label} ${controlHelp(r.label, id) ?? ""}`),
            ),
        ) ? (
          <p>Ничего не найдено. Попробуйте название эффекта или сбросьте фильтр изменений.</p>
        ) : null}
      </div>
    </dialog>
  );
}
