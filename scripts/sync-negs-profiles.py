#!/usr/bin/env python3
"""Import missing Negs profiles without overwriting existing stocks.
Pins Negs 26c903b; uses upstream fitted-model evaluation / time selection.
Data CC BY-SA 4.0, original metadata retained. See docs/NEGS_INTEGRATION.md.
"""
import argparse,copy,hashlib,json,re,subprocess,sys,tomllib,types,warnings
from pathlib import Path
import numpy as np
import colour
from colour.recovery import MSDS_BASIS_FUNCTIONS_sRGB_MALLETT2019
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--spectral-source',type=Path,required=True);args=p.parse_args();source=args.source.resolve();up=args.spectral_source.resolve();root=Path(__file__).resolve().parents[1]
sha=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip();assert sha=='26c903be9064b4fbfd46a8396620ba7e1e9bc1df'
for name in ['spektrafilm','spektrafilm.utils','spektrafilm.model','spektrafilm.runtime']:
 mod=types.ModuleType(name);mod.__path__=[str(up/'src'/Path(*name.split('.')))];sys.modules[name]=mod
from spektrafilm.data.profiles_loader import profile_from_dict,profile_to_dict
from spektrafilm.model.density_curves import refresh_density_curves_from_model,select_development_time
native=root/'android/engine/spektra-core/src/main/assets/spektra/profiles';public=root/'public/profiles';catalog=json.loads((public/'catalog.json').read_text());catalog['films']=[x for x in catalog['films'] if not x['id'].startswith('negs_')];catalog['papers']=[x for x in catalog['papers'] if not x['id'].startswith('negs_')]
grains=tomllib.loads((source/'data/presets/grain.toml').read_text());dirs=tomllib.loads((source/'data/presets/couplers.toml').read_text());manifest={'repository':'https://github.com/noahhaasis/negs','commit':sha,'profiles':[]};families=[];presets={};shape=colour.SpectralShape(380,780,5);wl=np.arange(380,781,5);cmfs=colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'].copy().align(shape).values
basis=MSDS_BASIS_FUNCTIONS_sRGB_MALLETT2019.values
iso_map={'kodak_aerocolor_2460':125,'kodak_aerochrome_1443':400,'fujifilm_f64d':64,'ilford_hp5_plus':400,'ilford_fp4_plus':125,'kodak_trix400_d76_8min':400,'fotufilm_infrared_color':None}
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
 if isinstance(x,(list,tuple,np.ndarray)):return [clean(v) for v in x]
 if isinstance(x,(float,np.floating)):return float(x) if np.isfinite(x) else None
 if isinstance(x,np.integer):return int(x)
 return x
for path in sorted((source/'data/profiles').glob('*.json')):
 if (native/path.name).exists():continue
 raw=json.loads(path.read_text())
 with warnings.catch_warnings():warnings.simplefilter('ignore');original=profile_from_dict(raw)
 times=original.data.development_time;choices=[None] if times is None else [float(t) for t in times];members=[]
 for time in choices:
  profile=copy.deepcopy(original);refresh_density_curves_from_model(profile.data,profile.info.type);select_development_time(profile.data,time);payload=profile_to_dict(profile);payload['metadata']=raw['metadata'];d=payload['data'];info=payload['info'];info['experimental_source']='negs:'+sha;info['negs_source']=sha
  suffix='' if time is None else '_'+format(time,'g').replace('.','p')+'min';id='negs_'+path.stem+suffix;estimated=time in raw['metadata'].get('estimated_development_times',[]);members.append({'id':id,'minutes':time,'estimated':estimated})
  for k in ['log_sensitivity','channel_density','density_curves']:
   a=np.asarray(d[k]);d[k]=np.repeat(a,3,axis=-1)/(3 if k=='channel_density' else 1) if a.shape[-1]==1 else a
  layers=d.get('density_curves_layers')
  if layers is not None:
   a=np.asarray(layers);d['density_curves_layers']=np.repeat(a,3,axis=-1) if a.shape[-1]==1 else a
  for k in ['centers','amplitudes','sigmas','alphas']:
   if d['density_curves_model'].get(k) is not None:
    a=np.asarray(d['density_curves_model'][k]);d['density_curves_model'][k]=np.repeat(a,3,axis=0) if a.shape[0]==1 else a
  for k in ['density_curves_layers','hanatos2025_adaptation_window_params','hanatos2025_adaptation_surface_params']:
   if d.get(k) is None:d.pop(k,None)
  (native/(id+'.json')).write_text(json.dumps(clean(payload),ensure_ascii=False,separators=(',',':'))+'\n')
  bw=info['channel_model']=='bw';curves=np.asarray(d['density_curves']);name=info['name'].replace(' (creative)','').replace(' (infrared)','').replace(' (experimental)','')+(f' · {time:g} мин'+(' ≈' if estimated else '') if time is not None else '')
  approximate=bool(raw['metadata'].get('approximate'));creative=path.stem=='fotufilm_infrared_color';iso=iso_map.get(path.stem)
  if path.stem not in iso_map:
   nums=re.findall(r'(\d+)',path.stem);iso=int(nums[-1]) if nums and info['stage']=='filming' else None
  meta=dict(id=id,name=name,type=info['type'],support=info['support'],stage=info['stage'],use=info['use'],antihalation=info.get('antihalation','strong'),targetPrint=info.get('target_print'),iso=iso,referenceIlluminant=info['reference_illuminant'],negs=True,approximate=approximate,creative=creative,estimatedDevelopment=estimated)
  # Browser is reduced RGB. Derive its matrices from this stock, never a donor stock.
  illum=(colour.colorimetry.blackbody_spectral_radiance(wl*1e-9,float(info['reference_illuminant'][2:])) if info['reference_illuminant'].startswith('BB') else colour.SDS_ILLUMINANTS['D55'].copy().align(shape).values);illum=illum/np.mean(illum)
  sensitivity=np.nan_to_num(10**np.asarray(d['log_sensitivity'],float));rgb_to_film=sensitivity.T@(illum[:,None]*basis);rgb_to_film/=np.maximum(rgb_to_film.sum(axis=1)[:,None],1e-20)
  dyes=np.asarray(d['channel_density'],float);dyes_rgb=np.stack([np.interp([650,555,460],wl,np.nan_to_num(dyes[:,c])) for c in range(3)],axis=1)
  browser={**meta,'viewingIlluminant':info['viewing_illuminant'],'logExposure':{'min':float(d['log_exposure'][0]),'max':float(d['log_exposure'][-1]),'n':len(curves)},'densityCurves':curves.tolist(),'dmin':curves.min(axis=0).tolist(),'dmax':curves.max(axis=0).tolist(),'rgbToFilm':rgb_to_film.tolist(),'dyeToRgb':dyes_rgb.tolist(),'baseRgbOd':np.interp([650,555,460],wl,np.array(d['base_density'],float)).tolist(),'densityCurvesModel':{'modelType':d['density_curves_model']['model_type'],**{k:d['density_curves_model'][k] for k in ['centers','amplitudes','sigmas']}},'densityModel':d['density_curves_model'],'densityLayers':d.get('density_curves_layers'),'baseSpectrum':d['base_density'],'wavelengths':d['wavelengths'],'monochrome':bw,'sourceStock':path.stem,'sourceCommit':sha,'license':raw['metadata']['license'],'provenance':raw['metadata'].get('datasource','')}
  (public/(id+'.json')).write_text(json.dumps(clean(browser),ensure_ascii=False,separators=(',',':'))+'\n');catalog['films' if info['stage']=='filming' else 'papers'].append(meta)
  group='bw' if bw else 'color';grain={**grains['defaults'][group][info['type']],**grains.get(path.stem,{})};coupler={**dirs['defaults'][group][info['type']]};
  if group=='color' and info['type']=='negative' and info['use']=='cine':coupler.update(coupler.get('cine',{}).get('tungsten' if info['reference_illuminant']=='T' or info['reference_illuminant'].startswith('BB') else 'daylight',{}))
  coupler.pop('cine',None);coupler.update(dirs.get(path.stem,{}));presets[id]={'grain':grain,'couplers':coupler,'monochrome':bw,'type':info['type'],'sourceStock':path.stem}
  manifest['profiles'].append({'id':id,'stock':path.stem,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'minutes':time,'estimatedDevelopment':estimated,'approximate':approximate,'creative':creative})
 if times is not None:families.append({'stock':path.stem,'name':info['name'],'members':members})
(public/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
for name,data in [('negs-presets.json',presets),('negs-families.json',families)]: (root/'src/lib/film'/name).write_text(json.dumps(clean(data),ensure_ascii=False,indent=2)+'\n')
docs=root/'docs/upstream/negs';docs.mkdir(parents=True,exist_ok=True);(docs/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for name in ['LICENSE','data/FOTUFILM_LICENSE.txt','data/CHANGELOG.txt','data/profile-sources/bw-expansion/README.md']:(docs/Path(name).name.replace('README.md','BW_SOURCES.md')).write_bytes((source/name).read_bytes().rstrip()+b'\n' if name=='data/FOTUFILM_LICENSE.txt' else (source/name).read_bytes())
(root/'android/engine/spektra-core/src/main/assets/spektra/filters/neutral_print_filters_negs.json').write_bytes((source/'data/filters/neutral_print_filters.json').read_bytes())
print('Imported',len(manifest['profiles']),'profiles /',len(set(p['stock'] for p in manifest['profiles'])),'stocks;',len(families),'time families')
# BB3200 is a genuine capture reference of three Negs stocks, not the measured T lamp.
spd=colour.colorimetry.blackbody_spectral_radiance(wl*1e-9,3200.);spd/=spd.mean();xy=colour.XYZ_to_xy(spd@cmfs)
lines=['// CC BY-SA 4.0 / GPLv3. Negs BB3200 spectral reference, CIE Planck constants.','#pragma once','namespace spk {']
for name,values in [('spd',spd),('xy',xy)]:lines.append('inline constexpr double negs_'+name+'_BB3200['+str(len(values))+']={'+','.join(format(float(x),'.17g') for x in values)+'};')
for name,space in [('prophoto','ProPhoto RGB'),('srgb','sRGB')]:
 matrix=colour.RGB_to_XYZ(np.eye(3),colourspace=space,illuminant=xy,apply_cctf_decoding=False,chromatic_adaptation_transform='CAT16').T
 lines.append('inline constexpr double negs_'+name+'_BB3200[9]={'+','.join(format(float(x),'.17g') for x in matrix.flat)+'};')
for name,a,b in [('to709','ProPhoto RGB','sRGB'),('from709','sRGB','ProPhoto RGB')]:
 src,dst=colour.RGB_COLOURSPACES[a],colour.RGB_COLOURSPACES[b]
 matrix=np.linalg.inv(dst.matrix_RGB_to_XYZ)@colour.adaptation.matrix_chromatic_adaptation_VonKries(colour.xy_to_XYZ(src.whitepoint),colour.xy_to_XYZ(dst.whitepoint),transform='Bradford')@src.matrix_RGB_to_XYZ
 lines.append('inline constexpr double negs_'+name+'[9]={'+','.join(format(float(x),'.17g') for x in matrix.flat)+'};')
lines+=['}'];(root/'android/engine/spektra-core/src/main/cpp/model/negs_projection.h').write_text('\n'.join(lines)+'\n')
