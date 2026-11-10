/** Fotufilm LabScanFinish / PrintPaperTables @b9049f3 (Apache-2.0, MUAStudio Inc.).
 * Adapted receiver calibration and frame timing for Spektrafilm's CMY density model.
 * This is an experimental adaptation, not numerical parity with Fotufilm's full engine.
 */
import {interpCurve} from './color.ts';
import type {FilmProfile,Vec3} from './types.ts';
export const defaultOutput=()=>({mode:'paper' as 'paper'|'negative'|'digital'|'auto-levels'|'lab-scan',autoSetup:true,exposure:0,cyan:0,magenta:0,yellow:0,look:1});
export type OutputParams=ReturnType<typeof defaultOutput>;
export function sanitizeOutput(raw:unknown):OutputParams{const o=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},p=defaultOutput();if(['paper','negative','digital','auto-levels','lab-scan'].includes(String(o.mode)))p.mode=o.mode as OutputParams['mode'];if(typeof o.autoSetup==='boolean')p.autoSetup=o.autoSetup;for(const k of ['exposure','cyan','magenta','yellow','look'] as const){const n=o[k];if(typeof n==='number'&&Number.isFinite(n))p[k]=Math.min(k==='exposure'?6:1,Math.max(k==='look'?0:k==='exposure'?-6:-1,n));}return p;}
const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
export function labCurve(x:number){const soft=(v:number)=>Math.max(v,0)+Math.log1p(Math.exp(-Math.abs(v)));return 3*clamp(.3*soft((x+1)/.3)-.3*soft((x-.2)/.3),0,1.2);}
function inverseCurve(y:number){let lo=-8,hi=8;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(labCurve(mid)<y)lo=mid;else hi=mid;}return (lo+hi)/2;}
export const LAB_MIDPOINT=inverseCurve(-Math.log10(.18));
export function labScanFinish(rgb:Vec3,strength=1,chromatic=true,floor=0):Vec3{
 strength=Number.isFinite(strength)?clamp(strength):1;if(!strength)return rgb;
 // Convert linear sRGB to upstream's linear Display P3 working space.
 const p:Vec3=[.822461969*rgb[0]+.177538031*rgb[1],.033194199*rgb[0]+.966805801*rgb[1],.017082631*rgb[0]+.072397441*rgb[1]+.910519929*rgb[2]];
 const Y=.2289746*p[0]+.6917385*p[1]+.0792869*p[2];if(Y<=1e-6)return rgb;
 const level=Math.cbrt(Y),upper=clamp((level-.55)/.45),target=Math.max(0,level+strength*(.006*Math.sin(Math.PI*upper)-.019*clamp(1-level/.35))),gain=target**3/Y;
 let [r,g,b]=p.map(v=>v*gain);[r,g,b]=[1.22494018*r-.224940176*g,-.042056955*r+1.04205695*g,-.019637555*r-.078636046*g+1.09827360*b];
 if(!chromatic)return [r,g,b];
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 const L=.2104542553*l+.793617785*m-.0040720468*s;let a=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
 const onset=floor>0?clamp(Math.log2(Math.max(Y,1e-12)/floor)-.5):1,shadow=clamp((.70-L)/.40)*clamp((L-.04)/.16)*onset,neutral=L*Math.exp(-Math.hypot(a,B)/Math.max(L,1e-3)/.1);
 a+=strength*neutral*shadow*-.045;B+=strength*neutral*shadow*-.033;
 let chroma=Math.hypot(a,B),hue=Math.atan2(B,a)*180/Math.PI,hueGain=1,turn=0;
 for(const [center,width,scale,angle] of [[45,35,.97,2.3],[135,35,.89,5.5],[240,35,1.05,-6.4]]){let d=(hue-center)%360;if(d>180)d-=360;if(d< -180)d+=360;const weight=Math.exp(-.5*(d/width)**2);hueGain*=1+strength*(scale-1)*weight;turn+=strength*angle*weight;}
 const saturated=clamp((chroma-.08)/.12),fade=clamp(L/.25)*clamp((1-L)/.08)*(1-saturated*saturated*(3-2*saturated));chroma*=1+(hueGain-1)*fade;hue+=turn*fade;a=chroma*Math.cos(hue*Math.PI/180);B=chroma*Math.sin(hue*Math.PI/180);
 const ll=(L+.3963377774*a+.2158037573*B)**3,mm=(L-.1055613458*a-.0638541728*B)**3,ss=(L-.0894841775*a-1.291485548*B)**3;
 return [4.0767416621*ll-3.3077115913*mm+.2309699292*ss,-1.2684380046*ll+2.6097574011*mm-.3413193965*ss,-.0041960863*ll-.7034186147*mm+1.707614701*ss];
}
/** Spektrafilm adapter: use the film's own dye spectra, never invert a finished JPEG. */
export function scanOutput(planes:[Float32Array,Float32Array,Float32Array],film:FilmProfile,p:OutputParams,gamma=1):[Float32Array,Float32Array,Float32Array]{
 const count=planes[0].length,out=[new Float32Array(count),new Float32Array(count),new Float32Array(count)] as [Float32Array,Float32Array,Float32Array];
 const spectra=film.scannerSpectra,centers=[630,545,465],widths=[8.5,14,9.5],axis=Math.log10(.184);
 // The browser film exposure uses grey=.184; native spectral autoexposure uses raw grey=1.
 const bands=spectra?.dyes.flatMap((d,i)=>!d.every(Number.isFinite)||!Number.isFinite(spectra.base[i])?[]:[{d,weights:centers.map((center,c)=>Math.exp(-.5*((spectra.wavelengths[i]-center)/widths[c])**2)),base:10**-spectra.base[i]}]);
 const sums=[0,1,2].map(c=>bands?.reduce((sum,row)=>sum+row.weights[c],0)??1);
 const read=(d:number[]):number[]=>{if(!bands)return film.dyeToRgb.map((matrix,c)=>-(matrix[0]*d[0]+matrix[1]*d[1]+matrix[2]*d[2]+film.baseRgbOd[c]));const energy=[0,0,0];for(const row of bands){const light=row.base*10**-(row.d[0]*d[0]+row.d[1]*d[1]+row.d[2]*d[2]);energy[0]+=row.weights[0]*light;energy[1]+=row.weights[1]*light;energy[2]+=row.weights[2]*light;}return energy.map((value,c)=>Math.log10(Math.max(value/Math.max(sums[c],1e-12),1e-12)));};
 const densityAt=(offset:number)=>[0,1,2].map(c=>interpCurve(axis+offset,film.densityCurves,film.logExposure.min,film.logExposure.max,c,gamma));
 const reference=read(densityAt(0)),low=read(densityAt(-.15)),highRead=read(densityAt(.15)),slope=[0,1,2].map(c=>Math.max(.05,Math.abs((highRead[c]-low[c])/.3)));
 const records=out;for(let i=0;i<count;i++){const value=read([planes[0][i],planes[1][i],planes[2][i]]);for(let c=0;c<3;c++)records[c][i]=(reference[c]-value[c])/slope[c];}
 const stats=[];const stride=Math.max(1,Math.floor(count/16384));for(let i=0;i<count;i+=stride)stats.push((records[0][i]+records[1][i]+records[2][i])/3);stats.sort((a,b)=>a-b);
 const median=stats[Math.floor(stats.length*.5)]??0,high=stats[Math.min(stats.length-1,Math.floor(stats.length*.995))]??0;
 const automatic=p.mode==='auto-levels'||p.mode==='lab-scan'&&p.autoSetup,scale=automatic?clamp(1.2/Math.max(.8,high-median),1,1.5):1,shift=automatic?Math.min(0,-median*.5,(LAB_MIDPOINT-inverseCurve(.08))-high*scale):0;
 const keys=[p.cyan,p.magenta,p.yellow];for(let i=0;i<count;i++){const rgb=records.map((plane,c)=>10**-labCurve(LAB_MIDPOINT-(plane[i]*scale+shift+p.exposure*Math.LOG10E*Math.LN2-keys[c]*.5))) as Vec3;
 const finish=p.mode==='lab-scan'?labScanFinish(rgb,p.look,!film.monochrome):rgb;const gray=(finish[0]+finish[1]+finish[2])/3;for(let c=0;c<3;c++)out[c][i]=film.monochrome?gray:finish[c];}return out;
}
