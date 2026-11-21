"""Reproduce the compiled Nikonlook-v2 numeric model from pinned upstream JSON."""
from pathlib import Path
import json,hashlib,argparse
root=Path(__file__).resolve().parents[3]
src=root/'docs/upstream/nikon'
manifest=json.loads((src/'sources.json').read_text())
for n,h in manifest['files'].items():assert hashlib.sha256((src/n).read_bytes()).hexdigest()==h,n
m=json.loads((src/'model.json').read_text());a=json.loads((src/'layer_a.json').read_text());b=a['blind_fallback']
def array(name,data):
    shape=f'[{len(data)}][{len(data[0])}]' if isinstance(data[0],list) else '[]'
    return 'inline constexpr double '+name+shape+' = '+json.dumps(data).replace('[','{').replace(']','}')+';\n'
s='/* Generated from unchanged MIT-licensed Nikonlook-v2 data. See docs/upstream/nikon. */\n#pragma once\nnamespace spk::nikon::data {\n'+array('matrix',m['M'])
for c,v in enumerate(m['curves']):s+=array('x'+str(c),v['grid_x'])+array('y'+str(c),v['grid_y'])
for k in ['feature_mean','feature_scale','log_gain_intercept','coefficients']:s+=array(k,b[k])
s+=array('reference_gain',a['metadata_estimator']['reference_gain'])+array('gain_bounds',b['gain_bounds'])
s+=f'inline constexpr int stride={b["sample_stride"]};\ninline constexpr double railLow={b["rail_lo_fraction"]},railHigh={b["rail_hi_fraction"]};\n'+'}\n'
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
target=root/'native-android/engine/spektra-core/src/main/cpp/model/nikon_data.h'
if args.check:assert target.read_text()==s,'Regenerate Nikon model'
else:target.write_text(s)
print('Nikon model matches unchanged upstream JSON')
