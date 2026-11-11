import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTransport,
  sanitizeTransport,
  construction,
  adjusted,
  solve,
  fresnel,
  adjustedReturn,
  applyLayeredTransport,
  type OpticalModel,
} from "./layered-transport.ts";
import { parsePresetJson, serializeLook } from "./preset-json.ts";
import { defaultParams } from "./defaults.ts";
const mirror: OpticalModel = {
  layers: [{ id: "support", depth: 0.02, n: 1, absorption: 0 }],
  source: 0.005,
  q: 1,
  capture: 1,
  ratio: 0.05,
  core: 0,
  nFront: 1,
  nRear: 1,
  rear: 1,
  plate: -1,
};
describe("ported Fotufilm Layered Transport", () => {
  it("matches upstream analytic mirror encircled energy and power accounting", () => {
    const r = solve(mirror, 4096);
    assert.ok(Math.abs(r.captured - 1) < 1e-12);
    assert.ok(
      Math.abs(1 - r.captured - r.unreturned - r.absorbed - r.escaped - r.unresolved) < 1e-12,
    );
    for (const radius of [0.01, 0.03, 0.09, 0.3]) {
      const energy = r.nodes.filter((n) => n[0] <= radius).reduce((s, n) => s + n[1], 0);
      assert.ok(Math.abs(energy - (radius * radius) / (radius * radius + 0.03 * 0.03)) < 0.0003);
    }
  });
  it("matches upstream black backing, index matching, Fresnel and total reflection cases", () => {
    const black = solve({ ...mirror, rear: 0 });
    assert.equal(black.nodes.length, 0);
    assert.ok(Math.abs(black.absorbed - 1) < 1e-12);
    const matched = solve({ ...mirror, rear: -1 });
    assert.ok(Math.abs(matched.escaped - 1) < 1e-12);
    for (const value of fresnel(1.5, 1, 0)) assert.ok(Math.abs(value - 0.04) < 1e-12);
    assert.deepEqual(fresnel(1.5, 1, 1.2), [1, 1]);
  });
  it("original inferred construction responds to thickness, absorber and plate", () => {
    const original = construction("kodak_portra_400", 0, [0.1, 0.01, 0.001]),
      base = solve(original),
      bare = solve(adjusted(original, { ...defaultTransport(), antiHalation: 0 })),
      thick = solve(adjusted(original, { ...defaultTransport(), baseThickness: 2 })),
      plate = solve(adjusted(original, { ...defaultTransport(), pressurePlate: 0.8 }));
    const mean = (r: ReturnType<typeof solve>) => r.nodes.reduce((sum, n) => sum + n[0] * n[1], 0);
    assert.ok(bare.captured > base.captured);
    assert.ok(mean(thick) > mean(base));
    assert.ok(plate.captured > base.captured);
    assert.ok(
      Math.abs(adjustedReturn(original.ratio, base.captured, base.captured, bare.captured, 1) - 1) <
        1e-12,
    );
  });
  it("preserves flat fields under positive stencil convolution and adds return light", () => {
    const value = 0.18,
      n = 13 * 9,
      image = {
        w: 13,
        h: 9,
        r: new Float32Array(n).fill(value),
        g: new Float32Array(n).fill(value),
        b: new Float32Array(n).fill(value),
      };
    applyLayeredTransport(
      image,
      "negs_cinestill_800t",
      { ...defaultTransport(), model: "layered" },
      [0.1, 0.01, 0.001],
      40,
      1,
      1,
    );
    for (const plane of [image.r, image.g, image.b]) {
      assert.ok(plane[0] >= value - 1e-6);
      for (const v of plane) assert.ok(Math.abs(v - plane[0]) < 1e-6);
    }
  });
  it("sanitizes old recipes and roundtrips optical controls", () => {
    assert.equal(sanitizeTransport(null).model, "legacy");
    const p = defaultParams();
    p.transport = {
      ...defaultTransport(),
      model: "layered",
      antiHalation: 0,
      baseThickness: 2,
      pressurePlate: 0.7,
      hazeUm: 40,
    };
    assert.deepEqual(
      parsePresetJson(JSON.parse(serializeLook("Transport", p)))[0].params.transport,
      p.transport,
    );
    assert.equal(sanitizeTransport({ hazeUm: Infinity, baseThickness: 90 }).baseThickness, 3);
  });
});
