import {controlHelp} from "@/lib/film/control-guide";
import { cn } from "@/lib/utils";
import { useDarkroom } from "@/lib/film/store";
import { haptic, hapticSlider } from "@/lib/film/haptic";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useId, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";


function ControlHint({label,id}:{label:string;id?:string}){
 const tool=useDarkroom(s=>s.tool),show=useDarkroom(s=>s.prefs.showControlHelp),text=controlHelp(label,tool);
 if(!text)return null;
 return show!==false?<span id={id} className="control-help">{text}</span>:<details className="control-help-disclosure"><summary aria-label={`Для чего: ${label}`}>ⓘ Пояснение</summary><span id={id} className="control-help">{text}</span></details>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint ? (
          <span className="text-xs tabular-nums text-subtle">{hint}</span>
        ) : null}
      </span>
      {children}
      <ControlHint label={label}/>
    </div>
  );
}

function snap(value: number, step: number): number {
  const n = Math.round(value / step) * step;
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(n.toFixed(Math.min(6, decimals)));
}

const TAP_SLOP = 6;

function clampStep(value: number, min: number, max: number, step: number): number {
  return Math.min(max, Math.max(min, snap(value, step)));
}

export function Stepper({
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const setScrubbing = useDarkroom((s) => s.setScrubbing);
  const valueRef = useRef(value);
  valueRef.current = value;
  const hold = useRef<number | null>(null);
  const repeat = useRef<number | null>(null);

  const stop = () => {
    if (hold.current != null) window.clearTimeout(hold.current);
    if (repeat.current != null) window.clearInterval(repeat.current);
    hold.current = null;
    repeat.current = null;
    setScrubbing(false);
  };

  useEffect(() => {
    return () => {
      if (hold.current != null) window.clearTimeout(hold.current);
      if (repeat.current != null) window.clearInterval(repeat.current);
      hold.current = null;
      repeat.current = null;
      useDarkroom.getState().setScrubbing(false);
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    const next = clampStep(valueRef.current + dir * step, min, max, step);
    if (next !== valueRef.current) onChange(next);
  };

  const start = (dir: 1 | -1) => {
    if (disabled) return;
    setScrubbing(true);
    nudge(dir);
    hold.current = window.setTimeout(() => {
      repeat.current = window.setInterval(() => nudge(dir), 70);
    }, 280);
  };

  return (
    <div className="lab-stepper">
      <button
        type="button"
        className="lab-step"
        aria-label="Меньше"
        disabled={disabled || value <= min}
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          start(-1);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <Minus className="size-4" strokeWidth={2.25} />
      </button>
      <span className="lab-step-value">{formatValue(value, step)}</span>
      <button
        type="button"
        className="lab-step"
        aria-label="Больше"
        disabled={disabled || value >= max}
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          start(1);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <Plus className="size-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}

function formatValue(value: number, step: number): string {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const s = value.toFixed(decimals);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("lab-switch", checked && "is-on")}
    >
      <span className="lab-switch-knob" />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled=false,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; group?: string }[];
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const o of options) {
    const g = o.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  return (
    <div className="lab-select-wrap">
      <select
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="lab-select"
      >
        {[...groups.entries()].map(([g, items]) =>
          g ? (
            <optgroup key={g} label={g}>
              {items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
      <ChevronDown className="lab-select-caret" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="lab-seg">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn("lab-seg-btn", on && "is-on")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Group({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4">
      {title ? <p className="text-xs font-medium text-muted">{title}</p> : null}
      {children}
    </div>
  );
}

export function SliderRow({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  disabled=false,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?:boolean;
}) {
  const helpId=useId();
  const setScrubbing = useDarkroom((s) => s.setScrubbing);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    start: number;
    width: number;
    armed: boolean;
  } | null>(null);
  const valueRef = useRef(value);
  if (!drag.current?.armed) valueRef.current = value;

  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const zeroPct = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : null;
  const fillLeft = zeroPct == null ? 0 : Math.min(zeroPct, fill);
  const fillWidth = zeroPct == null ? fill : Math.abs(fill - zeroPct);

  const commit = (next: number) => {
    if (disabled||next === valueRef.current) return;
    hapticSlider(valueRef.current, next, min, max);
    valueRef.current = next;
    onChange(next);
  };

  const applyDelta = (clientX: number) => {
    const d = drag.current;
    if (!d || d.width < 2) return;
    const t = (clientX - d.x) / d.width;
    commit(clampStep(d.start + t * (max - min), min, max, step));
  };

  const arm = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.armed) return;
    d.armed = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setScrubbing(true);
    rowRef.current?.classList.add("is-live");
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.armed) return;
    setScrubbing(false);
    rowRef.current?.classList.remove("is-live");
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if(disabled)return;
    if (e.button != null && e.button !== 0) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: valueRef.current,
      width: rect?.width ?? 1,
      armed: false,
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.armed) {
      if (Math.abs(dy) > TAP_SLOP && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) <= TAP_SLOP) return;
      arm(e);
    }
    e.preventDefault();
    applyDelta(e.clientX);
  };

  const setToMin = () => {
    if(disabled)return;
    const next = clampStep(min, min, max, step);
    if (Math.abs(valueRef.current - next) <= 1e-9) return;
    haptic(Math.abs(next) <= 1e-9 ? "zero" : "edge");
    valueRef.current = next;
    onChange(next);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) {
      end();
      return;
    }
    if (!d.armed) {
      drag.current = null;
      setToMin();
      return;
    }
    end();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if(disabled)return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(clampStep(valueRef.current - step, min, max, step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(clampStep(valueRef.current + step, min, max, step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setToMin();
    } else if (e.key === "End") {
      e.preventDefault();
      commit(clampStep(max, min, max, step));
    }
  };

  return (
    <div className={disabled?"lab-slider-row is-disabled":"lab-slider-row"} ref={rowRef}>
      <span className="lab-slider-head">
        <span className="lab-slider-label">{label}</span>
        {hint ? <span className="lab-slider-hint">{hint}</span> : null}
      </span>
      <div
        ref={wrapRef}
        className="lab-range-wrap"
        role="slider"
        tabIndex={disabled?-1:0}
        aria-disabled={disabled}
        aria-label={label}
        aria-describedby={controlHelp(label)?helpId:undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={hint ?? String(value)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={onKey}
      >
        <i className="lab-range-track" />
        <i className="lab-range-fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
        {zeroPct != null ? <i className="lab-range-zero" style={{ left: `${zeroPct}%` }} /> : null}
        <i className="lab-range-thumb" style={{ left: `${fill}%` }} />
      </div>
      <ControlHint label={label} id={helpId}/>
    </div>
  );
}

export function IconBtn({
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

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-muted">{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.65rem] leading-snug text-subtle">{hint}</span> : null}
        <ControlHint label={label}/>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-12 w-full items-center justify-between px-4 text-left"
      >
        <span className="text-sm font-medium text-fg">{title}</span>
        <ChevronRight
          className={cn(
            "size-4 text-subtle transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
      <div className={cn("overflow-hidden", !open && "hidden")}>
        <div className="flex flex-col gap-4 px-4 pb-5">{children}</div>
      </div>
    </section>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "solid" | "line";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "lab-btn",
        variant === "solid" && "is-solid",
        variant === "ghost" && "is-ghost",
        variant === "line" && "is-line",
        className,
      )}
    >
      {children}
    </button>
  );
}
