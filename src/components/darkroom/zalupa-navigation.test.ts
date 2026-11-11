import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultParams } from "../../lib/film/defaults.ts";
import {
  Z_DECKS,
  Z_SERVICE,
  Z_PAGE_KEYS,
  zPages,
  zPage,
  zDeck,
  pageForTool,
  zChanges,
  resetZPage,
  zBypassReason,
} from "./zalupa-navigation.ts";
import index from "../../lib/film/control-index.json" with { type: "json" };

test("seven freely navigable photographic stages and one catalogue replace donor navigation", () => {
  assert.deepEqual(
    Z_DECKS.map((d) => d.title),
    ["Камера", "Плёнка", "Проявка", "Эффекты", "Печать", "Скан", "Финиш"],
  );
  assert.equal(new Set(zPages.map((p) => p.id)).size, zPages.length);
  assert.equal(Z_DECKS.flatMap((d) => [...d.pages]).filter((p) => p.id === "films").length, 1);
  assert.ok(!Z_SERVICE.some((p) => p.id === "lab" || p.id === "export"));
  for (const p of zPages)
    assert.ok(Z_PAGE_KEYS[p.id] || ["gallery", "presets", "stock", "log"].includes(p.id), p.id);
});
test("old functions and all calculation controls resolve to functional pages", () => {
  for (const [tool, label, id] of [
    ["camera", "EV", "exposure"],
    ["camera", "Тинт", "balance"],
    ["camera", "UV-срез", "lens"],
    ["camera", "Формат, мм", "format"],
    ["film", "Частица, µm²", "grain"],
    ["film", "Рассеяние", "halation"],
    ["film", "Межслойное", "dir"],
    ["negs", "Насыщение донора R", "dir"],
    ["negs", "RMS красного канала", "grain"],
    ["negs", "DIR-каплеры", "dir"],
    ["fotufilm", "Толщина основы", "halation"],
    ["fotufilm", "Характер минилаба", "output"],
    ["lab", "Входной гамут", "input-color"],
    ["lab", "Декод CCTF", "input-color"],
    ["lab", "LUT превью", "settings"],
    ["lab", "RGB → спектр", "spectrum"],
    ["lab", "Спектр. размытие", "spectrum"],
    ["lab", "Выходной гамут", "output-color"],
    ["lab", "Апскейл", "output-color"],
    ["emulsion", "Фильтр перед объективом", "taking-filter"],
    ["emulsion", "Циан основы", "film-base"],
    ["development", "Химия плёнки по слоям", "chemistry"],
    ["print", "Циан основы", "paper-base"],
    ["crop", "DX-полоса", "frame"],
  ] as const)
    assert.equal(pageForTool(tool, label).id, id, tool + ": " + label);
  for (const row of index.rows)
    assert.ok(
      zPages.some((p) => p.id === pageForTool(row.tool as any, row.label).id),
      row.label,
    );
});
test("grain reset covers both alternatives without changing neighbouring effects or output", () => {
  const p = defaultParams();
  p.grainParticleArea = 0.8;
  p.experimental.grainRms = true;
  p.experimental.grainRmsRed = 22;
  p.transport.model = "layered";
  p.transport.baseThickness = 2;
  p.experimental.dirDonorRed = 3;
  p.output.mode = "lab-scan";
  const result = resetZPage(p, zPage("grain"));
  for (const key of ["grainParticleArea", "grainActive", "grainBlur"] as const)
    assert.deepEqual(result[key], defaultParams()[key]);
  assert.equal(result.experimental.grainRmsRed, defaultParams().experimental.grainRmsRed);
  assert.deepEqual(result.transport, p.transport);
  assert.deepEqual(result.output, p.output);
  assert.equal(result.experimental.dirDonorRed, 3);
  assert.equal(p.experimental.grainRmsRed, 22);
  assert.equal(zChanges(result, zPage("grain")), 0);
});
test("DIR and halation reset all their alternatives independently", () => {
  const p = defaultParams();
  p.experimental.dirLangmuir = true;
  p.experimental.dirTailUm = 700;
  p.couplersAmount = 2;
  p.transport.model = "layered";
  p.transport.hazeUm = 80;
  p.scatterAmount = 1;
  p.tint = 9;
  const d = resetZPage(p, zPage("dir"));
  assert.deepEqual(d.transport, p.transport);
  assert.equal(d.experimental.dirTailUm, defaultParams().experimental.dirTailUm);
  const h = resetZPage(p, zPage("halation"));
  assert.deepEqual(h.transport, defaultParams().transport);
  assert.equal(h.scatterAmount, defaultParams().scatterAmount);
  assert.equal(h.experimental.dirTailUm, 700);
  assert.equal(h.tint, 9);
});
test("shared exposure/gamma/format keep one state; resets isolate chemistry and paper base", () => {
  const p = defaultParams();
  p.filmGamma = 1.5;
  p.experimental.filmFast = 1.8;
  p.experimental.printBaseCyan = 1.4;
  p.tint = 12;
  assert.ok(Z_PAGE_KEYS.develop.includes("filmGamma"));
  assert.ok(Z_PAGE_KEYS.chemistry.includes("filmGamma"));
  const d = resetZPage(p, zPage("develop"));
  assert.equal(d.experimental.filmFast, 1.8);
  const paper = resetZPage(p, zPage("paper"));
  assert.equal(paper.experimental.printBaseCyan, 1.4);
  const spectrum = resetZPage(p, zPage("spectrum"));
  assert.equal(spectrum.tint, 12);
});
test("negative route and digital output explicitly report bypasses without clearing values", () => {
  const p = defaultParams();
  p.filmStock = "kodak_gold_200";
  p.experimental.workflow = "negative-print";
  p.output.mode = "lab-scan";
  for (const id of ["grain", "halation", "dir", "prep", "develop"])
    assert.ok(zBypassReason(p, id), id);
  for (const id of ["paper", "paper-base", "test-print"])
    assert.equal(
      zBypassReason(p, id),
      null,
      id + " still participates in negative-print regardless of saved digital output",
    );
  p.experimental.workflow = "negative-scan";
  for (const id of ["paper", "paper-base", "test-print"]) assert.ok(zBypassReason(p, id), id);
  assert.equal(zBypassReason(p, "chemistry"), null);
  assert.equal(zBypassReason(p, "balance"), null);
  assert.equal(zBypassReason(p, "negative"), null);
  assert.equal(zBypassReason(p, "frame"), null);
  const before = structuredClone(p);
  for (const page of zPages) zBypassReason(p, page.id);
  assert.deepEqual(p, before);
  assert.equal(zDeck("negative")?.id, "scan");
  assert.equal(zDeck("output")?.id, "print");
});
