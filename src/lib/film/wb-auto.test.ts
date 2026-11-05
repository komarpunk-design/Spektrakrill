import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateAutoWb, sampleGrayPatch } from "./wb-auto.ts";
import type { PlanarImage } from "./pipeline.ts";
import { whiteBalanceMatrix, xyFromTempTint, xyToLinearRgb } from "./wb-temp-tint.ts";

function fill(w: number, h: number, rgb: [number, number, number]): PlanarImage {
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  r.fill(rgb[0]);
  g.fill(rgb[1]);
  b.fill(rgb[2]);
  return { w, h, r, g, b };
}

function illum(kelvin: number, tint = 0): [number, number, number] {
  const xy = xyFromTempTint(kelvin, tint);
  return xyToLinearRgb(xy.x, xy.y, "srgb");
}

const SRGB_TO_PP = [
  0.5290825, 0.3303437, 0.1405738, 0.098264, 0.8734031, 0.0283329, 0.0167029, 0.1176946, 0.8656026,
];

function toPp(v: [number, number, number]): [number, number, number] {
  const m = SRGB_TO_PP;
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function mul3(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function assertNeutralized(out: [number, number, number], label: string) {
  const mean = (out[0] + out[1] + out[2]) / 3;
  assert.ok(mean > 1e-4, label);
  for (const c of out) {
    assert.ok(Math.abs(c - mean) / mean < 0.08, `${label} ${out.join(",")} mean ${mean}`);
  }
}

function skyGrassWarmCard(): PlanarImage {
  const w = 96;
  const h = 64;
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const card = x > w * 0.35 && x < w * 0.65 && y > h * 0.35 && y < h * 0.7;
      const sky = y < h * 0.55;
      const c = card ? [0.2, 0.185, 0.155] : sky ? [0.42, 0.58, 0.95] : [0.22, 0.48, 0.12];
      r[i] = c[0];
      g[i] = c[1];
      b[i] = c[2];
    }
  }
  return { w, h, r, g, b };
}

describe("auto white balance", () => {
  it("uniform gray stays at 5500 and does not shift", () => {
    const rgb: [number, number, number] = [0.18, 0.18, 0.18];
    const est = estimateAutoWb(fill(48, 48, rgb));
    assert.equal(est.method, "neutral");
    assert.ok(Math.abs(est.temperature - 5500) < 20, `T=${est.temperature}`);
    assert.ok(Math.abs(est.tint) < 2, `tint=${est.tint}`);
    const out = mul3(whiteBalanceMatrix(est.temperature, est.tint, "srgb"), rgb);
    assert.ok(Math.abs(out[0] - rgb[0]) < 1e-6);
    assert.ok(Math.abs(out[2] - rgb[2]) < 1e-6);
  });

  it("uniform tungsten is neutralized below 5500, not reported as absolute CCT", () => {
    const rgb = illum(3200);
    const est = estimateAutoWb(fill(48, 48, rgb));
    assert.ok(est.temperature < 5200, `T=${est.temperature} tint=${est.tint}`);
    assert.ok(est.temperature > 2200, `T=${est.temperature}`);
    const out = mul3(whiteBalanceMatrix(est.temperature, est.tint, "srgb"), rgb);
    assertNeutralized(out, "tungsten");
  });

  it("green cast is neutralized", () => {
    const rgb = illum(5500, 70);
    const est = estimateAutoWb(fill(48, 48, rgb));
    assert.ok(est.temperature > 2500 && est.temperature < 9000, `T=${est.temperature} tint=${est.tint}`);
    const out = mul3(whiteBalanceMatrix(est.temperature, est.tint, "srgb"), rgb);
    assertNeutralized(out, "green");
    const plain = mul3(whiteBalanceMatrix(5500, 0, "srgb"), rgb);
    assert.ok(Math.abs(out[1] - (out[0] + out[2]) / 2) < Math.abs(plain[1] - (plain[0] + plain[2]) / 2));
  });

  it("sky and grass do not peg the slider at 12000", () => {
    const est = estimateAutoWb(skyGrassWarmCard());
    assert.ok(est.temperature < 9000, `T=${est.temperature} tint=${est.tint} ${est.method}`);
    assert.ok(est.temperature > 2800, `T=${est.temperature}`);
    assert.ok(Math.abs(est.tint) < 40, `tint=${est.tint}`);
    assert.notEqual(est.temperature, 12000);
  });

  it("prophoto space: equal sRGB is 5500, tungsten sRGB is neutralized in ProPhoto", () => {
    const gray: [number, number, number] = [0.18, 0.18, 0.18];
    const neu = estimateAutoWb(fill(32, 32, gray), "prophoto");
    assert.ok(Math.abs(neu.temperature - 5500) < 20, `T=${neu.temperature} tint=${neu.tint}`);
    assert.ok(Math.abs(neu.tint) < 2, `tint=${neu.tint}`);
    const id = mul3(whiteBalanceMatrix(neu.temperature, neu.tint, "prophoto"), gray);
    assert.ok(Math.abs(id[0] - gray[0]) < 1e-4);

    const rgb = illum(3200);
    const est = estimateAutoWb(fill(48, 48, rgb), "prophoto");
    assert.ok(est.temperature < 5300, `T=${est.temperature}`);
    const out = mul3(whiteBalanceMatrix(est.temperature, est.tint, "prophoto"), toPp(rgb));
    assertNeutralized(out, "pp tungsten");
  });

  it("eyedropper on a tungsten patch neutralizes it", () => {
    const rgb = illum(3200, 0);
    const est = sampleGrayPatch(fill(40, 40, rgb), 0.5, 0.5);
    assert.ok(est, "sample");
    assert.equal(est!.method, "spot");
    assert.ok(est!.temperature < 5200, `T=${est!.temperature}`);
    const out = mul3(whiteBalanceMatrix(est!.temperature, est!.tint, "srgb"), rgb);
    assertNeutralized(out, "spot");
  });

  it("spot rejects a black patch", () => {
    const img = fill(24, 24, [0, 0, 0]);
    assert.equal(sampleGrayPatch(img, 0.5, 0.5), null);
  });
});
