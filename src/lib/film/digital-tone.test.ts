import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { applyDigitalTone, digitalToneNeeded } from "./digital-tone.ts";

function gray(v: number, n = 4) {
  return {
    r: new Float32Array(n).fill(v),
    g: new Float32Array(n).fill(v),
    b: new Float32Array(n).fill(v),
  };
}

describe("digital tone", () => {
  it("is a no-op at zeros", () => {
    const img = gray(0.18);
    const p = defaultParams();
    assert.equal(digitalToneNeeded(p), false);
    applyDigitalTone(img, p);
    assert.ok(Math.abs(img.r[0] - 0.18) < 1e-6);
    assert.ok(Math.abs(img.g[0] - 0.18) < 1e-6);
  });

  it("brightness lifts a mid gray", () => {
    const img = gray(0.18);
    const p = { ...defaultParams(), toneBrightness: 0.5 };
    assert.equal(digitalToneNeeded(p), true);
    applyDigitalTone(img, p);
    assert.ok(img.r[0] > 0.22);
  });
});
