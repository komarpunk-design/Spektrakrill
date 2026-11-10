#!/usr/bin/env python3
"""Compare every converted profile and selected spectral tables to source math."""
import argparse,ast,json,subprocess,sys,tempfile,types
from pathlib import Path
import numpy as np
from scipy.special import ndtr
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--spectral-source',type=Path,required=True);p.add_argument('--probe',type=Path,required=True);args=p.parse_args();source=args.source.resolve();up=args.spectral_source.resolve();root=Path(__file__).resolve().parents[1]
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='26c903be9064b4fbfd46a8396620ba7e1e9bc1df'
for name in ['spektrafilm','spektrafilm.utils','spektrafilm.model','spektrafilm.runtime']:
 module=types.ModuleType(name);module.__path__=[str(up/'src'/Path(*name.split('.')))];sys.modules[name]=module
from spektrafilm.data.profiles_loader import DensityCurvesModel
from spektrafilm.utils.morph_curves import apply_print_curves_morph_with_layers,FilmChemistryParams
manifest=json.loads((root/'docs/upstream/negs/manifest.json').read_text());native=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';worst=0;count=0
for entry in manifest['profiles']:
 path=native/(entry['id']+'.json');payload=json.loads(path.read_text());d=payload['data'];original=json.loads((source/'data/profiles'/(entry['stock']+'.json')).read_text());raw=original['data'];bw=original['info']['channel_model']=='bw';index=0 if entry['minutes'] is None else list(map(float,raw['development_time'])).index(entry['minutes'])
 model=d['density_curves_model'];le=np.array(d['log_exposure']);sign=-1 if payload['info']['type']=='positive' else 1
 # The actual model, not a colour/stock-name substitution; preserve all 4 BW components.
 expected=np.zeros((len(le),3));expected_layers=np.zeros((len(le),len(model['centers'][0]),3))
 for c in range(3):
  for l in range(len(model['centers'][c])):expected_layers[:,l,c]=model['amplitudes'][c][l]*ndtr(sign*(le-model['centers'][c][l])/model['sigmas'][c][l])
 expected=expected_layers.sum(axis=1);assert np.allclose(d['density_curves'],expected,atol=2e-7)
 original_base=np.asarray(raw['base_density'],float);original_base=original_base[:,index] if original_base.ndim==2 else original_base
 assert np.allclose(d['base_density'],original_base,atol=1e-12,equal_nan=True)
 dye=np.asarray(d['channel_density'],float);source_dye=np.asarray(raw['channel_density'],float)
 assert np.allclose(dye.sum(axis=1) if bw else dye,source_dye[:,0] if bw else source_dye,atol=1e-12,equal_nan=True),'BW dye optical density tripled'
 for chemistry in [False,True]:
  film=payload['info']['stage']=='filming';prefix='film' if film else 'print';settings={prefix+'Chemistry':chemistry,prefix+'Fast':.8,prefix+'Slow':1.2,prefix+'Red':1.1,prefix+'Green':.9,prefix+'Blue':1.3,prefix+'Exhaustion':.35,'grainRms':True,'grainRmsRed':19,'grainRmsGreen':13,'grainRmsBlue':17,'grainUniformityRed':.6,'grainUniformityGreen':.6,'grainUniformityBlue':.6,'grainScaleFast':1,'grainScaleMid':.4,'grainScaleSlow':.25}
  gamma=1.15 if film and chemistry else 1
  result=json.loads(subprocess.check_output([str(args.probe.resolve()),str(path),json.dumps(settings),'film' if film else 'print',str(gamma)],text=True))
  curves,layers=expected,expected_layers
  if chemistry:curves,layers=apply_print_curves_morph_with_layers(le,DensityCurvesModel(**model),FilmChemistryParams(gamma_factor=gamma,gamma_factor_fast=.8,gamma_factor_slow=1.2,gamma_factor_red=1.1,gamma_factor_green=1.1 if bw else .9,gamma_factor_blue=1.1 if bw else 1.3,developer_exhaustion=.35),profile_type=payload['info']['type'])
  error=float(np.max(np.abs(np.asarray(result['curves']).reshape(curves.shape)-curves)));worst=max(worst,error);assert error<3e-6,(entry['id'],chemistry,error)
  assert np.allclose(np.asarray(result['layers']).reshape(layers.shape),layers,atol=3e-6)
  # Source generalized layer-area formula, including the repeated finest scale for layer 4.
  tree=ast.parse((up/'src/spektrafilm/model/grain.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_coarsest_area_from_curves');env={'np':np,'_RMS_APERTURE_AREA_UM2':float(np.pi*24**2)};exec(compile(ast.Module(body=[fn],type_ignores=[]),'reference-grain.py','exec'),env)
  maximum=layers.max(axis=0);fraction=maximum/maximum.sum(axis=0);scales=np.array([1,.4,.25]+([.25] if layers.shape[1]==4 else []));rms=np.repeat(19.,3) if bw else np.array([19.,13.,17.]);area=env['_coarsest_area_from_curves'](layers,fraction*.03,maximum+fraction*.03,fraction,scales,np.repeat(.6,3),rms)
  assert np.allclose(result['areas'],area,rtol=2e-5,atol=2e-7),(entry['id'],result['areas'],area)
  count+=1
print(f'PASS {count} native/source profile cases: original base/dyes, all fitted layers, coupled chemistry, generalized RMS areas; max curve error {worst:.3g}')
