#!/usr/bin/env python3
"""Source goldens + independent guided-filter check for shipping Negs port."""
import argparse,json,re,subprocess,tempfile
from pathlib import Path
import numpy as np
from scipy.ndimage import uniform_filter1d
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--probe',type=Path,required=True);args=p.parse_args();probe=str(args.probe.resolve());source=args.source.resolve()
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='26c903be9064b4fbfd46a8396620ba7e1e9bc1df'
text=(source/'crates/spektrafilm-core/src/prep.rs').read_text();body=text.split('let cases: [([f32; 8]')[1].split('for (p, expected) in cases')[0]
arrays=re.findall(r'\[([^\[\]]+)\]',body);arrays=[a for a in arrays if '_f32' in a];assert len(arrays)==32,len(arrays)
keys=['highlights','shadows','colorBoost','saturation','lift','gain','contrast','detail'];worst=0
for i in range(0,len(arrays),2):
 values=[float(x.strip().replace('_f32','')) for x in arrays[i].split(',') if x.strip()];expected=[float(x.strip().replace('_f32','')) for x in arrays[i+1].split(',') if x.strip()]
 actual=json.loads(subprocess.check_output([probe,'--core',json.dumps({'negsPrep':dict(zip(keys,values))})],text=True));error=float(np.max(np.abs(np.array(actual)-expected)));worst=max(worst,error);assert error<3e-5,(values,actual,expected,error)
print(f'PASS 16 original Negs/Sawmill control goldens; max error {worst:.3g}')
def resize(a,w,h,dw,dh):
 a=a.reshape(h,w);xs=np.clip((np.arange(dw,dtype=np.float32)/np.float32(dw)+np.float32(.5/dw))*w-.5,0,w-1);ys=np.clip((np.arange(dh,dtype=np.float32)/np.float32(dh)+np.float32(.5/dh))*h-.5,0,h-1);x0=xs.astype(int);x1=np.minimum(x0+1,w-1);y0=ys.astype(int);y1=np.minimum(y0+1,h-1);tx=xs-x0;ty=ys-y0
 top=(a[y0[:,None],x0]+(a[y0[:,None],x1]-a[y0[:,None],x0])*tx).astype(np.float32);bottom=(a[y1[:,None],x0]+(a[y1[:,None],x1]-a[y1[:,None],x0])*tx).astype(np.float32);return (top+(bottom-top)*ty[:,None]).astype(np.float32).ravel()
def guided(lum,w,h):
 r=int(np.ceil(np.float32(np.float32(max(w,h)*np.float32(.02))*np.float32(.5))));sub=max(1,min(4,w//320));sub=1 if sub>r or h<sub else sub;lw,lh=w//sub,h//sub;r=max(1,r//sub);small=lum if sub==1 else resize(lum,w,h,lw,lh)
 def box(x):
  a=uniform_filter1d(x.reshape(lh,lw).astype(np.float64),2*r+1,axis=1,mode='nearest').astype(np.float32)
  return uniform_filter1d(a.astype(np.float64),2*r+1,axis=0,mode='nearest').astype(np.float32).ravel()
 mean=box(small);variance=np.maximum(box(small*small)-mean*mean,0);a=variance/np.maximum(variance+.01,.0001);b=mean-a*mean;a=box(a);b=box(b)
 if sub!=1:a=resize(a,lw,lh,w,h);b=resize(b,lw,lh,w,h)
 return a*lum+b
with tempfile.TemporaryDirectory() as folder:
 f=Path(folder)
 for w,h in [(1,1),(1,9),(9,1),(23,17),(641,427),(1600,181),(300,1600)]:
  x=np.arange(w*h,dtype=np.float32);lum=(((x*13)%71)-20)/13;lum=lum.astype(np.float32);lum.tofile(f/'in.bin');subprocess.check_call([probe,'--guided',str(w),str(h),str(f/'in.bin'),str(f/'out.bin')]);actual=np.fromfile(f/'out.bin',np.float32);expected=guided(lum,w,h);error=float(np.max(np.abs(actual-expected)));assert error<2e-4,(w,h,error)
 for params in [{},{'exposure':1},{'highlights':-90,'shadows':40,'contrast':20,'lift':-10,'gain':15,'colorBoost':30,'saturation':-10,'detail':60}]:
  rgb=np.array([-0.,-.25,100.,.18,0.,9.],np.float32);rgb.tofile(f/'in.bin');subprocess.check_call([probe,'--prep','2','1',json.dumps({'negsPrep':params}),str(f/'in.bin'),str(f/'out.bin'),'srgb']);actual=np.fromfile(f/'out.bin',np.float32);assert np.isfinite(actual).all()
  if not params:assert actual.tobytes()==rgb.tobytes(),'neutral Prep is not bit identity'
  if params=={'exposure':1}:assert actual.tobytes()==(rgb*2).tobytes(),'exposure-only must not roundtrip colours'
print('PASS 7 guided-filter reference shapes incl. signed HDR, 1D, subsampling and pixel-centre resize; exact neutral/exposure bypass')
