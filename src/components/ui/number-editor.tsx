import { quantizeControl } from "@/lib/film/control-number";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export function NumberEditor({
  label,
  value,
  min,
  max,
  step,
  baseline,
  apply,
  close,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  baseline?: number;
  apply: (v: number) => void;
  close: () => void;
}) {
  const [text, setText] = useState(String(value)),
    [error, setError] = useState(""),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    dialog.current?.querySelector("input")?.select();
    return () => previous?.focus();
  }, []);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const n = Number(text.replace(",", "."));
    if (!text.trim() || !Number.isFinite(n) || n < min || n > max) {
      setError(`Введите число от ${min} до ${max}.`);
      return;
    }
    apply(quantizeControl(n, min, max, step));
    close();
  };
  return createPortal(
    <dialog
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      aria-label={label}
      className="ux-number"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit}>
        <h2>{label}</h2>
        <label>
          Значение
          <input
            aria-label="Точное значение"
            inputMode="decimal"
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
          />
        </label>
        {min < 0 ? (
          <button
            type="button"
            aria-label="Сменить знак значения"
            onClick={() => setText(text.startsWith("-") ? text.slice(1) : "-" + text)}
          >
            − / +
          </button>
        ) : null}
        <p>
          Диапазон {min}…{max} · шаг {step}
        </p>
        <p>
          {baseline === undefined
            ? "Значение по умолчанию зависит от профиля или динамической настройки."
            : `Заводское значение: ${baseline}`}
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          {baseline !== undefined ? (
            <button type="button" onClick={() => setText(String(baseline))}>
              По умолчанию
            </button>
          ) : null}
          <button type="button" onClick={close}>
            Отмена
          </button>
          <button type="submit">Применить</button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
