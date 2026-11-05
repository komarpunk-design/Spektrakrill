import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { diffParams, formatParamValue } from "./preset-diff.ts";
import type { DarkroomParams } from "./types.ts";

function stub(partial: Partial<DarkroomParams>): DarkroomParams {
  return partial as DarkroomParams;
}

describe("Spektrafilm presets.json", () => {
  it("is a pack of named looks, not a single recipe", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../../public/profiles/presets.json", import.meta.url), "utf8"),
    ) as { presets?: { name?: string; params?: { filmProfile?: string } }[] };
    assert.ok(Array.isArray(raw.presets) && raw.presets.length >= 8);
    assert.ok(raw.presets.every((p) => p.name && p.params?.filmProfile));
    assert.equal(raw.presets[0]?.params?.filmProfile, "kodak_portra_160");
  });
});

describe("diffParams", () => {
  it("lists film and print changes in Russian, skips export/LUT", () => {
    const before = stub({
      filmStock: "kodak_portra_400",
      filmGamma: 1,
      printYFilterShift: 0,
      exportQuality: 92,
      gpuPreview: false,
      useEnlargerLut: false,
    });
    const after = stub({
      filmStock: "kodak_portra_160",
      filmGamma: 0.94,
      printYFilterShift: 4,
      exportQuality: 99,
      gpuPreview: true,
      useEnlargerLut: true,
    });
    const changes = diffParams(before, after, {
      film: { kodak_portra_400: "Kodak Portra 400", kodak_portra_160: "Kodak Portra 160" },
    });
    const keys = changes.map((c) => c.key);
    assert.ok(keys.includes("filmStock"));
    assert.ok(keys.includes("filmGamma"));
    assert.ok(keys.includes("printYFilterShift"));
    assert.ok(!keys.includes("exportQuality"));
    assert.ok(!keys.includes("gpuPreview"));
    assert.ok(!keys.includes("useEnlargerLut"));
    const film = changes.find((c) => c.key === "filmStock");
    assert.equal(film?.from, "Kodak Portra 400");
    assert.equal(film?.to, "Kodak Portra 160");
    assert.equal(film?.group, "film");
    assert.equal(formatParamValue("printYFilterShift", 4), "4");
  });

  it("returns empty when nothing visible changed", () => {
    const p = stub({ filmStock: "kodak_portra_400", exportFormat: "jpeg" });
    assert.deepEqual(diffParams(p, stub({ ...p, exportFormat: "png" })), []);
  });
});
