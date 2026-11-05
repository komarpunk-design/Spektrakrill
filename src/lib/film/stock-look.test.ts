import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { stockParamsForFilm } from "./stock-look.ts";

describe("stock look for a cassette", () => {
  it("keeps sliders when switching Portra — no Volpato factory dump", () => {
    const current = {
      ...defaultParams(),
      filmStock: "none",
      filmGamma: 0.7,
      grainBlur: 0.2,
      printPaper: "kodak_endura_premier",
      printYFilterShift: 8,
      exposureCompensationEv: -0.5,
      crop: true,
      cropCenterX: 0.4,
    };
    const next = stockParamsForFilm("kodak_portra_400", current);
    assert.equal(next.filmStock, "kodak_portra_400");
    assert.equal(next.filmGamma, 0.7);
    assert.equal(next.grainBlur, 0.2);
    assert.equal(next.printPaper, "kodak_endura_premier");
    assert.equal(next.printYFilterShift, 8);
    assert.equal(next.exposureCompensationEv, -0.5);
    assert.equal(next.crop, true);
    assert.equal(next.cropCenterX, 0.4);
  });

  it("switching stock does not reset the previous film's gamma", () => {
    const portra = stockParamsForFilm("kodak_portra_400", {
      ...defaultParams(),
      filmGamma: 0.55,
      grainBlur: 1.2,
    });
    const velvia = stockParamsForFilm("fujifilm_velvia_100", portra);
    assert.equal(velvia.filmStock, "fujifilm_velvia_100");
    assert.equal(velvia.filmGamma, 0.55);
    assert.equal(velvia.grainBlur, 1.2);
  });

  it("none is a bypass, sliders stay", () => {
    const current = {
      ...defaultParams(),
      filmStock: "kodak_portra_400",
      filmGamma: 0.96,
      scanFilm: true,
    };
    const next = stockParamsForFilm("none", current);
    assert.equal(next.filmStock, "none");
    assert.equal(next.filmGamma, 0.96);
    assert.equal(next.scanFilm, true);
  });
});
