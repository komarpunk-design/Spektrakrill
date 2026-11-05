import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRawEngine,
  sanitizeRawEngine,
  sanitizeRawEngineStyle,
  stylesFor,
  type RgbPlanes,
} from "./raw-engine.ts";

function planes(rgb: [number, number, number], n = 4): RgbPlanes {
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  r.fill(rgb[0]);
  g.fill(rgb[1]);
  b.fill(rgb[2]);
  return { r, g, b };
}

function chroma(p: RgbPlanes, i = 0): number {
  const R = p.r[i];
  const G = p.g[i];
  const B = p.b[i];
  const Cg = -0.25 * R + 0.5 * G - 0.25 * B;
  const Co = 0.5 * R - 0.5 * B;
  return Math.hypot(Cg, Co);
}

describe("raw-engine", () => {
  it("defaults unknown names to spektrafilm", () => {
    assert.equal(sanitizeRawEngine(undefined), "spektrafilm");
    assert.equal(sanitizeRawEngine("Hncs"), "hasselblad");
    assert.equal(sanitizeRawEngine("panasonic"), "lumix");
  });

  it("snaps styles to the engine", () => {
    assert.deepEqual(stylesFor("spektrafilm"), []);
    assert.equal(sanitizeRawEngineStyle("hasselblad", "vivid"), "standard");
    assert.equal(sanitizeRawEngineStyle("lumix", "vivid"), "vivid");
    assert.equal(sanitizeRawEngineStyle("hasselblad", "nature"), "nature");
  });

  it("spektrafilm is a pixel no-op", () => {
    const p = planes([0.31, 0.22, 0.18]);
    const before = [p.r[0], p.g[0], p.b[0]];
    applyRawEngine(p, "spektrafilm", "standard");
    assert.equal(p.r[0], before[0]);
    assert.equal(p.g[0], before[1]);
    assert.equal(p.b[0], before[2]);
  });

  it("keeps a gray pixel gray", () => {
    const p = planes([0.18, 0.18, 0.18]);
    applyRawEngine(p, "hasselblad", "standard");
    assert.ok(Math.abs(p.r[0] - p.g[0]) < 1e-5);
    assert.ok(Math.abs(p.g[0] - p.b[0]) < 1e-5);
  });

  it("portrait warms skin", () => {
    const skin: [number, number, number] = [0.40, 0.32, 0.16];
    const a = planes(skin);
    const b = planes(skin);
    applyRawEngine(a, "hasselblad", "portrait");
    const hue = (p: RgbPlanes) => {
      const Cg = -0.25 * p.r[0] + 0.5 * p.g[0] - 0.25 * p.b[0];
      const Co = 0.5 * p.r[0] - 0.5 * p.b[0];
      return Math.atan2(Cg, Co);
    };
    assert.ok(hue(a) > hue(b));
  });

  it("nature pushes foliage chroma up", () => {
    const leaf: [number, number, number] = [0.16, 0.34, 0.14];
    const a = planes(leaf);
    const b = planes(leaf);
    applyRawEngine(a, "hasselblad", "nature");
    assert.ok(chroma(a) > chroma(b) * 1.05);
  });
});
