import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { isFilmBypass, isPaperBypass } from "./types.ts";

describe("film bypass", () => {
  it("treats empty/none as no film", () => {
    assert.equal(isFilmBypass("none"), true);
    assert.equal(isFilmBypass(""), true);
    assert.equal(isFilmBypass("off"), true);
    assert.equal(isFilmBypass("kodak_portra_400"), false);
    assert.equal(isFilmBypass("kodak_portra_160"), false);
  });

  it("opens a new frame without a stock", () => {
    assert.equal(defaultParams().filmStock, "none");
  });
});

describe("paper bypass", () => {
  it("treats none/off as no paper", () => {
    assert.equal(isPaperBypass("none"), true);
    assert.equal(isPaperBypass(""), true);
    assert.equal(isPaperBypass("off"), true);
    assert.equal(isPaperBypass("kodak_portra_endura"), false);
    assert.equal(isPaperBypass("kodak_2383"), false);
  });

  it("does not steal the default Endura look", () => {
    assert.equal(isPaperBypass(defaultParams().printPaper), false);
  });
});
