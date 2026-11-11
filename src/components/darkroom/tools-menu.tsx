import { useEffect, useRef, useState } from "react";
import { TOOL_GUIDE, WORKFLOW_STAGES } from "@/lib/film/workflow-guide";
import { type ToolId, useDarkroom } from "@/lib/film/store";
export function ToolsMenu({ close, select }: { close: () => void; select: (id: ToolId) => void }) {
  const [query, setQuery] = useState(""),
    box = useRef<HTMLDivElement>(null),
    engine = useDarkroom((s) => s.params.rawEngine);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector("input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const buttons = [...box.current!.querySelectorAll<HTMLElement>("input,button")],
          first = buttons[0],
          last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [close]);
  const needle = query.trim().toLowerCase();
  return (
    <div
      className="tools-menu-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="tools-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tools-menu-title"
        ref={box}
      >
        <header>
          <div>
            <h2 id="tools-menu-title">Все инструменты</h2>
            <p>Один список. Выберите нужную задачу.</p>
          </div>
          <button type="button" aria-label="Закрыть инструменты" onClick={close}>
            ✕
          </button>
        </header>
        <input
          type="search"
          aria-label="Найти инструмент"
          placeholder="Например: гало, рамки, Push…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="tools-menu-list">
          {WORKFLOW_STAGES.map((stage) => {
            const ids = stage.tools.filter(
              (id) =>
                id !== "edit" &&
                (id !== "tone" || engine !== "spektrafilm") &&
                (!needle ||
                  `${TOOL_GUIDE[id].title} ${TOOL_GUIDE[id].purpose} ${id === "texture" ? "гало галяция Layered Transport" : ""}`
                    .toLowerCase()
                    .includes(needle)),
            );
            return ids.length ? (
              <section key={stage.id}>
                <h3>{stage.label}</h3>
                {ids.map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      select(id);
                      close();
                    }}
                  >
                    <strong>{TOOL_GUIDE[id].title}</strong>
                    <span>{TOOL_GUIDE[id].purpose}</span>
                  </button>
                ))}
              </section>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
