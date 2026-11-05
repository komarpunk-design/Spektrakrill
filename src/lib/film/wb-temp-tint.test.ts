import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linearRgbToXy,
  resolveWb,
  rgbToTempTint,
  rgbToWbSlider,
  sanitizeTint,
  tempTintFromXy,
  whiteBalanceMatrix,
  xyFromTempTint,
  xyToLinearRgb,
} from "./wb-temp-tint.ts";

describe("Robertson / DNG temp+tint", () => {
  it("2856 K tint 0 matches CIE Illuminant A", () => {
    const { x, y } = xyFromTempTint(2856, 0);
    assert.ok(Math.abs(x - 0.44757) < 0.002, `x=${x}`);
    assert.ok(Math.abs(y - 0.40745) < 0.002, `y=${y}`);
  });

  it("6504 K tint 0 is near D65 Planckian", () => {
    const { x, y } = xyFromTempTint(6504, 0);
    assert.ok(Math.abs(x - 0.3127) < 0.008, `x=${x}`);
    assert.ok(Math.abs(y - 0.329) < 0.012, `y=${y}`);
  });

  it("positive tint makes a gray pixel greener after CAT", () => {
    const gray: [number, number, number] = [0.18, 0.18, 0.18];
    const mul = (m: number[][], v: number[]) => [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
    const day = mul(whiteBalanceMatrix(5500, 0, "srgb"), gray);
    const green = mul(whiteBalanceMatrix(5500, 80, "srgb"), gray);
    const mag = mul(whiteBalanceMatrix(5500, -80, "srgb"), gray);
    const tung = mul(whiteBalanceMatrix(3200, 0, "srgb"), gray);
    const warm = mul(whiteBalanceMatrix(7500, 0, "srgb"), gray);
    assert.ok(green[1] > day[1], `green G ${green[1]} vs ${day[1]}`);
    assert.ok(mag[1] < day[1], `magenta G ${mag[1]} vs ${day[1]}`);
    assert.ok(tung[2] > tung[0], `tungsten should cool B=${tung[2]} R=${tung[0]}`);
    assert.ok(warm[0] > warm[2], `7500 should warm R=${warm[0]} B=${warm[2]}`);
    assert.ok(Math.abs(day[0] - gray[0]) < 1e-9, "5500 is identity");
  });

  it("as_shot skips CAT", () => {
    assert.equal(resolveWb({ whiteBalance: "as_shot", temperature: 3200, tint: 40 }).skip, true);
    assert.equal(resolveWb({ whiteBalance: "custom", temperature: 3200, tint: 40 }).skip, false);
    assert.deepEqual(resolveWb({ whiteBalance: "daylight" }), { skip: false, kelvin: 5500, tint: 0 });
    assert.deepEqual(resolveWb({ whiteBalance: "tungsten" }), { skip: false, kelvin: 3200, tint: 0 });
  });

  it("old 0.6–1.4 multiplier maps to DNG tint", () => {
    assert.equal(sanitizeTint(1), 0);
    assert.equal(sanitizeTint(1.4), 150);
    assert.equal(sanitizeTint(0.6), -150);
    assert.equal(sanitizeTint(40), 40);
    assert.equal(sanitizeTint(0), 0);
  });

  it("5500 K tint 0 is identity in both working spaces", () => {
    for (const space of ["srgb", "prophoto"] as const) {
      const m = whiteBalanceMatrix(5500, 0, space);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const expect = i === j ? 1 : 0;
          assert.ok(Math.abs(m[i][j] - expect) < 1e-9, `${space} [${i}][${j}]=${m[i][j]}`);
        }
      }
    }
  });

  it("tempTintFromXy round-trips xyFromTempTint", () => {
    const pairs: [number, number][] = [
      [2856, 0],
      [3200, 0],
      [3200, 40],
      [4000, -60],
      [5500, 0],
      [5500, 80],
      [6504, 0],
      [7500, -30],
    ];
    for (const [k, t] of pairs) {
      const xy = xyFromTempTint(k, t);
      const back = tempTintFromXy(xy.x, xy.y);
      assert.ok(Math.abs(back.kelvin - k) < 80, `${k}K → ${back.kelvin}K tint ${t}`);
      assert.ok(Math.abs(back.tint - t) < 8, `${k}K tint ${t} → ${back.tint}`);
    }
  });

  it("equal sRGB linear is D65, equal ProPhoto is D50", () => {
    const d65 = linearRgbToXy(0.18, 0.18, 0.18, "srgb");
    assert.ok(Math.abs(d65.x - 0.3127) < 0.002, `x=${d65.x}`);
    assert.ok(Math.abs(d65.y - 0.329) < 0.002, `y=${d65.y}`);
    const d50 = linearRgbToXy(0.18, 0.18, 0.18, "prophoto");
    assert.ok(Math.abs(d50.x - 0.3457) < 0.004, `x=${d50.x}`);
    assert.ok(Math.abs(d50.y - 0.3585) < 0.004, `y=${d50.y}`);
  });

  it("tungsten illuminant RGB maps near 3200 K", () => {
    const xy = xyFromTempTint(3200, 0);
    const rgb = xyToLinearRgb(xy.x, xy.y, "srgb");
    const est = rgbToTempTint(rgb[0], rgb[1], rgb[2], "srgb");
    assert.ok(Math.abs(est.kelvin - 3200) < 80, `k=${est.kelvin}`);
    assert.ok(Math.abs(est.tint) < 8, `tint=${est.tint}`);
  });

  it("equal RGB is the 5500 slider, and that slider neutralizes a 3200 K patch", () => {
    const mul = (m: number[][], v: number[]) => [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
    for (const space of ["srgb", "prophoto"] as const) {
      const neu = rgbToWbSlider(0.18, 0.18, 0.18, space);
      assert.ok(Math.abs(neu.kelvin - 5500) < 20, `${space} k=${neu.kelvin}`);
      assert.ok(Math.abs(neu.tint) < 1.5, `${space} tint=${neu.tint}`);
    }
    const xy = xyFromTempTint(3200, 0);
    const rgb = xyToLinearRgb(xy.x, xy.y, "srgb");
    const est = rgbToWbSlider(rgb[0], rgb[1], rgb[2], "srgb");
    assert.ok(est.kelvin < 5200, `slider should cool a warm patch, k=${est.kelvin}`);
    const out = mul(whiteBalanceMatrix(est.kelvin, est.tint, "srgb"), rgb);
    const mean = (out[0] + out[1] + out[2]) / 3;
    for (const c of out) assert.ok(Math.abs(c - mean) / mean < 0.04, `out ${out} mean ${mean}`);
  });
});
