import {defaultParams} from "./defaults.ts";
import {parsePresetJson,serializeLook} from "./preset-json.ts";
import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {readFileSync} from 'node:fs';
import {labScanFinish,labCurve,LAB_MIDPOINT,defaultOutput,sanitizeOutput,scanOutput} from './output-model.ts';
import type {FilmProfile,Vec3} from './types.ts';
const Y=(v:Vec3)=>.2126*v[0]+.7152*v[1]+.0722*v[2];
describe('Fotufilm output adaptation',()=>{
 it('roundtrips output models and operator keys in saved recipes',()=>{const p=JSON.parse(serializeLook('Lab',{...defaultParams(),output:{...defaultOutput(),mode:'lab-scan',cyan:.25}}));const parsed=parsePresetJson(p);assert.equal(parsed[0].params.output.mode,'lab-scan');assert.equal(parsed[0].params.output.cyan,.25);});
 it('keeps old recipes on paper; rejects invalid saved controls',()=>{assert.equal(defaultOutput().mode,'paper');assert.equal(sanitizeOutput({mode:'bad',look:Infinity,exposure:NaN}).mode,'paper');assert.equal(sanitizeOutput({exposure:90,cyan:-9}).exposure,6);assert.equal(sanitizeOutput({cyan:-9}).cyan,-1);});
 it('keeps zero finish exact, white fixed and black dark',()=>{const rgb:Vec3=[.1,.2,.3];assert.equal(labScanFinish(rgb,0),rgb);for(const v of labScanFinish([1,1,1]))assert.ok(Math.abs(v-1)<1e-4);assert.ok(Y(labScanFinish([.0001,.0001,.0001]))<=.0001);});
 it('ports upstream neutral monotonic ramp, open upper tones and cool shadows',()=>{let last=0;for(let i=1;i<=200;i++){const v=Y(labScanFinish([i/200,i/200,i/200]));assert.ok(v>last);last=v;}assert.ok(Y(labScanFinish([.5,.5,.5]))>.5);assert.ok(Y(labScanFinish([.01,.01,.01]))<.01);const shadow=labScanFinish([.05,.05,.05]);assert.ok(shadow[0]<shadow[1]&&shadow[0]<shadow[2]);});
 it('keeps monochrome neutral and the receiver curve monotone',()=>{for(const x of [.02,.18,.6]){const rgb=labScanFinish([x,x,x],1,false);assert.ok(Math.max(...rgb)-Math.min(...rgb)<1e-6);}assert.ok(Math.abs(10**-labCurve(LAB_MIDPOINT)-.18)<1e-10);let last=0;for(let x=-6;x<6;x+=.05){assert.ok(labCurve(x)>=last);last=labCurve(x);}});
 it('inverts film densities before display encoding; Lab zero equals fixed digital',()=>{
 const film=JSON.parse(readFileSync(new URL('../../../public/profiles/kodak_portra_400.json',import.meta.url),'utf8')) as FilmProfile;
 const n=50,planes=[new Float32Array(n),new Float32Array(n),new Float32Array(n)] as [Float32Array,Float32Array,Float32Array];for(let c=0;c<3;c++)for(let i=0;i<n;i++)planes[c][i]=i*.04;
 const p={...defaultOutput(),mode:'digital' as const},digital=scanOutput(planes,film,p),neutral=scanOutput(planes,film,{...p,mode:'lab-scan',look:0,autoSetup:false});assert.deepEqual(digital,neutral);
 const lab=scanOutput(planes,film,{...p,mode:'lab-scan'});assert.notDeepEqual(lab,digital);assert.ok(digital[0][n-1]>digital[0][0]);for(const channel of lab)for(const v of channel)assert.ok(Number.isFinite(v));
 });
});
