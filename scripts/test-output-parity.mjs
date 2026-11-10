import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {labScanFinish} from '../src/lib/film/output-model.ts';
const probe=process.env.OUTPUT_PROBE??'/workspace/scratch/experimental-host/build/output_probe';let worst=0;
for(let i=0;i<100;i++){const rgb=[((i*19)%101)/100,((i*37)%101)/100,((i*53)%101)/100];const expected=JSON.parse(execFileSync(probe,['--finish',...rgb.map(String)],{encoding:'utf8'})),actual=labScanFinish(rgb);for(let c=0;c<3;c++){const error=Math.abs(actual[c]-expected[c]);worst=Math.max(worst,error);assert.ok(error<1e-10);}}
console.log(`PASS 100 browser/C++ LabScanFinish colours; max error ${worst}`);
