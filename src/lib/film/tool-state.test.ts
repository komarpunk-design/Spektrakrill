import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import { TOOL_KEYS, toolChangeCount, resetToolParams } from "./tool-state.ts";

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

describe('workflow reset ownership',()=>{
 it('resets grain independently of development, paper, frames and input preparation',()=>{
 const p=defaultParams();p.experimental.grainRmsRed=31;p.experimental.filmRed=1.4;p.experimental.printBaseScale=1.2;p.prep.shadows=20;p.frameStyle='135';p.filmStock='negs_cinestill_800t';
 const out=resetToolParams(p,'texture');assert.equal(out.experimental.grainRmsRed,defaultParams().experimental.grainRmsRed);assert.equal(out.experimental.filmRed,1.4);assert.equal(out.experimental.printBaseScale,1.2);assert.equal(out.prep.shadows,20);assert.equal(out.frameStyle,'135');assert.equal(out.filmStock,p.filmStock);assert.equal(p.experimental.grainRmsRed,31);
 });
 it('resets output without resetting paper or photographic frame',()=>{const p=defaultParams();p.output.mode='lab-scan';p.printExposure=2;p.frameStyle='120';const out=resetToolParams(p,'outputs');assert.equal(out.output.mode,'paper');assert.equal(out.printExposure,2);assert.equal(out.frameStyle,'120');});
 it('separates crop from film edges',()=>{const p=defaultParams();p.crop=true;p.frameStyle='135';p.whitePadding=.1;const out=resetToolParams(p,'crop');assert.equal(out.crop,false);assert.equal(out.frameStyle,'135');assert.equal(out.whitePadding,.1);assert.equal(resetToolParams(p,'frame').whitePadding,defaultParams().whitePadding);});
});


describe('simple editor reset',()=>{
 it('resets the main exposure without erasing advanced Prep or chosen film',()=>{const p=defaultParams();p.prep.exposure=1;p.prep.shadows=25;p.exposureCompensationEv=-1;p.filmGamma=1.2;p.filmStock='negs_cinestill_800t';p.transport.model='layered';const out=resetToolParams(p,'edit');assert.equal(out.prep.exposure,0);assert.equal(out.prep.shadows,25);assert.equal(out.exposureCompensationEv,-1);assert.equal(out.filmGamma,1.2);assert.equal(out.filmStock,p.filmStock);assert.equal(out.transport.model,'legacy');});
});
