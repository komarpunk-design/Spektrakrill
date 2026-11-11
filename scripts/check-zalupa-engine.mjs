import fs from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";
const base = "a17e3bd";
const changed = execFileSync(
  "git",
  ["diff", "--name-only", base, "--", "src/lib/film", "android/app/src/main", "public/profiles"],
  { encoding: "utf8" },
).trim();
assert.equal(changed, "", "UI-only port changed an engine, bridge or stock file");
const path = "src/components/darkroom/app.tsx",
  before = execFileSync("git", ["show", base + ":" + path], { encoding: "utf8" }),
  after = fs.readFileSync(path, "utf8");
const names = [
  "previewEdge",
  "safeFileStem",
  "imageDataToBlob",
  "loadUrl",
  "downloadBlob",
  "revoke",
  "simErrorMessage",
  "asNativeParams",
  "rememberShot",
  "addToStock",
  "openStock",
  "deleteStock",
  "clearDone",
  "exportStockAll",
  "takeNativeFrame",
  "nativeOpenParams",
  "seedRoll",
  "openFromFiles",
  "openFromPhone",
  "fillRoll",
  "browseRoll",
  "openNativeOrPicker",
  "onPickedFile",
  "openSample",
  "sourceLinear",
  "renderPrintTrials",
  "applyWb",
  "runAutoWb",
  "togglePickWb",
  "pickGray",
  "saveFrame",
  "cancelWork",
];
function contract(source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    result = {},
    printer = ts.createPrinter();
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && names.includes(n.name?.text))
      result[n.name.text] = printer.printNode(ts.EmitHint.Unspecified, n, tree);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && names.includes(n.name.text))
      result[n.name.text] = printer.printNode(ts.EmitHint.Unspecified, n.initializer, tree);
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(tree) === "useEffect" &&
      /simulateNative|previewSig|simulate\(/.test(n.getText(tree))
    )
      result[
        "render-effect-" + Object.keys(result).filter((k) => k.startsWith("render-effect-")).length
      ] = printer.printNode(ts.EmitHint.Unspecified, n, tree);
    ts.forEachChild(n, visit);
  };
  visit(tree);
  return result;
}
const a = contract(before),
  b = contract(after);
for (const n of names) assert.ok(a[n], n + " missing from baseline");
assert.deepEqual(b, a, "Import, rendering, white balance, batch or export callback changed");
console.log(
  `PASS native/browser engine, bridge and profile files unchanged; ${names.length} application callbacks and render effects retain their source contracts`,
);
