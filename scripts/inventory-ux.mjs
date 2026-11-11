// Freeze the pre-redesign contract; never infer the original ranges from edited UI.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const base = "4821309",
  dir = "src/components/darkroom",
  rows = [];
const files = execFileSync("git", ["ls-tree", "--name-only", base, dir + "/"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => f.endsWith(".tsx"));
const byFile = {
  "halation-controls.tsx": "fotufilm",
  "output-controls.tsx": "fotufilm",
  "prep-controls.tsx": "prep",
  "development-controls.tsx": "development",
  "emulsion-controls.tsx": "emulsion",
  "texture-controls.tsx": "texture",
  "source-controls.tsx": "negs",
  "edit-workspace.tsx": "edit",
};
for (const path of files) {
  const file = path.split("/").at(-1),
    source = execFileSync("git", ["show", base + ":" + path], { encoding: "utf8" }),
    tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const text = (n) => n?.getText(tree) ?? "";
  const expression = (n) => (n && ts.isJsxExpression(n) ? n.expression : n);
  const strings = (n) =>
    !n
      ? []
      : ts.isStringLiteral(n)
        ? [n.text]
        : ts.isConditionalExpression(n)
          ? [...strings(n.whenTrue), ...strings(n.whenFalse)]
          : [];
  function context(n) {
    let tool = byFile[file] ?? "settings";
    const conditions = [];
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isConditionalExpression(p)) {
        const condition = text(p.condition);
        conditions.push(condition);
        const t = condition.match(/tool\s*===\s*["']([^"']+)/),
          m = condition.match(/mode\s*===\s*["']([^"']+)/);
        if (t) tool = t[1];
        if (m && file === "emulsion-controls.tsx")
          tool =
            {
              advanced: "emulsion",
              negative: "negative",
              chemistry: "development",
              grain: "negs",
              dir: "negs",
              paper: "print",
            }[m[1]] ?? tool;
      }
    }
    return { tool, dependency: conditions.join(" → ") || "Без условного родителя" };
  }
  function add(n, label, type, value, min = "", max = "", step = "", handler = "", extra = {}) {
    rows.push({ label, ...context(n), file, type, value, min, max, step, handler, ...extra });
  }
  function visit(n) {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const type = text(n.tagName);
      const rawAttrs = Object.fromEntries(
        n.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((a) => [text(a.name), expression(a.initializer)]),
      );
      if (["input", "textarea"].includes(type) && rawAttrs.value && rawAttrs.onChange) {
        for (const label of strings(rawAttrs["aria-label"]))
          add(
            n,
            label,
            "TextInput",
            text(rawAttrs.value),
            text(rawAttrs.min),
            text(rawAttrs.max),
            text(rawAttrs.step),
            text(rawAttrs.onChange),
          );
      }
      if (file === "panel.tsx" && strings(rawAttrs["aria-label"]).includes("Рамка фотографии"))
        add(
          n,
          "Рамка фотографии",
          "FramePicker",
          "params.frameStyle",
          "",
          "",
          "",
          "setParam(frameStyle, style.value)",
        );

      if (["SliderRow", "ToggleRow", "Field"].includes(type)) {
        const a = Object.fromEntries(
          n.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((a) => [text(a.name), expression(a.initializer)]),
        );
        const labels = strings(a.label);
        for (const label of labels) {
          if (label === "Точные ползунки") continue;
          if (file === "halation-controls.tsx" && label === "Гало вокруг светов") continue;
          const extra =
            label === "Настройка основы бумаги"
              ? { tool: "print" }
              : file === "halation-controls.tsx" && label === "Нормализация"
                ? { tool: "film" }
                : label === "Модель свечения"
                  ? { targetLabel: "Использовать Layered Transport" }
                  : {};
          add(
            n,
            label,
            type,
            text(a.value ?? a.checked),
            text(a.min),
            text(a.max),
            text(a.step),
            text(a.onChange),
            extra,
          );
          if (label === "Настройка основы плёнки")
            add(n, label, type, text(a.checked), "", "", "", text(a.onChange), {
              tool: "negative",
            });
        }
      }
    }
    if (ts.isCallExpression(n) && ["slider", "row"].includes(text(n.expression))) {
      const [key, label, minimum, maximum, step] = n.arguments,
        labels = strings(label);
      if (labels.length) {
        const helper = text(n.expression),
          isPrep = file === "prep-controls.tsx",
          isOutput = file === "output-controls.tsx",
          root = isPrep ? "prep" : isOutput ? "output" : "experimental";
        for (const label of labels) {
          const keys = strings(key);
          if (keys.length) {
            const defaults = isPrep
              ? ["-100", "100", "1"]
              : isOutput
                ? ["", "", "0.05"]
                : ["0.2", "2", "0.05"];
            for (const k of keys)
              add(
                n,
                label,
                "DynamicSlider",
                root + "." + k,
                text(minimum) || defaults[0],
                text(maximum) || defaults[1],
                text(step) || defaults[2],
                text(n),
                {},
              );
          } else if (file === "emulsion-controls.tsx" && text(key).includes("prefix")) {
            const suffix = text(key).match(/"(Scale|Cyan|Magenta|Yellow)"/)?.[1];
            if (suffix)
              for (const [tool, prefix] of [
                ["emulsion", "filmBase"],
                ["negative", "filmBase"],
                ["print", "printBase"],
              ])
                add(
                  n,
                  label,
                  "DynamicSlider",
                  "experimental." + prefix + suffix,
                  text(minimum) || "0.2",
                  text(maximum) || "2",
                  text(step) || "0.05",
                  text(n),
                  { tool },
                );
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
}
fs.mkdirSync("docs/ux", { recursive: true });
fs.writeFileSync("docs/ux/control-inventory.json", JSON.stringify(rows, null, 2) + "\n");
console.log(`${rows.length} resolved static and dynamic controls from ${base}`);
