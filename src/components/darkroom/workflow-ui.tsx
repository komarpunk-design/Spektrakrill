import { createContext, useContext, useState, type ReactNode } from "react";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import { defaultParams } from "@/lib/film/defaults";
import { TOOL_GUIDE } from "@/lib/film/workflow-guide";
export function WorkflowTools({ tool, select }: { tool: ToolId; select: (tool: ToolId) => void }) {
  if (["edit", "film", "gallery", "export"].includes(tool)) return null;
  return (
    <nav className="workspace-back">
      <button type="button" onClick={() => select("edit")}>
        ← Вернуться к обработке
      </button>
    </nav>
  );
}
const InsideSection = createContext(false);
export function ToolIntro({ tool }: { tool: ToolId }) {
  const guide = TOOL_GUIDE[tool];
  return (
    <header className="workflow-intro">
      <h2>{guide.title}</h2>
      <p>{guide.purpose}</p>
    </header>
  );
}
export function ControlSection({
  title,
  description,
  children,
  defaultOpen = false,
  keys = [],
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
  keys?: string[];
}) {
  const nested = useContext(InsideSection),
    params = useDarkroom((s) => s.params),
    baseline = defaultParams();
  const get = (o: unknown, path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
        o,
      );
  const changes = keys.filter(
    (k) => JSON.stringify(get(params, k)) !== JSON.stringify(get(baseline, k)),
  ).length;
  const [open, setOpen] = useState(() => defaultOpen);
  if (nested)
    return (
      <section className="control-section-flat">
        <h3>{title}</h3>
        <p>{description}</p>
        {children}
      </section>
    );
  return (
    <InsideSection.Provider value={true}>
      <details
        className="control-section"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <span className="control-section-meta">
            {changes > 0 ? <b>{changes} изм.</b> : null}
            <i aria-hidden="true">{open ? "−" : "+"}</i>
          </span>
        </summary>
        <div className="control-section-body">{children}</div>
      </details>
    </InsideSection.Provider>
  );
}
export function ToolLinks({ tools }: { tools: ToolId[] }) {
  const setTool = useDarkroom((s) => s.setTool);
  return (
    <div className="workflow-links">
      {tools.map((id) => (
        <button key={id} type="button" onClick={() => setTool(id)}>
          <strong>
            {TOOL_GUIDE[id].short}
            <span>→</span>
          </strong>
          <small>{TOOL_GUIDE[id].purpose}</small>
        </button>
      ))}
    </div>
  );
}
