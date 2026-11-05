import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { applyEngineSlot, snapshotEngine } from "./engine-slots.ts";

describe("engine-slots", () => {
  it("restores film stock after a digital engine detour", () => {
    const start = { ...defaultParams(), filmStock: "kodak_portra_400", filmGamma: 0.9 };
    const spektra = snapshotEngine(start, "film");
    const digital = applyEngineSlot(start, "hasselblad", undefined);
    assert.equal(digital.params.rawEngine, "hasselblad");
    assert.equal(digital.params.filmStock, "none");
    assert.equal(digital.tool, "tone");

    const back = applyEngineSlot(digital.params, "spektrafilm", spektra);
    assert.equal(back.params.rawEngine, "spektrafilm");
    assert.equal(back.params.filmStock, "kodak_portra_400");
    assert.equal(back.params.filmGamma, 0.9);
  });

  it("keeps digital tone on the hasselblad slot", () => {
    const start = { ...defaultParams(), filmStock: "none", rawEngine: "hasselblad" as const };
    const graded = {
      ...start,
      toneBrightness: 0.4,
      toneContrast: -0.2,
    };
    const slot = snapshotEngine(graded, "tone");
    const viaFilm = applyEngineSlot(graded, "spektrafilm", undefined);
    assert.equal(viaFilm.params.rawEngine, "spektrafilm");
    const back = applyEngineSlot(viaFilm.params, "hasselblad", slot);
    assert.equal(back.params.rawEngine, "hasselblad");
    assert.equal(back.params.filmStock, "none");
    assert.equal(back.params.toneBrightness, 0.4);
    assert.equal(back.params.toneContrast, -0.2);
  });
});
