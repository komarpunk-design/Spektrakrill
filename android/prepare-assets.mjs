import {readFileSync,writeFileSync,cpSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const controls=await import('data:text/javascript;base64,'+readFileSync('web/controls.js').toString('base64'));
const dst='android/app/src/main/assets';mkdirSync(dst,{recursive:true});
writeFileSync(`${dst}/controls.json`,JSON.stringify({prep:controls.PREP_SECTIONS,lab:controls.SECTIONS,output:controls.OUTPUT_SECTIONS,titles:controls.TITLES}));
for(const name of ['profiles','filters','borders','luts','presets','sidecar-defaults'])cpSync('data/'+name,dst+'/data/'+name,{recursive:true});
for(const name of ['LICENSE','data/SPEKTRAFILM_LICENSE.txt','data/FOTUFILM_LICENSE.txt','crates/spektrafilm-io/fonts/OFL-BarlowCondensed.txt'])cpSync(name,dst+'/'+name.split('/').at(-1));
for(const name of ['LICENSE.LGPL','LICENSE.CDDL'])cpSync('vendor/libraw/'+name,dst+'/LibRaw-'+name);

const {createHash}=await import('node:crypto');
const hash=createHash('sha256');
function visit(path){for(const item of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path+'/'+item.name;if(item.isDirectory())visit(p);else {hash.update(p);hash.update(readFileSync(p));}}}
visit(dst+'/data');writeFileSync(dst+'/assets-version.txt',hash.digest('hex'));
