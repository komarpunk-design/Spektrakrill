import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultParams, sanitizeParams } from "./defaults.ts";
import { applyPrep, defaultPrep, guidedPrepBase, sanitizePrep } from "./negs-prep.ts";
import { stockParamsForFilm } from "./stock-look.ts";
import { spektraToParams } from "./preset-json.ts";
import { stockDetail } from "./stock-details.ts";
import type { FilmProfile } from "./types.ts";
const json = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
test("Negs inventory has all 31 missing materials; old profiles are retained", () => {
  const manifest = json("../../../docs/upstream/negs/manifest.json"),
    catalog = json("../../../public/profiles/catalog.json");
  assert.equal(new Set(manifest.profiles.map((p: { stock: string }) => p.stock)).size, 31);
  assert.equal(manifest.profiles.length, 41);
  for (const m of manifest.profiles) {
    const profile = json("../../../public/profiles/" + m.id + ".json") as FilmProfile;
    assert.ok(
      catalog.films.some((p: { id: string }) => p.id === m.id) ||
        catalog.papers.some((p: { id: string }) => p.id === m.id),
    );
    assert.ok(profile.densityModel);
    assert.ok(stockDetail(m.id));
    assert.ok(profile.license.includes("CC BY-SA"));
    assert.equal(
      profile.monochrome
        ? profile.densityLayers?.[0].length === 4 || profile.densityLayers?.[0].length === 3
        : true,
      true,
    );
  }
  assert.ok(catalog.films.some((p: { id: string }) => p.id === "kodak_portra_400"));
  assert.ok(catalog.films.some((p: { id: string }) => p.id === "exp_kodak_portra_400"));
  const approximate = catalog.films.find((p: { id: string }) => p.id === "negs_harman_phoenix_200");
  assert.equal(approximate.approximate, true);
  assert.equal(
    catalog.films.find((p: { id: string }) => p.id === "negs_fotufilm_infrared_color").creative,
    true,
  );
  assert.equal(
    catalog.films.find((p: { id: string }) => p.id === "negs_ilford_hp5_plus_9p5min")
      .estimatedDevelopment,
    true,
  );
});
test("Negs selection applies its own grain and couplers, retaining photo-specific edits", () => {
  const p = defaultParams();
  p.prep.shadows = 30;
  p.filmGamma = 1.2;
  p.exposureCompensationEv = -1;
  const next = stockParamsForFilm("negs_cinestill_800t", p);
  assert.equal(next.experimental.grainRms, true);
  assert.equal(next.experimental.grainRmsRed, 9);
  assert.equal(next.experimental.grainRmsBlue, 30);
  assert.equal(next.experimental.grainUniformityRed, 0.93);
  assert.equal(next.experimental.grainScaleMid, 0.3);
  assert.equal(next.experimental.dirLangmuir, true);
  assert.equal(next.filmGamma, 1.2);
  assert.equal(next.exposureCompensationEv, -1);
  assert.deepEqual(next.prep, p.prep);
  assert.equal(next.printPaper, p.printPaper);
  assert.equal(p.experimental.grainRms, false);
  const bw = stockParamsForFilm("negs_ilford_delta_3200_9min", p);
  assert.equal(bw.experimental.grainRmsRed, 19);
  assert.equal(bw.experimental.grainFloorRed, 0.01);
  assert.equal(bw.gammaRtoGB[0], 0);
});
test("Prep is bounded and old sessions remain neutral; snake_case preset import", () => {
  const neutral = defaultPrep();
  assert.deepEqual(sanitizePrep(null), neutral);
  assert.deepEqual(sanitizeParams({ filmStock: "kodak_portra_400" }).prep, neutral);
  const p = sanitizePrep({
    exposure: Infinity,
    shadows: -200,
    highlights: -200,
    gain: 101,
    colorBoost: NaN,
  });
  assert.equal(p.exposure, 0);
  assert.equal(p.shadows, -100);
  assert.equal(p.highlights, -180);
  assert.equal(p.gain, 100);
  assert.equal(p.colorBoost, 0);
  const imported = spektraToParams({
    prep: { exposure_ev: 0.5, color_boost: 20, midtone_detail: -10 },
  });
  assert.equal(imported.prep.exposure, 0.5);
  assert.equal(imported.prep.colorBoost, 20);
  assert.equal(imported.prep.detail, -10);
});
test("Prep neutral is bitwise exact, exposure-only avoids colour/guided roundtrips", () => {
  const values = new Float32Array([-0, -0.25, 100, 0.18, 0, 9]);
  const image = { w: 3, h: 2, r: values.slice(), g: values.slice(), b: values.slice() };
  applyPrep(image, defaultPrep());
  assert.deepEqual(new Uint8Array(image.r.buffer), new Uint8Array(values.buffer));
  applyPrep(image, { ...defaultPrep(), exposure: 1 });
  assert.deepEqual(
    image.r,
    Float32Array.from(values, (x) => x * 2),
  );
});
test("guided base preserves signed/HDR constants and strong edges", () => {
  for (const v of [-2, 0, 0.18, 1, 8]) {
    const input = new Float32Array(23 * 17).fill(v),
      out = guidedPrepBase(input, 23, 17);
    assert.ok(out.every((x) => Math.abs(x - v) < 2e-6));
  }
  const w = 23,
    h = 17,
    input = Float32Array.from({ length: w * h }, (_, i) => (i % w < 11 ? 0.1 : 0.8)),
    out = guidedPrepBase(input, w, h);
  assert.ok(out[8 * w + 11] - out[8 * w + 10] > 0.6);
});
test("Prep controls change actual linear pixels and stay finite for signed HDR", () => {
  const values = Float32Array.from({ length: 64 }, (_, i) => -0.03 + (1.6 * i) / 63),
    image = {
      w: 8,
      h: 8,
      r: values.slice(),
      g: values.slice(),
      b: Float32Array.from(values, (v) => v * 0.7),
    };
  applyPrep(image, {
    ...defaultPrep(),
    shadows: 30,
    highlights: -90,
    detail: 40,
    colorBoost: 25,
    lift: 5,
  });
  assert.notDeepEqual(image.r, values);
  assert.ok(image.r.every(Number.isFinite));
  assert.ok(image.b.every(Number.isFinite));
});

test("Negs preset stock ids and real development time resolve to our namespaced profiles", () => {
  const imported = spektraToParams({
    film_profile: "ilford_hp5_plus",
    print_profile: "ilford_mgrc_deluxe_grade2",
    film_render: { chemistry: { development_time: 6.5 }, grain: { active: true } },
    prep: { color_boost: 12 },
  });
  assert.equal(imported.filmStock, "negs_ilford_hp5_plus_6p5min");
  assert.equal(imported.printPaper, "negs_ilford_mgrc_deluxe_grade2_1min");
  assert.equal(imported.experimental.grainRms, true);
  assert.equal(imported.prep.colorBoost, 12);
  const explicit = spektraToParams({
    film_profile: "cinestill_800t",
    film_render: { grain: { rms_granularity: [2, 3, 4] } },
  });
  assert.equal(explicit.filmStock, "negs_cinestill_800t");
  assert.equal(explicit.experimental.grainRmsBlue, 4);
});
