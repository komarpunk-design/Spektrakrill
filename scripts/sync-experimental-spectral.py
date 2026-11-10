#!/usr/bin/env python3
"""Pin spectral reconstruction assets and CAT16 projections from experimental.
Requires numpy/colour in the oracle venv; use --source <checkout>.
These are physical spectra bases, not creative look transforms.
"""
import argparse,hashlib,json,shutil,tomllib
from pathlib import Path
import numpy as np
import colour
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];source=args.source/'src/spektrafilm/data/luts/spectral_upsampling';dest=root/'android/engine/spektra-core/src/main/assets/spektra/luts/experimental';dest.mkdir(parents=True,exist_ok=True)
manifest=[]
for path in sorted(source.glob('*.toml')):
 d=tomllib.loads(path.read_text());f=source/d['file'];target=dest/(d['identifier']+'.npy');shutil.copyfile(f,target);manifest.append({'id':d['identifier'],'kind':d['kind'],'file':target.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'shape':list(np.load(f,mmap_mode='r').shape)})
(root/'docs/upstream/experimental/spectral-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
lines=['// GPLv3 / CC BY-SA 4.0. Generated from spektrafilm experimental @28bf883.','#pragma once','namespace spk {']
shape=colour.SpectralShape(380,780,5);cmfs=colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'].copy().align(shape).values
for name,spectrum in [('D55',colour.SDS_ILLUMINANTS['D55']),('D65',colour.SDS_ILLUMINANTS['D65']),('T',colour.SDS_LIGHT_SOURCES['Incandescent'])]:
 values=spectrum.copy().align(shape).values;xy=colour.XYZ_to_xy(values@cmfs)
 lines.append('inline constexpr double experimental_spd_'+name+'[81]={'+','.join(format(float(x),'.17g') for x in values)+'};')
 lines.append('inline constexpr double experimental_xy_'+name+'[2]={'+','.join(format(float(x),'.17g') for x in xy)+'};')
 for id,space in [('prophoto','ProPhoto RGB'),('srgb','sRGB')]:
  matrix=colour.RGB_to_XYZ(np.eye(3),colourspace=space,illuminant=xy,apply_cctf_decoding=False,chromatic_adaptation_transform='CAT16').T
  lines.append('inline constexpr double experimental_'+id+'_'+name+'[9]={'+','.join(format(float(x),'.17g') for x in matrix.flat)+'};')
lines.append('}')
(root/'android/engine/spektra-core/src/main/cpp/model/experimental_projection.h').write_text('\n'.join(lines)+'\n')
print('Pinned',len(manifest),'spectral bases and CAT16 projections')
