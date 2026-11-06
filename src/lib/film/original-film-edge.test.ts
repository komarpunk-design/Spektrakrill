import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {frameGeometry} from "./photo-frame.ts";
import {sanitizeParams} from "./defaults.ts";

describe("spektra-zh film edge contracts",()=>{
 it("matches 135 native margins at full-size landscape dimensions",()=>assert.deepEqual(frameGeometry(1600,1200,"135",.04),{width:1628,height:1536,x:14,y:138,p:14}));
 it("matches 120 native margins without perforation space",()=>assert.deepEqual(frameGeometry(1600,1200,"120",.04),{width:1642,height:1548,x:21,y:174,p:21}));
 it("matches minimal edge geometry with a wider bottom caption",()=>assert.deepEqual(frameGeometry(1600,1200,"minimal",.04),{width:1708,height:1386,x:54,y:54,p:54}));
 it("keeps native edge proportions independent of the old custom width slider",()=>assert.deepEqual(frameGeometry(1600,1200,"135",.01),frameGeometry(1600,1200,"135",.2)));
 it("bounds frame numbers and date text from imported recipes",()=>{const p=sanitizeParams({frameStyle:"135",frameNumber:1000,frameDate:"a".repeat(200),frameBarcode:false});assert.equal(p.frameNumber,99);assert.equal(p.frameDate.length,32);assert.equal(p.frameBarcode,false);assert.equal(sanitizeParams({}).frameNumber,18)});
});
