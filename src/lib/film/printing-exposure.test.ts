import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe,it} from "node:test";
import {simulate,type PlanarImage} from "./pipeline.ts";
import {defaultParams} from "./defaults.ts";
import type {FilmProfile} from "./types.ts";
const profile=(id:string)=>JSON.parse(readFileSync(new URL(`../../../public/profiles/${id}.json`,import.meta.url),"utf8")) as FilmProfile;
describe("enlarger exposure with paper normalization",()=>{
 it("longer print exposure darkens the output instead of being normalized away",()=>{
  const count=24*18;const values=Float32Array.from({length:count},(_,i)=>.05+.65*i/count);
  const source:PlanarImage={w:24,h:18,r:values,g:values.slice(),b:values.slice()};
  const params={...defaultParams(),filmStock:"kodak_portra_400",printPaper:"kodak_portra_endura",scanFilm:false,printExposureCompensation:true,grainActive:false,glareActive:false,halationActive:false};
  const film=profile(params.filmStock),paper=profile(params.printPaper);
  const luminance=(image:PlanarImage)=>{let value=0;for(let i=0;i<count;i++)value+=image.r[i]+image.g[i]+image.b[i];return value/(count*3)};
  const first=simulate(source,film,paper,{...params,printExposure:1});
  // simulate reuses an output buffer, so read before the second render.
  const a=luminance(first),b=luminance(simulate(source,film,paper,{...params,printExposure:2}));
  assert.ok(Number.isFinite(a)&&Number.isFinite(b));assert.ok(b<a-.001,`expected a darker print: ${a} -> ${b}`);
 });
});
