import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {DEVELOPMENT_FAMILIES,developmentParams,developmentKey,developmentFamilyFor} from "./development-process.ts";
import {defaultParams} from "./defaults.ts";

test("all process curves exist in both web and spectral Android formats",()=>{
 for(const family of DEVELOPMENT_FAMILIES){
  assert.ok(family.variants[family.reference]);
  for(const id of [...family.variants.map(v=>v.id),family.paper]){
   const web=readFileSync(new URL(`../../../public/profiles/${id}.json`,import.meta.url),'utf8');
   const native=readFileSync(new URL(`../../../android/engine/spektra-core/src/main/assets/spektra/profiles/${id}.json`,import.meta.url),'utf8');
   assert.equal(JSON.parse(web).id,id);
   assert.equal(JSON.parse(native).info.stock,id);
   assert.ok(JSON.parse(web).densityCurves.length>0);
   assert.ok(JSON.parse(native).data.density_curves.length>0);
  }
  const curves=family.variants.map(v=>JSON.stringify(JSON.parse(readFileSync(new URL(`../../../public/profiles/${v.id}.json`,import.meta.url),'utf8')).densityCurves));
  assert.equal(new Set(curves).size,family.variants.length);
 }
});
test("development preserves exposure, paper and remaining adjustments unless paper is requested",()=>{
 const base=defaultParams(),family=DEVELOPMENT_FAMILIES[0],variant=family.variants[1];
 const next=developmentParams(base,family,variant.id,false);
 assert.deepEqual(next,{...base,filmStock:variant.id});
 assert.deepEqual(developmentParams(base,family,variant.id,true),{...base,filmStock:variant.id,printPaper:family.paper,scanFilm:false});
 assert.throws(()=>developmentParams(base,family,'not_a_variant',false));
 assert.equal(developmentFamilyFor(variant.id),family);
});
test("applying a trial preserves comparison validity but exposure changes invalidate it",()=>{
 const base=defaultParams(),family=DEVELOPMENT_FAMILIES[0];
 const next=developmentParams(base,family,family.variants[1].id,false);
 assert.equal(developmentKey(base,family,false),developmentKey(next,family,false));
 assert.notEqual(developmentKey(base,family,false),developmentKey({...base,exposureCompensationEv:2},family,false));
});
