import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultParams } from "../../lib/film/defaults.ts";
import { pageForTool, resetZPage, zPage, zChanges, Z_DECKS, zPages } from "./zalupa-navigation.ts";
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
    ["negs", "Насыщение донора R", "negs-dir"],
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
test("Fotufilm and Negs page resets retain the other imported stage", () => {
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
  const grain = resetZPage(p, zPage("negs-grain"));
  assert.equal(grain.experimental.grainRmsRed, defaultParams().experimental.grainRmsRed);
  assert.equal(grain.experimental.dirDonorRed, 1.7);
  assert.deepEqual(grain.output, p.output);
});
