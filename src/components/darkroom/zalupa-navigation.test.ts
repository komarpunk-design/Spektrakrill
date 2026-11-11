import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultParams } from "../../lib/film/defaults.ts";
import {
  pageForTool,
  resetZPage,
  zPage,
  zChanges,
  zDeck,
  Z_DECKS,
  zPages,
} from "./zalupa-navigation.ts";
test("source-specific pages and same-tool parameters route to their visible controls", () => {
  for (const [tool, label, expected] of [
    ["camera", "EV", "exposure"],
    ["camera", "Тинт", "balance"],
    ["camera", "UV-срез", "lens"],
    ["camera", "Формат, мм", "format"],
    ["film", "Частица, µm²", "grain"],
    ["film", "Рассеяние", "halation"],
    ["film", "Межслойное", "emulsion-dir"],
    ["crop", "DX-полоса", "frame"],
    ["fotufilm", "Характер минилаба", "fotufilm-output"],
    ["fotufilm", "Толщина основы", "fotufilm-halation"],
    ["negs", "Насыщение донора R", "exp-dir"],
  ] as const)
    assert.equal(pageForTool(tool, label).id, expected);
  assert.equal(new Set(zPages.map((p) => p.id)).size, zPages.length);
  for (const d of Z_DECKS) assert.ok(d.pages.length > 0);
});
test("page reset preserves other pages of the same original tool and all other source models", () => {
  const p = defaultParams();
  p.exposureCompensationEv = 1.25;
  p.tint = 17;
  p.cameraDiffusion.strength = 1.5;
  p.filmStock = "kodak_gold_200";
  p.transport.model = "layered";
  p.transport.baseThickness = 2;
  const next = resetZPage(p, zPage("exposure"));
  assert.equal(next.exposureCompensationEv, defaultParams().exposureCompensationEv);
  assert.equal(next.tint, 17);
  assert.equal(next.cameraDiffusion.strength, 1.5);
  assert.equal(next.filmStock, "kodak_gold_200");
  assert.equal(next.transport.baseThickness, 2);
  assert.equal(p.exposureCompensationEv, 1.25);
  assert.equal(zChanges(next, zPage("exposure")), 0);
  assert.ok(zChanges(next, zPage("balance")) > 0);
});
test("Fotufilm and Experimental page resets retain the other imported stage", () => {
  const p = defaultParams();
  p.output.mode = "lab-scan";
  p.output.look = 0.55;
  p.transport.model = "layered";
  p.transport.baseThickness = 1.5;
  p.experimental.dirDonorRed = 1.7;
  p.experimental.grainRmsRed = 15;
  const out = resetZPage(p, zPage("fotufilm-output"));
  assert.deepEqual(out.output, defaultParams().output);
  assert.deepEqual(out.transport, p.transport);
  const grain = resetZPage(p, zPage("exp-grain"));
  assert.equal(grain.experimental.grainRmsRed, defaultParams().experimental.grainRmsRed);
  assert.equal(grain.experimental.dirDonorRed, 1.7);
  assert.deepEqual(grain.output, p.output);
});

test("one source owns every processing page; the film catalogue remains shared", () => {
  assert.deepEqual(
    Z_DECKS.map((d) => d.source),
    ["catalog", "spektrafilm", "experimental", "negs", "fotufilm"],
  );
  for (const [page, source] of [
    ["films", "catalog"],
    ["grain", "spektrafilm"],
    ["develop", "spektrafilm"],
    ["paper", "spektrafilm"],
    ["spectrum", "experimental"],
    ["exp-chemistry", "experimental"],
    ["exp-paper", "experimental"],
    ["exp-grain", "experimental"],
    ["exp-dir", "experimental"],
    ["negative", "experimental"],
    ["prep", "negs"],
    ["negs-format", "negs"],
    ["negs-profiles", "negs"],
    ["fotufilm-output", "fotufilm"],
    ["fotufilm-halation", "fotufilm"],
  ])
    assert.equal(zDeck(page)?.source, source);
  for (const [tool, label, id] of [
    ["development", "Химия плёнки по слоям", "exp-chemistry"],
    ["development", "Коэффициент проявки γ", "develop"],
    ["print", "Настройка основы бумаги", "exp-paper"],
    ["print", "Экспозиция", "paper"],
    ["texture", "Размытие зерна", "exp-grain"],
    ["texture", "Диффузия, µm", "exp-dir"],
  ])
    assert.equal(pageForTool(tool as any, label).id, id);
  assert.ok(!zPages.some((p) => p.id === "texture" || p.id === "edit"));
});
test("native page reset does not silently reset imported chemistry or bases", () => {
  const p = defaultParams();
  p.filmGamma = 1.5;
  p.experimental.filmChemistry = true;
  p.experimental.filmFast = 1.7;
  p.experimental.printBaseActive = true;
  p.experimental.printBaseCyan = 1.8;
  const native = resetZPage(p, zPage("develop"));
  assert.equal(native.filmGamma, 1);
  assert.equal(native.experimental.filmFast, 1.7);
  assert.equal(native.experimental.filmChemistry, true);
  const paper = resetZPage(p, zPage("paper"));
  assert.equal(paper.experimental.printBaseCyan, 1.8);
  assert.equal(paper.experimental.printBaseActive, true);
  const chemical = resetZPage(p, zPage("exp-chemistry"));
  assert.equal(chemical.experimental.filmFast, defaultParams().experimental.filmFast);
  assert.equal(chemical.experimental.printBaseCyan, 1.8);
});

test("legacy model notices open the actual owning page", () => {
  assert.equal(pageForTool("negs", undefined, "grain").id, "exp-grain");
  assert.equal(pageForTool("negs", undefined, "emulsion-dir").id, "exp-dir");
  assert.equal(pageForTool("fotufilm", undefined, "halation").id, "fotufilm-halation");
});
