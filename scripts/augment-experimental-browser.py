#!/usr/bin/env python3
"""Attach native model metadata and reduced taking-filter responses to web profiles.
The browser remains a reduced RGB preview; Android uses the 81-band integration.
Run in the oracle venv, --source pinned experimental checkout.
"""
import argparse,json
from pathlib import Path
import numpy as np
from scipy.interpolate import Akima1DInterpolator
import colour
from colour.recovery import MSDS_BASIS_FUNCTIONS_sRGB_MALLETT2019
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];native=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';public=root/'public/profiles'
wl=np.arange(380,781,5);basis=MSDS_BASIS_FUNCTIONS_sRGB_MALLETT2019.values;ill=colour.SDS_ILLUMINANTS['D55'].copy().align(colour.SpectralShape(380,780,5)).values
filters={}
for path in (args.source/'src/spektrafilm/data/filters/colored/hoya').glob('*.csv'):
 raw=np.loadtxt(path,delimiter=',');raw=raw[np.unique(raw[:,0],return_index=True)[1]];filters['hoya_'+path.stem]=np.asarray(Akima1DInterpolator(raw[:,0],raw[:,1])(wl))
count=0
for path in public.glob('*.json'):
 if path.name=='catalog.json' or not (native/path.name).exists():continue
 p=json.loads(path.read_text());raw=json.loads((native/path.name).read_text());data=raw['data']
 if data.get('density_curves_model'):
  p['densityModel']=data['density_curves_model'];p['densityLayers']=data.get('density_curves_layers');p['baseSpectrum']=data['base_density'];p['wavelengths']=data['wavelengths']
 sensitivity=np.nan_to_num(10**np.asarray(data['log_sensitivity'],float));original=np.maximum(sensitivity.T@(ill[:,None]*basis),1e-20)
 responses={}
 for id,t in filters.items():
  filtered=sensitivity.T@(ill[:,None]*basis*t[:,None]);ratio=filtered/original
  matrix=np.asarray(p['rgbToFilm'])*ratio;gain=matrix.sum(axis=1)/np.maximum(np.asarray(p['rgbToFilm']).sum(axis=1),1e-20)
  responses[id]={'matrix':matrix.tolist(),'gain':gain.tolist()}
 p['takingFilters']=responses;p['monochrome']=raw['info']['channel_model']=='bw'
 path.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':'))+'\n');count+=1
print('Augmented',count,'browser profiles')
