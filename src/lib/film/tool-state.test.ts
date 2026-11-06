import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { TOOL_KEYS, toolChangeCount } from "./tool-state.ts";

describe("edited tool indicators", () => {
  it("starts clear for every default tool", () => {
    const defaults = defaultParams();
    for (const tool of Object.keys(TOOL_KEYS) as (keyof typeof TOOL_KEYS)[]) assert.equal(toolChangeCount(defaults, tool), 0);
  });
  it("shows edits only for groups owning the changed parameter", () => {
    const changed = { ...defaultParams(), exposureCompensationEv: 1 };
    assert.equal(toolChangeCount(changed, "camera"), 1);
    assert.equal(toolChangeCount(changed, "export"), 0);
    assert.equal(toolChangeCount(defaultParams(), "camera"), 0);
  });
  it("does not mark gallery, presets or queue as edited", () => {
    const changed = { ...defaultParams(), filmStock: "kodak_portra_400" };
    for (const id of ["gallery", "presets", "stock"] as const) assert.equal(toolChangeCount(changed, id), 0);
  });
});
