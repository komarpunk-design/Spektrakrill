import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {FRAME_STYLES,frameGeometry,sanitizeFrameStyle} from "./photo-frame.ts";
import {sanitizeParams} from "./defaults.ts";

describe("only original photographic edges",()=>{
 it("offers exactly none, 135, 120 and minimal",()=>assert.deepEqual(FRAME_STYLES.map(s=>s.value),["none","135","120","minimal"]));
 it("keeps original dimensions when off",()=>assert.deepEqual(frameGeometry(960,720,"none",.04),{width:960,height:720,x:0,y:0,p:0}));
 it("disables removed custom styles in old saved edits",()=>{for(const style of ["white","black","instant"])assert.equal(sanitizeParams({frameStyle:style}).frameStyle,"none");});
 it("migrates the duplicate old film choice to original 135",()=>assert.equal(sanitizeFrameStyle("film"),"135"));
 it("uses only original margin proportions",()=>assert.deepEqual(frameGeometry(1000,800,"135",.05),{width:1018,height:1024,x:9,y:92,p:9}));
});
