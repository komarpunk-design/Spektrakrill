import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {printTrials,printTrialParams,printTrialBlocker} from "./test-print.ts";
import {defaultParams} from "./defaults.ts";

describe("experimental test printing",()=>{
 it("uses exposure ratios rather than brightness or camera EV",()=>{const t=printTrials(1,.5);assert.equal(t.length,5);assert.equal(t[0].exposure,.5);assert.equal(t[2].exposure,1);assert.equal(t[4].exposure,2);assert.equal(t[0].ev,-1)});
 it("reports the actual stop difference when the allowed exposure is capped",()=>{const t=printTrials(3,1);assert.equal(t[4].exposure,3);assert.equal(t[4].ev,0);assert.equal(t[4].limited,true)});
 it("rejects invalid exposure inputs",()=>{for(const x of [0,NaN,Infinity,-1])assert.throws(()=>printTrials(x,.5));assert.throws(()=>printTrials(1,2));assert.throws(()=>printTrialParams(defaultParams(),99))});
 it("changes only print exposure and preserves paper compensation",()=>{const p=defaultParams();const t=printTrialParams(p,2);assert.equal(t.printExposure,2);assert.equal(t.printExposureCompensation,p.printExposureCompensation);const changed=Object.keys(t).filter(k=>JSON.stringify(t[k as keyof typeof t])!==JSON.stringify(p[k as keyof typeof p]));assert.ok(changed.every(k=>k==='printExposure'));assert.equal(p.printExposure,1)});
 it("requires a film, paper and print path",()=>{const p={...defaultParams(),filmStock:'kodak_portra_400',printPaper:'kodak_portra_endura',scanFilm:false};assert.equal(printTrialBlocker(p),null);assert.ok(printTrialBlocker({...p,filmStock:'none'}));assert.ok(printTrialBlocker({...p,printPaper:'none'}));assert.ok(printTrialBlocker({...p,scanFilm:true}));assert.ok(printTrialBlocker({...p,rawEngine:'digital' as typeof p.rawEngine}))});
});
