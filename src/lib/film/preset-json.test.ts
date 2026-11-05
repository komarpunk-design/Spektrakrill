import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parsePresetJson, spektraToParams } from "./preset-json.ts";

describe("Spektrafilm GUI JSON (simulation.film_stock)", () => {
  it("switches film and paper from 07 C200 modern.json", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../../attachments/07 C200 modern.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    const looks = parsePresetJson(raw, "07 C200 modern.json");
    assert.equal(looks.length, 1);
    const look = looks[0]!;
    assert.equal(look.name, "07 C200 modern");
    assert.equal(look.params.filmStock, "fujifilm_c200");
    assert.equal(look.params.printPaper, "fujifilm_crystal_archive_typeii");
    assert.equal(look.params.exposureCompensationEv, 0.25);
    assert.equal(look.params.printYFilterShift, -2);
    assert.equal(look.params.printMFilterShift, -3);
    assert.equal(look.params.preflashExposure, 0.03);
    assert.equal(look.params.preflashYShift, -20);
    assert.equal(look.params.halationAmount, 1.4);
    assert.equal(look.params.couplersAmount, 0.8);
    assert.equal(look.params.whiteBalance, "daylight");
    assert.equal(look.params.filmFormatMm, 65);
    assert.equal(look.params.gray18Canvas, true);
    assert.equal(look.params.inputGamutCompress, "xy");
    assert.equal(look.params.outputGamutCompress, "oklch");
    assert.equal(look.params.grainActive, true);
    assert.equal(look.params.chemistryActive, true);
    assert.equal(look.params.filmGamma, 1);
    assert.equal(look.params.crop, false);
    assert.equal(look.params.applyCctfDecoding, true);
    assert.equal(look.params.previewMaxSize, 960);
  });

  it("keeps GitHub factory looks on filmProfile", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../../public/profiles/presets.json", import.meta.url), "utf8"),
    ) as { presets: { name: string; params: Record<string, unknown> }[] };
    const looks = parsePresetJson(raw);
    assert.ok(looks.length >= 8);
    const c200 = looks.find((l) => l.params.filmStock === "fujifilm_c200");
    assert.ok(c200, "factory pack still maps Fuji C200");
    assert.equal(spektraToParams(raw.presets[0]!.params).filmStock, "kodak_portra_160");
  });
});
