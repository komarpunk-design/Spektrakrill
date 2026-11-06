import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actualPixelScale, clampViewerScale } from "./viewer-zoom.ts";

describe("true pixel zoom", () => {
  it("maps source pixels to physical screen pixels at multiple display densities", () => {
    for (const density of [1, 1.5, 2, 3]) {
      const scale = actualPixelScale(960, 320, density);
      assert.equal(320 * scale * density, 960);
    }
  });
  it("can shrink an image that is already upscaled by display density", () => {
    assert.equal(actualPixelScale(960, 960, 2), 0.5);
    assert.equal(clampViewerScale(0.5, 0.5), 0.5);
  });
  it("does not cap a large image below its actual pixel size", () => {
    assert.equal(clampViewerScale(20, 20), 20);
    assert.equal(clampViewerScale(0.2, 2), 1);
  });
  it("handles invalid measurements without NaN or infinity", () => {
    for (const size of [0, -1, NaN, Infinity]) assert.equal(actualPixelScale(960, size, 2), 1);
    assert.equal(clampViewerScale(NaN, 2), 1);
  });
});
