import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {frameGeometry,sanitizeFrameStyle} from "./photo-frame.ts";
import {sanitizeParams} from "./defaults.ts";

describe("photographic frames",()=>{
 it("keeps original dimensions with no frame",()=>assert.deepEqual(frameGeometry(960,720,"none",.04),{width:960,height:720,x:0,y:0,p:0}));
 it("adds equal white borders without cropping",()=>assert.deepEqual(frameGeometry(1000,800,"white",.05),{width:1080,height:880,x:40,y:40,p:40}));
 it("leaves room for the instant-photo lower margin",()=>assert.deepEqual(frameGeometry(1000,800,"instant",.05),{width:1080,height:960,x:40,y:40,p:40}));
 it("uses original 135 proportions for the legacy film setting",()=>assert.deepEqual(frameGeometry(1000,800,"film",.05),{width:1018,height:1024,x:9,y:92,p:9}));
 it("handles portrait and landscape consistently",()=>{const a=frameGeometry(800,1000,"black",.05);assert.equal(a.p,40);assert.equal(a.width,880);assert.equal(a.height,1080)});
 it("bounds invalid frame widths and unknown imported styles",()=>{assert.equal(frameGeometry(1000,800,"white",NaN).p,32);assert.equal(frameGeometry(1000,800,"white",5).p,160);assert.equal(sanitizeFrameStyle("invalid"),"none");assert.equal(sanitizeParams({frameStyle:"film",whitePadding:Infinity}).whitePadding,.04)});
});
