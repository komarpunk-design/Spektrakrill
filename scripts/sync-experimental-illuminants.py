#!/usr/bin/env python3
"""Pin the reference illuminant library on its 81-band working grid."""
import argparse,ast,importlib.resources,json,sys,types,subprocess
from pathlib import Path
import numpy as np
import colour,scipy,scipy.interpolate
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);args=parser.parse_args();source=args.source.resolve();root=Path(__file__).resolve().parents[1]
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='28bf883e1672e884307edc75852549376e13644e'
module=types.ModuleType('spektrafilm');module.__path__=[str(source/'src/spektrafilm')];sys.modules['spektrafilm']=module
shape=colour.SpectralShape(380,780,5);env={'np':np,'colour':colour,'scipy':scipy,'pkg_resources':importlib.resources,'SPECTRAL_SHAPE':shape}
io=ast.parse((source/'src/spektrafilm/utils/io.py').read_text());exec(compile(ast.Module(body=[n for n in io.body if isinstance(n,ast.FunctionDef) and n.name=='load_filter'],type_ignores=[]),'reference-io.py','exec'),env)
cf=ast.parse((source/'src/spektrafilm/model/color_filters.py').read_text());exec(compile(ast.Module(body=[n for n in cf.body if isinstance(n,ast.ClassDef) and n.name=='GenericFilter'],type_ignores=[]),'reference-filter.py','exec'),env)
env['schott_kg3_heat_filter']=env['GenericFilter'](name='KG3',filter_type='heat_absorbing',brand='schott');env['generic_lens_transmission']=env['GenericFilter'](name='canon_24_f28_is',filter_type='lens_transmission',brand='canon',data_in_percentage=True)
ill=ast.parse((source/'src/spektrafilm/model/illuminants.py').read_text());exec(compile(ast.Module(body=[n for n in ill.body if isinstance(n,ast.FunctionDef) and n.name in ['standard_illuminant','black_body_spectrum']],type_ignores=[]),'reference-illuminants.py','exec'),env)
names=sorted(set(colour.SDS_ILLUMINANTS)|set(colour.SDS_LIGHT_SOURCES)|{'T','K75P','TH-KG3','TH-KG3-L'})
lines=['// GPLv3 / CC BY-SA 4.0. Spektrafilm experimental @28bf883, standard_illuminant.','#pragma once','#include <cstring>','namespace spk {','struct NamedScanSpectrum { const char* name; double values[81]; double matrices[6][9]; };','inline const NamedScanSpectrum scan_spectra[]={']
for name in names:
 spectrum=env['standard_illuminant'](name);assert np.isfinite(spectrum).all(),name
 cmfs=colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'].copy().align(shape).values
 white=colour.XYZ_to_xy(spectrum@cmfs)
 spaces=['sRGB','Adobe RGB (1998)','ProPhoto RGB','ITU-R BT.2020','ACES2065-1','sRGB']
 matrices=[colour.XYZ_to_RGB(np.eye(3),colourspace=cs,illuminant=white,apply_cctf_encoding=False).T.reshape(-1) for cs in spaces]
 lines.append('{'+json.dumps(name)+',{'+','.join(format(float(v),'.17g') for v in spectrum)+'},{'+','.join('{'+','.join(format(float(v),'.17g') for v in matrix)+'}' for matrix in matrices)+'}},')
lines+=['};','inline const NamedScanSpectrum* named_scan_spectrum(const char* name){for(const auto& value:scan_spectra)if(std::strcmp(value.name,name)==0)return &value;return nullptr;}','inline const double* scan_spectrum(const char* name){for(const auto& value:scan_spectra)if(std::strcmp(value.name,name)==0)return value.values;return nullptr;}','}']
(root/'android/engine/spektra-core/src/main/cpp/model/experimental_illuminants.h').write_text('\n'.join(lines)+'\n')
(root/'src/lib/film/experimental-illuminants.json').write_text(json.dumps(names,ensure_ascii=False,indent=2)+'\n');print('Pinned',len(names),'scan illuminants')
