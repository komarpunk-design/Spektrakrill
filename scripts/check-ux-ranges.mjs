import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import assert from "node:assert/strict";
const files = fs.readdirSync("src/components/darkroom").filter((f) => f.endsWith(".tsx"));
let count = 0;
const keys = {
  SliderRow: ["label", "min", "max", "step", "value", "onChange"],
  ToggleRow: ["label", "checked", "onChange"],
  Field: ["label"],
  Select: ["options", "value", "onChange", "ariaLabel"],
};
function read(text) {
  const tree = ts.createSourceFile(
      "page.tsx",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    rows = [];
  const visit = (n) => {
    if (
      (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
      keys[n.tagName.getText(tree)]
    ) {
      const kind = n.tagName.getText(tree);
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      // Global advanced mode is deliberately removed: every processing control stays available.
      if (
        !attrs.some(
          (a) =>
            a.name.getText(tree) === "label" &&
            a.initializer?.getText(tree) === '"Точные ползунки"',
        )
      ) {
        rows.push(
          JSON.stringify([
            kind,
            attrs
              .filter((a) => keys[kind].includes(a.name.getText(tree)))
              .map((a) => [a.name.getText(tree), a.initializer?.getText(tree)]),
          ]),
        );
      }
    }
    if (ts.isCallExpression(n) && ["slider", "row"].includes(n.expression.getText(tree))) {
      rows.push(JSON.stringify(["dynamic", n.getText(tree)]));
    }
    ts.forEachChild(n, visit);
  };
  visit(tree);
  return rows.sort();
}
for (const f of files) {
  let old;
  try {
    old = execFileSync("git", ["show", "4821309:src/components/darkroom/" + f], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    continue;
  }
  const before = read(old),
    after = read(fs.readFileSync("src/components/darkroom/" + f, "utf8"));
  assert.deepEqual(
    after,
    before,
    f + " changed a control, range, precision, option or engine binding",
  );
  count += before.length;
}
console.log(
  `PASS ${count} existing control definitions retain labels, bounds, precision, choices, values and engine callbacks`,
);
