#!/usr/bin/env python3
"""Numerical comparison of all six native spectral bases with upstream formulas."""
import argparse,ast,json,subprocess,sys,tempfile,tomllib,types
from pathlib import Path
import numpy as np
import colour
import scipy,scipy.ndimage,scipy.special
from opt_einsum import contract
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--probe',type=Path,required=True);args=parser.parse_args()
source=args.source.resolve();root=Path(__file__).resolve().parents[1];data=source/'src/spektrafilm/data/luts/spectral_upsampling'
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='28bf883e1672e884307edc75852549376e13644e'
for name in ['spektrafilm','spektrafilm.utils','spektrafilm.model','spektrafilm.runtime']:
 module=types.ModuleType(name);module.__path__=[str(source/'src'/Path(*name.split('.')))];sys.modules[name]=module
from spektrafilm.utils.fast_interp_lut import apply_lut_cubic_2d
from spektrafilm.data.profiles_loader import Hanatos2025SensitivityAdaptation
shape=colour.SpectralShape(380,780,5);cmfs=colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'].copy().align(shape)
env={'np':np,'scipy':scipy,'colour':colour,'contract':contract,'SPECTRAL_SHAPE':shape,'STANDARD_OBSERVER_CMFS':cmfs,'apply_lut_cubic_2d':apply_lut_cubic_2d}
ill=ast.parse((source/'src/spektrafilm/model/illuminants.py').read_text());illfunc=[n for n in ill.body if isinstance(n,ast.FunctionDef) and n.name in ['standard_illuminant','black_body_spectrum']];exec(compile(ast.Module(body=illfunc,type_ignores=[]),'upstream-illuminants.py','exec'),env)
registry={tomllib.loads(p.read_text())['identifier']:tomllib.loads(p.read_text()) for p in data.glob('*.toml')}
env['lut_descriptor']=lambda name:registry[name]
env['get_lut_spectra']=lambda name:np.asarray(np.load(data/registry[name]['file']),dtype=float)
env['HANATOS2025_SPECTRA_LUT']=env['get_lut_spectra']('hanatos2025')
functions={'_tri2quad','_quad2tri','_illuminant_to_xy','_radial_mobius_warp_xy','hanika_sigmoid','poly2d_deg4','locked_logistic_rising','eval_poly4_warp_log_exposure_surface','eval_poly4_log_exposure_surface','eval_logiflex8_spectral_bandpass','eval_erf4_spectral_bandpass','eval_spectral_bandpass_window','eval_log_exposure_correction_surface','compute_hanatos2025_tc_lut','compute_reflectance_tc_lut'}
tree=ast.parse((source/'src/spektrafilm/utils/spectral_upsampling.py').read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in functions],type_ignores=[]),'upstream-spectral-upsampling.py','exec'),env)
profiles=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';count=0;worst=0
with tempfile.TemporaryDirectory() as temporary:
 for stock in ['exp_kodak_portra_400','exp_kodak_vision3_500t','exp_kodak_doublex_6p5min']:
  payload=json.loads((profiles/(stock+'.json')).read_text());d=payload['data'];info=payload['info'];sensitivity=np.nan_to_num(10**np.asarray(d['log_sensitivity'],dtype=np.float32).astype(float))
  for method,descriptor in sorted(registry.items()):
   result=Path(temporary)/(stock+'-'+method+'.bin')
   subprocess.check_output([str(args.probe.resolve()),'--spectral',str(profiles/(stock+'.json')),method,str(data/descriptor['file']),str(result)],text=True)
   if descriptor['kind']=='reflectance':expected=env['compute_reflectance_tc_lut'](method,sensitivity,info['reference_illuminant'])
   else:
    adaptation=Hanatos2025SensitivityAdaptation(window_params=np.array(d['hanatos2025_adaptation_window_params']) if d.get('hanatos2025_adaptation_window_params') else None,reference_illuminant=info['reference_illuminant'],apply_surface=False)
    expected=env['compute_hanatos2025_tc_lut'](sensitivity,adaptation)
   actual=np.fromfile(result,dtype=np.float64).reshape(expected.shape);delta=np.max(np.abs(actual-expected));worst=max(worst,float(delta))
   assert np.allclose(actual,expected,atol=3e-5,rtol=1e-5,equal_nan=True),(stock,method,delta,np.nanmax(expected))
   count+=1
print(f'PASS {count} full native/reference spectral tables; max absolute raw error {worst:.3g}')
