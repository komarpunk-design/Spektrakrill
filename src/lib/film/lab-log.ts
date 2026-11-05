const KEY = "spektra-js-log";
const MAX = 180;

export type LabLogLine = {
  t: number;
  lvl: "I" | "W" | "E";
  tag: string;
  msg: string;
};

let lines: LabLogLine[] = load();

function load(): LabLogLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabLogLine[];
    return Array.isArray(parsed) ? parsed.slice(-MAX) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines.slice(-MAX)));
  } catch {
    /* quota */
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function stamp(t: number): string {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function pushLabLog(lvl: LabLogLine["lvl"], tag: string, msg: string) {
  const line: LabLogLine = { t: Date.now(), lvl, tag, msg: String(msg ?? "").slice(0, 1200) };
  lines = [...lines, line].slice(-MAX);
  persist();
  if (lvl === "E") console.error(`[${tag}]`, msg);
  else if (lvl === "W") console.warn(`[${tag}]`, msg);
}

export function jsLogText(): string {
  if (!lines.length) return "(web log empty)";
  return lines.map((l) => `${stamp(l.t)} ${l.lvl}/${l.tag} ${l.msg}`).join("\n");
}

export function clearJsLog() {
  lines = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function installLabLogHooks() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __spektraLogHooks?: boolean };
  if (w.__spektraLogHooks) return;
  w.__spektraLogHooks = true;
  window.addEventListener("error", (e) => {
    const err = e.error;
    const stack = err instanceof Error ? err.stack : "";
    pushLabLog("E", "js", `${e.message || "error"}${stack ? `\n${stack.split("\n").slice(0, 6).join("\n")}` : ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const msg = r instanceof Error ? `${r.message}\n${r.stack ?? ""}` : String(r ?? "rejection");
    pushLabLog("E", "promise", msg.split("\n").slice(0, 6).join("\n"));
  });
}
