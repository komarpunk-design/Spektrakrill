import { stockLookLabel, type StockItem } from "@/lib/film/stock";
import { Library, Trash2 } from "lucide-react";

function statusLabel(item: StockItem): string {
  if (item.status === "exporting") return "Проявляю";
  if (item.status === "done") return "Готово";
  if (item.status === "error") return "Ошибка";
  return stockLookLabel(item.params);
}

export function StockPane({
  items,
  busy = false,
  onExportAll,
  onOpen,
  onDelete,
  onClearDone,
}: {
  items: StockItem[];
  busy?: boolean;
  onExportAll: () => void;
  onOpen: (item: StockItem) => void;
  onDelete: (id: string) => void;
  onClearDone: () => void;
}) {
  const pending = items.filter(
    (s) => s.status === "queued" || s.status === "error" || s.status === "exporting",
  ).length;
  const done = items.filter((s) => s.status === "done").length;

  if (!items.length) {
    return (
      <div className="lab-gallery-empty">
        <Library className="lab-empty-icon" strokeWidth={1.2} />
        <p>
          Сюда складываются кадры с уже выбранной плёнкой и правками. Потом одна кнопка проявляет
          все в полном размере — можно не ждать каждый по очереди.
        </p>
      </div>
    );
  }

  return (
    <div className="lab-stock">
      <div className="lab-stock-bar">
        <button
          type="button"
          className="lab-btn is-solid"
          disabled={busy || pending === 0}
          onClick={onExportAll}
        >
          {busy ? "Проявляю…" : pending ? `Проявить все · ${pending}` : "Нечего проявлять"}
        </button>
        {done > 0 ? (
          <button type="button" className="lab-btn is-ghost" disabled={busy} onClick={onClearDone}>
            Убрать готовые
          </button>
        ) : null}
      </div>
      <div className="lab-gallery lab-stock-grid">
        {items.map((shot) => (
          <div
            key={shot.id}
            className={[
              "lab-stock-cell",
              shot.status === "done" && "is-done",
              shot.status === "exporting" && "is-run",
              shot.status === "error" && "is-err",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className="lab-stock-open"
              title={`${shot.name} · ${stockLookLabel(shot.params)}`}
              onClick={() => onOpen(shot)}
            >
              {shot.thumb ? <img src={shot.thumb} alt="" /> : <span className="lab-gallery-ph" />}
              <span className="lab-stock-cap">
                <span className="lab-stock-look">{statusLabel(shot)}</span>
              </span>
            </button>
            <button
              type="button"
              className="lab-stock-del"
              aria-label="Убрать из стока"
              disabled={busy && shot.status === "exporting"}
              onClick={() => onDelete(shot.id)}
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
