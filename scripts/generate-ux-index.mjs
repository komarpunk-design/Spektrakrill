import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("docs/ux/control-inventory.json", "utf8"));
const defaults = [];
for (const r of rows) {
  if (!r.label || /[{}]/.test(r.label)) continue;
  let path = r.value.replace(/^params\./, "");
  if (r.file === "halation-controls.tsx") path = path.replace(/^p\./, "transport.");
  if (r.file === "output-controls.tsx") path = path.replace(/^p\./, "output.");
  if (!/^[a-zA-Z]\w*(\.\w+)*$/.test(path)) continue;
  defaults.push({ label: r.label, tool: r.tool, path, min: r.min, max: r.max, step: r.step });
}
fs.writeFileSync(
  "src/lib/film/control-index.json",
  JSON.stringify(
    {
      rows: rows
        .filter((r) => r.label && !/[{}]/.test(r.label))
        .map(({ label, tool, type, targetLabel }) => ({
          label,
          tool,
          type,
          targetLabel: targetLabel ?? label,
        })),
      defaults,
    },
    null,
    2,
  ) + "\n",
);
