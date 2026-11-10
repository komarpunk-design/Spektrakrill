#!/usr/bin/env python3
"""Compare shipping C++ profile preparation against pinned experimental Python.
Run in the oracle venv with --source and --probe (tests/native/experimental_probe.cpp).
Image I/O is deliberately not imported; the actual source math functions are used.
"""
import argparse,ast,json,subprocess,sys,types
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter1d
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--probe',type=Path,required=True);args=parser.parse_args()
source=args.source.resolve();root=Path(__file__).resolve().parents[1]
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='28bf883e1672e884307edc75852549376e13644e'
for name in ['spektrafilm','spektrafilm.utils','spektrafilm.model','spektrafilm.runtime']:
 module=types.ModuleType(name);module.__path__=[str(source/'src'/Path(*name.split('.')))];sys.modules[name]=module
from spektrafilm.data.profiles_loader import DensityCurvesModel
from spektrafilm.utils.morph_curves import apply_print_curves_morph_with_layers,FilmChemistryParams
# Execute the original base-tuning functions without loading RAW/image I/O dependencies.
tree=ast.parse((source/'src/spektrafilm/model/develop.py').read_text());names={'base_print_density_tuning','base_film_density_tuning','_tuned_base_density'}
functions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
namespace={'np':np,'gaussian_filter1d':gaussian_filter1d,'SPECTRAL_SHAPE':types.SimpleNamespace(wavelengths=np.arange(380,781,5))};exec(compile(functions,'upstream-develop.py','exec'),namespace)
profiles=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';count=0;worst=0
cases=[{}, {'filmChemistry':True,'filmFast':.8,'filmSlow':1.2,'filmRed':1.1,'filmGreen':.9,'filmBlue':1.3,'filmExhaustion':.6}, {'filmChemistry':True,'filmExhaustion':1}, {'filmBaseActive':True,'filmBaseScale':1.2,'filmBaseCyan':1.3,'filmBaseMagenta':.8,'filmBaseYellow':1.1,'filmBaseTilt':.25}, {'filmBaseActive':True,'filmBaseScale':.6}, {'colorFilter':'hoya_r1'}, {'grainRms':True,'grainRmsRed':4.5,'grainRmsGreen':7,'grainRmsBlue':12}, {'dirLangmuir':True,'dirDonorRed':.6,'dirDonorGreen':1.3,'dirDonorBlue':.8,'dirReceiverRed':1.2,'dirReceiverGreen':.7,'dirReceiverBlue':1.4}]
for stock in ['kodak_portra_400','exp_kodak_portra_400','exp_kodak_doublex_6p5min','exp_kodak_portra_endura']:
 path=profiles/(stock+'.json');payload=json.loads(path.read_text());data=payload['data']
 for case in cases:
  film=payload['info']['stage']=='filming';case=dict(case)
  if not film:case={k.replace('film','print'):v for k,v in case.items() if k!='colorFilter' and k!='filmBaseTilt'}
  gamma=1.15 if case.get('filmChemistry') else 1
  result=subprocess.check_output([str(args.probe.resolve()),str(path),json.dumps(case),'film' if film else 'print',str(gamma)],text=True);actual=json.loads(result)
  curves=np.asarray(data['density_curves']);layers=np.asarray(data['density_curves_layers']);base=np.array(data['base_density'],dtype=float)
  prefix='film' if film else 'print'
  if case.get(prefix+'Chemistry'):
   m=data['density_curves_model'];model=DensityCurvesModel(**{**m,'model_type':'norm_cdfs' if m['model_type']=='cdfs' else m['model_type']})
   p=FilmChemistryParams(gamma_factor=gamma if film else 1,gamma_factor_fast=case.get(prefix+'Fast',1),gamma_factor_slow=case.get(prefix+'Slow',1),gamma_factor_red=case.get(prefix+'Red',1),gamma_factor_green=case.get(prefix+('Red' if payload['info']['channel_model']=='bw' else 'Green'),1),gamma_factor_blue=case.get(prefix+('Red' if payload['info']['channel_model']=='bw' else 'Blue'),1),developer_exhaustion=case.get(prefix+'Exhaustion',0))
   curves,layers=apply_print_curves_morph_with_layers(np.asarray(data['log_exposure']),model,p,profile_type=payload['info']['type'])
  if case.get(prefix+'BaseActive'):
   p=types.SimpleNamespace(active=True,scale=case.get(prefix+'BaseScale',1),cyan=case.get(prefix+'BaseCyan',1),magenta=case.get(prefix+'BaseMagenta',1),yellow=case.get(prefix+'BaseYellow',1),tilt=case.get(prefix+'BaseTilt',0))
   base=namespace['_tuned_base_density'](base,p,film)
  for key,expected in [('curves',curves),('layers',layers),('base',base)]:
   got=np.array(actual[key],dtype=float);expected=np.asarray(expected,dtype=float).ravel();assert got.shape==expected.shape,(stock,key,got.shape,expected.shape)
   delta=np.nanmax(np.abs(got-expected));worst=max(worst,float(delta));assert np.allclose(got,expected,atol=2e-5,rtol=2e-6,equal_nan=True),(stock,case,key,delta)
  if film and case.get('colorFilter'):
   from scipy.interpolate import Akima1DInterpolator
   raw=np.loadtxt(source/'src/spektrafilm/data/filters/colored/hoya/r1.csv',delimiter=',');raw=raw[np.unique(raw[:,0],return_index=True)[1]]
   t=Akima1DInterpolator(raw[:,0],raw[:,1])(np.arange(380,781,5));expected=np.asarray(data['log_sensitivity'],dtype=float)+np.log10(np.maximum(t,1e-20))[:,None]
   assert np.allclose(np.array(actual['sensitivity'],dtype=float).reshape(-1,3),expected,atol=2e-6,equal_nan=True)
  if case.get('grainRms'):
   texture=np.array(actual['texture']).reshape(16,3);before=np.array([[.15+.008*i+.03*c for c in range(3)] for i in range(16)])
   assert np.isfinite(texture).all() and np.all(texture+.03>=0)
   assert np.allclose(texture.sum(axis=0),before.sum(axis=0),atol=2e-6),'density USM must conserve channel mass'
   parsed=ast.parse((source/'src/spektrafilm/model/grain.py').read_text());func=next(n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name=='_coarsest_area_from_curves')
   env={'np':np,'_RMS_APERTURE_AREA_UM2':float(np.pi*24**2)};exec(compile(ast.Module(body=[func],type_ignores=[]),'upstream-grain.py','exec'),env)
   peak=np.nanmax(layers,axis=0);frac=peak/peak.sum(axis=0);floor=np.array([.03,.03,.03]);uniformity=np.array([.97,.97,.97]);scales=np.array([1,.5,.25]);rms=np.array([case.get('grainRmsRed',6),case.get('grainRmsGreen',8),case.get('grainRmsBlue',10)]);rms=np.repeat(rms[0],3) if payload['info']['channel_model']=='bw' else rms
   expected=env['_coarsest_area_from_curves'](layers,frac*floor,peak+frac*floor,frac,scales,uniformity,rms)
   assert np.allclose(actual['areas'],expected,atol=2e-7,rtol=1e-5),(stock,actual['areas'],expected)
  if case.get('dirLangmuir'):
   from spektrafilm.model.couplers import apply_density_correction_dir_couplers
   from spektrafilm.runtime.params_schema import DirCouplersParams
   from spektrafilm.model.density_curves import interpolate_exposure_to_density
   ndc=curves-curves.min(axis=0);lograw=np.array(actual['lograw'],dtype=np.float32).reshape(8,8,3);le=np.array(data['log_exposure'])
   before=interpolate_exposure_to_density(lograw,ndc,le,1)
   p=DirCouplersParams(langmuir_donor_k_rgb=tuple(case.get('dirDonor'+c,1) for c in (['Red']*3 if payload['info']['channel_model']=='bw' else ['Red','Green','Blue'])),langmuir_receiver_k_rgb=tuple(case.get('dirReceiver'+c,1) for c in (['Red']*3 if payload['info']['channel_model']=='bw' else ['Red','Green','Blue'])),diffusion_size_um=0)
   if payload['info']['channel_model']=='bw':p.gamma_samelayer_rgb=(.341,.341,.341);p.gamma_interlayer_r_to_gb=p.gamma_interlayer_g_to_rb=p.gamma_interlayer_b_to_rg=(0,0)
   expected=apply_density_correction_dir_couplers(before,lograw,10,le,ndc,p,payload['info']['type'])
   got=np.array(actual['coupled']).reshape(8,8,3)
   assert np.allclose(got,expected,atol=3e-5,rtol=1e-5),(stock,'Langmuir',np.max(np.abs(got-expected)))
   native_spatial=json.loads(subprocess.check_output([str(args.probe.resolve()),str(path),json.dumps(case),'film' if film else 'print',str(gamma),'20'],text=True))
   p.diffusion_size_um=20
   expected=apply_density_correction_dir_couplers(before,lograw,10,le,ndc,p,payload['info']['type'])
   assert np.allclose(np.array(native_spatial['coupled']).reshape(8,8,3),expected,atol=5e-4,rtol=1e-4),(stock,'spatial Langmuir',np.max(np.abs(np.array(native_spatial['coupled']).reshape(8,8,3)-expected)))
  count+=1
# Reject malformed/nonfinite/out-of-range controls at the native boundary.
path=profiles/'kodak_portra_400.json'
for case in [{'filmChemistry':True,'filmFast':0},{'filmBaseActive':True,'filmBaseScale':-1},{'colorFilter':'unknown'}]:
 assert subprocess.run([str(args.probe.resolve()),str(path),json.dumps(case),'film'],capture_output=True).returncode!=0
print(f'PASS {count} native/reference cases; max absolute density error {worst:.3g}; invalid controls rejected')
