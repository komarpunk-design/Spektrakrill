import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { developmentCurve, developmentMode, exposureIndexRatio } from "./development.ts";
import { defaultParams, sanitizeParams } from "./defaults.ts";
import { clearNegCache, simulate, type PlanarImage } from "./pipeline.ts";
import type { FilmProfile } from "./types.ts";
const profile = (id: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../public/profiles/${id}.json`, import.meta.url), "utf8"),
  ) as FilmProfile;

test("EI is an exposure choice, with the opposite sign to camera EV", () => {
  assert.equal(exposureIndexRatio(-1), 2);
  assert.equal(exposureIndexRatio(1), 0.5);
  assert.equal(exposureIndexRatio(0), 1);
  assert.equal(developmentMode(0.8), "Pull");
  assert.equal(developmentMode(1), "Норма");
  assert.equal(developmentMode(1.2), "Push");
});
test("density follows the upstream log-exposure-axis transform, not display gamma", () => {
  const film = {
    ...profile("kodak_portra_400"),
    logExposure: { min: -2, max: 2, n: 3 },
    densityCurves: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ],
  } as FilmProfile;
  const at = (gamma: number, ev: number, x: number) =>
    developmentCurve(film, gamma, ev, 0).find((point) => point[0] === x)![1];
  assert.equal(at(1, 0, 1), 1.5);
  assert.equal(at(0.5, 0, 1), 1.25);
  assert.equal(at(2, 0, 1), 2);
  assert.ok(Math.abs(at(1, 1, 0) - (1 + Math.log10(2) / 2)) < 1e-7);
  assert.equal(at(2, 0, 0), 1); // gamma scales characteristic axis around log H = 0.
});
test("both directions reach the film engine without swapping film profiles", () => {
  const film = profile("kodak_portra_400"),
    paper = profile("kodak_portra_endura");
  const data = Float32Array.from({ length: 64 }, (_, i) => 0.015 + (1.1 * i) / 63);
  const source: PlanarImage = { w: 8, h: 8, r: data, g: data.slice(), b: data.slice() };
  const base = {
    ...defaultParams(),
    filmStock: film.id,
    printPaper: paper.id,
    scanFilm: true,
    grainActive: false,
    halationActive: false,
    couplersActive: false,
    autoExposure: false,
    scanWhiteCorrection: false,
    scanBlackCorrection: false,
  };
  const render = (gamma: number, ev: number) => {
    clearNegCache();
    const image = simulate(source, film, paper, {
      ...base,
      filmGamma: gamma,
      exposureCompensationEv: ev,
    });
    return [...image.r, ...image.g, ...image.b];
  };
  const normal = render(1, 0),
    pull = render(0.8, 1),
    push = render(1.2, -1);
  assert.ok([...normal, ...pull, ...push].every(Number.isFinite));
  assert.ok(normal.some((v, i) => Math.abs(v - pull[i]) > 1e-4));
  assert.ok(normal.some((v, i) => Math.abs(v - push[i]) > 1e-4));
  assert.equal(base.filmStock, film.id);
  assert.equal(base.filmGamma, 1);
  assert.equal(base.exposureCompensationEv, 0);
});
test("invalid imported processing values cannot poison the density calculation", () => {
  for (const filmGamma of [0, -1, NaN, Infinity])
    assert.equal(sanitizeParams({ filmGamma }).filmGamma, 1);
  assert.equal(sanitizeParams({ exposureCompensationEv: NaN }).exposureCompensationEv, 0);
  assert.equal(sanitizeParams({ filmGamma: 1.7, exposureCompensationEv: -1 }).filmGamma, 1.7);
});
