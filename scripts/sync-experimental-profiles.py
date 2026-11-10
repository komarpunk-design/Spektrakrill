#!/usr/bin/env python3
"""Convert pinned experimental profiles to the existing Android working format.
Use the oracle venv (numpy/scipy/numba/colour), --source /path/to/spektrafilm.
No profile fitting or invented development times: select_development_time and
refresh_density_curves_from_model come directly from the reference checkout.
"""
import argparse, copy, hashlib, json, re, subprocess, sys, types
from pathlib import Path
import numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);args=parser.parse_args()
source=args.source.resolve();root=Path(__file__).resolve().parents[1]
sha=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
assert sha=='28bf883e1672e884307edc75852549376e13644e',sha
# Load computational modules without importing the GUI/RAW image-I/O front end.
pkg=types.ModuleType('spektrafilm');pkg.__path__=[str(source/'src/spektrafilm')];sys.modules['spektrafilm']=pkg
for sub in ['utils','model','runtime']:
 module=types.ModuleType('spektrafilm.'+sub);module.__path__=[str(source/'src/spektrafilm'/sub)];sys.modules['spektrafilm.'+sub]=module
from spektrafilm.data.profiles_loader import load_profile, profile_to_dict
from spektrafilm.model.density_curves import refresh_density_curves_from_model,select_development_time
public=root/'public/profiles';native=root/'android/engine/spektra-core/src/main/assets/spektra/profiles'
catalog=json.loads((public/'catalog.json').read_text());catalog['films']=[x for x in catalog['films'] if not x['id'].startswith('exp_')];catalog['papers']=[x for x in catalog['papers'] if not x['id'].startswith('exp_')]
manifest={'repository':'https://github.com/andreavolpato/spektrafilm','ref':'experimental','commit':sha,'profiles':[]};families=[]
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
 if isinstance(x,(np.ndarray,list,tuple)):return [clean(v) for v in x]
 if isinstance(x,(float,np.floating)):return float(x) if np.isfinite(x) else None
 if isinstance(x,np.integer):return int(x)
 return x
for path in sorted((source/'src/spektrafilm/data/profiles').rglob('*.json')):
 original=load_profile(path.stem);times=original.data.development_time
 choices=[None] if times is None else [float(x) for x in times]
 members=[]
 for time in choices:
  p=copy.deepcopy(original);refresh_density_curves_from_model(p.data,p.info.type);select_development_time(p.data,time)
  suffix='' if time is None else '_'+str(time).replace('.','p').rstrip('0').rstrip('p')+'min'
  id='exp_'+path.stem+suffix
  members.append({'id':id,'minutes':time})
  payload=profile_to_dict(p);data=payload['data'];info=payload['info'];info['experimental_source']=sha
  # Native has three working channels; BW source tables/models are replicated,
  # never independently fitted. Its monochrome flag keeps output achromatic.
  for key in ['log_sensitivity','channel_density','density_curves']:
   a=np.asarray(data[key]);data[key]=(np.repeat(a,3,axis=-1)/(3 if key=='channel_density' else 1)) if a.shape[-1]==1 else a
  a=np.asarray(data.get('density_curves_layers'))
  if a.ndim==3 and a.shape[-1]==1:data['density_curves_layers']=np.repeat(a,3,axis=-1)
  model=data.get('density_curves_model')
  if model:
   for k in ['centers','amplitudes','sigmas','alphas']:
    if model.get(k) is not None:
     a=np.asarray(model[k]);model[k]=np.repeat(a,3,axis=0) if a.shape[0]==1 else a
  for optional in ['hanatos2025_adaptation_window_params','hanatos2025_adaptation_surface_params','density_curves_layers']:
   if data.get(optional) is None:data.pop(optional,None)
  payload=clean(payload);(native/(id+'.json')).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
  old=public/(path.stem+'.json');fallback=public/('kodak_trix_400.json' if p.info.channel_model=='bw' else 'kodak_portra_400.json')
  if not fallback.exists():fallback=public/'kodak_portra_400.json'
  base=json.loads((old if old.exists() else fallback).read_text());curves=np.asarray(data['density_curves'],float)
  name=p.info.name+(f' · {time:g} мин' if time is not None else '')
  iso=base.get('iso');m=re.search(r'(?:_|\s)(\d{2,4})(?:_|\s|$)',path.stem)
  if iso is None and m:iso=int(m.group(1))
  meta=dict(id=id,name=name,type=p.info.type,support=p.info.support,stage=p.info.stage,use=p.info.use,antihalation=p.info.antihalation,targetPrint=p.info.target_print,iso=iso,referenceIlluminant=p.info.reference_illuminant,experimental=True)
  base.update(meta);base.update(densityCurves=curves.tolist(),logExposure={'min':float(p.data.log_exposure[0]),'max':float(p.data.log_exposure[-1]),'n':len(p.data.log_exposure)},dmin=np.nanmin(curves,axis=0).tolist(),dmax=np.nanmax(curves,axis=0).tolist(),densityModel=payload['data'].get('density_curves_model'),baseSpectrum=payload['data']['base_density'],wavelengths=payload['data']['wavelengths'],sourceCommit=sha,sourceStock=path.stem)
  base['baseRgbOd']=np.interp([650,555,460],p.data.wavelengths,p.data.base_density).tolist();base['license']=payload.get('metadata',{}).get('copyright','CC BY-SA 4.0 — Andrea Volpato')
  (public/(id+'.json')).write_text(json.dumps(clean(base),ensure_ascii=False,separators=(',',':'))+'\n')
  catalog['films' if p.info.stage=='filming' else 'papers'].append(meta)
  manifest['profiles'].append({'id':id,'source':str(path.relative_to(source)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'minutes':time})
 if times is not None:families.append({'stock':path.stem,'name':original.info.name,'members':members})
(public/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'src/lib/film/experimental-families.json').write_text(json.dumps(families,ensure_ascii=False,indent=2)+'\n')
(root/'docs/upstream/experimental/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(root/'src/lib/film/experimental-profile-ids.json').write_text(json.dumps([p['id'] for p in manifest['profiles']],indent=2)+'\n')
print('Converted',len(manifest['profiles']),'profiles;',len(families),'development-time families')
