#!/usr/bin/env python3
"""Compare native negative conversion to the original FilmConverter (no image I/O)."""
import argparse,ast,json,subprocess,tempfile,types,re
from pathlib import Path
import numpy as np
import colour
from scipy.ndimage import gaussian_filter1d
from opt_einsum import contract
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--probe',type=Path,required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];source=args.source.resolve()
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='28bf883e1672e884307edc75852549376e13644e'
shape=colour.SpectralShape(380,780,5);cmfs=colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'].copy().align(shape)
env={'np':np,'colour':colour,'re':re,'gaussian_filter1d':gaussian_filter1d,'contract':contract,'SPECTRAL_SHAPE':shape,'STANDARD_OBSERVER_CMFS':cmfs}
tree=ast.parse((source/'src/spektrafilm/model/develop.py').read_text());names={'compute_density_spectral','_tuned_base_density','base_film_density_tuning','base_print_density_tuning'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'reference-develop.py','exec'),env)
tree=ast.parse((source/'src/spektrafilm/model/convert.py').read_text());nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))];env['LN10']=np.log(10.);exec(compile(ast.Module(body=nodes,type_ignores=[]),'reference-convert.py','exec'),env)
profiles=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';spaces=['sRGB','Adobe RGB (1998)','ProPhoto RGB','ITU-R BT.2020','ACES2065-1','sRGB'];worst=0;count=0
with tempfile.TemporaryDirectory() as folder:
 f=Path(folder);rng=np.random.default_rng(42)
 for stock in ['exp_kodak_portra_400','exp_kodak_vision3_500t']:
  path=profiles/(stock+'.json');d=json.loads(path.read_text())['data'];density=np.array(d['density_curves']);maxima=np.ptp(density,axis=0)
  for light in ['D55','D65','A','LED-B3']:
   illum=colour.SDS_ILLUMINANTS[light].copy().align(shape).values;illum/=np.mean(illum)
   for cs in [0,2,4]:
    for tuned in [False,True]:
     e={'workflow':'negative-print','scanIlluminant':light,'scanExposure':.4,'scanCalibration':'1 .01 0 0 1 -.01 .005 0 1','filmBaseActive':tuned,'filmBaseScale':1.1,'filmBaseCyan':1.2,'filmBaseMagenta':.9,'filmBaseYellow':1.05,'filmBaseTilt':.1}
     base=types.SimpleNamespace(active=tuned,scale=1.1,cyan=1.2,magenta=.9,yellow=1.05,tilt=.1)
     converter=env['FilmConverter'](np.array(d['channel_density'],float),np.array(d['base_density'],float),base,illum,spaces[cs],maxima,exposure_ev=.4,calibration=env['parse_calibration_matrix'](e['scanCalibration']),dtype=np.float64)
     cmy=rng.uniform(.1,.85,(1,48,3))*maxima;rgb=converter._forward_jac(cmy.reshape(-1,3),need_jac=False)[0].reshape(cmy.shape)
     # Undo pretransform so input fixture exercises gain and non-symmetric matrix.
     raw=(rgb/2**.4)@np.linalg.inv(converter.calibration);raw=raw.astype(np.float32);raw.tofile(f/'in.bin')
     expected=converter.convert(raw,tol=0)
     subprocess.check_call([str(args.probe.resolve()),'--negative',str(path),json.dumps(e),str(cs),str(f/'in.bin'),str(f/'out.bin')])
     actual=np.fromfile(f/'out.bin',dtype=np.float32).reshape(expected.shape);error=float(np.max(np.abs(actual-expected)));worst=max(worst,error)
     assert np.allclose(actual,expected,atol=5e-5,rtol=5e-5),(stock,light,cs,tuned,error);count+=1
 # Exercise LUT build/cache, deterministic finite output and safe density bounds.
 e['scanUseLut']=True
 subprocess.check_call([str(args.probe.resolve()),'--negative',str(path),json.dumps(e),str(cs),str(f/'in.bin'),str(f/'lut.bin')])
 lut=np.fromfile(f/'lut.bin',dtype=np.float32).reshape(-1,3)
 assert np.isfinite(lut).all() and (lut>=0).all() and (lut<=maxima+1e-5).all()
print(f'PASS {count} inverse scan/reference cases, max density error {worst:.3g}; accelerated path finite and bounded')
# Calibration uses the source residuals with a bounded native LM solver.
with tempfile.TemporaryDirectory() as folder:
 f=Path(folder);stock='exp_kodak_portra_400';path=profiles/(stock+'.json');d=json.loads(path.read_text())['data'];density=np.array(d['density_curves']);maxima=np.ptp(density,axis=0)
 illum=colour.SDS_ILLUMINANTS['D55'].copy().align(shape).values;illum/=illum.mean()
 base=types.SimpleNamespace(active=True,scale=1.,cyan=1.,magenta=1.,yellow=1.,tilt=0.)
 converter=env['FilmConverter'](np.array(d['channel_density'],float),np.array(d['base_density'],float),base,illum,'ProPhoto RGB',maxima,dtype=np.float64)
 # Clear border plus a broad dye gamut; scan exposure is intentionally offset.
 cmy=rng.uniform(0,1,(180,3))*maxima;cmy[:8]=0
 rgb=converter._forward_jac(cmy,need_jac=False)[0];raw=(rgb/1.6).astype(np.float32);raw.tofile(f/'samples.bin')
 output=subprocess.check_output([str(args.probe.resolve()),'--calibrate',str(path),'{}','base',str(f/'samples.bin')],text=True);actual=json.loads(output)
 target=env['sample_base_rgb'](raw.reshape(1,-1,3))
 # Original fit_base_params expects a dataclass because it uses dataclasses.replace.
 from dataclasses import make_dataclass
 Base=make_dataclass('Base',[('active',bool),('scale',float),('cyan',float),('magenta',float),('yellow',float),('tilt',float)])
 original,exposure=env['fit_base_params'](target,np.array(d['channel_density'],float),np.array(d['base_density'],float),Base(True,1,1,1,1,0),illum,'ProPhoto RGB')
 assert np.allclose(actual['base'],[original.cyan,original.magenta,original.yellow],atol=.002),(actual,original)
 assert abs(actual['exposure']-exposure)<.002,(actual,exposure)
 # Matrix fit is underdetermined; verify the same anchored/ridged objective,
 # rather than asserting an arbitrary optimizer chooses identical coefficients.
 device=np.array([[1,.08,-.01],[-.04,1,.04],[.03,-.06,1]])
 raw=(rgb@device).astype(np.float32);raw.tofile(f/'samples.bin')
 actual=json.loads(subprocess.check_output([str(args.probe.resolve()),'--calibrate',str(path),'{}','matrix',str(f/'samples.bin')],text=True))
 fitted=np.array(actual['matrix']).reshape(3,3);assert np.isfinite(fitted).all()
 obs=raw[(raw@np.array([.2,.7,.1]))>=np.quantile(raw@np.array([.2,.7,.1]),.99)].mean(0);truth=converter._forward_jac(np.zeros((1,3)),False)[0][0]
 def objective(matrix):
  corrected=raw@matrix;inv=converter._invert(np.maximum(corrected,0),tol=0);hat=converter._forward_jac(inv,False)[0]
  return np.sum((corrected-hat)**2)+np.sum((5*(obs@matrix-truth))**2)+np.sum((.03*(matrix-np.eye(3)))**2)
 before=objective(np.eye(3));after=objective(fitted)
 assert after<before*.1,(before,after,fitted)
 print(f'PASS film-base calibration against reference; blind matrix objective {before:.6g} -> {after:.6g}')
