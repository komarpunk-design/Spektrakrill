"""Regenerate C++ data or create exhaustive goldens using pinned upstream kernels.
Run with the NumPy oracle venv: check_tables.py --goldens /tmp/noritsu-goldens.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, sys
root = Path(__file__).resolve().parents[3]
source = root / 'docs/upstream/noritsu'
header = root / 'native-android/engine/spektra-core/src/main/cpp/model/noritsu_tables.h'
p = argparse.ArgumentParser(); p.add_argument('--generate', action='store_true'); p.add_argument('--goldens', type=Path); args = p.parse_args()
manifest = json.loads((source/'manifest.json').read_text())
for name, digest in manifest['files'].items():
    assert hashlib.sha256((source/name).read_bytes()).hexdigest() == digest, name
j = json.loads((source/'vendor_nega_135.json').read_text())
controls = j['variants']['g0_t1']['common_gamma_control_points']
arrays = [('uint16_t', 'film_lut', 4096, j['film_lut_rgb_u16']),
          ('uint16_t', 'tone_x', 20, [c['x_u16'] for c in controls]),
          ('int32_t', 'tone_y', 20, [c['y_i32'] for c in controls])]
data = ''
for dtype, name, width, rows in arrays:
    data += f'inline constexpr {dtype} {name}[3][{width}] = {{\n'
    for row in rows:
        assert len(row) == width
        data += ' {\n' + ',\n'.join('  '+','.join(map(str,row[i:i+24])) for i in range(0,width,24)) + '\n },\n'
    data += '};\n'
text = header.read_text(); begin = text.index('inline constexpr'); end = text.index('// Exact lane lookup:')
if args.generate: header.write_text(text[:begin] + data + '\n' + text[end:])
else: assert text[begin:end] == data + '\n', 'Run --generate to refresh header'
# U/O tables are literal data in the original vendor module.
import ast
nodes = {n.targets[0].id: n.value for n in ast.parse((source/'vendor.py').read_text()).body
         if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)}
ux = ast.literal_eval(nodes['UO_RAW_X'])
uy = [ux if isinstance(row, ast.Name) else ast.literal_eval(row) for row in nodes['UO_RAW_Y'].elts]
uo_text = "/* MIT (c) 2026 noritsu-tool contributors. Generated from vendor.py, pinned in manifest.json. */\n#pragma once\n#include <cstdint>\nnamespace spk::noritsu {\n"
uo_text += 'inline constexpr int64_t uo_x[47] = {' + ','.join(map(str, ux)) + '};\n'
uo_text += 'inline constexpr int64_t uo_y[4][47] = {\n' + ',\n'.join(' {'+','.join(map(str,row))+'}' for row in uy) + '\n};\n}\n'
uo_header = header.with_name('noritsu_uo_tables.h')
if args.generate: uo_header.write_text(uo_text)
else: assert uo_header.read_text() == uo_text, 'Regenerate U/O tables'
if args.goldens:
    import numpy as np
    spec = importlib.util.spec_from_file_location('noritsu_vendor',source/'vendor.py')
    vendor = importlib.util.module_from_spec(spec); sys.modules[spec.name] = vendor; spec.loader.exec_module(vendor)
    args.goldens.mkdir(parents=True, exist_ok=True)
    # Different lanes ensure BGR reordering errors are detected, too.
    codes = np.arange(4096, dtype=np.uint16)
    raw = np.stack([codes,4095-codes,(codes.astype(np.uint32)*7%4096).astype(np.uint16)],axis=-1)[None,:,:]
    vendor.apply_film_lut(raw, j['film_lut_rgb_u16']).astype('<u2').tofile(args.goldens/'film.bin')
    codes = np.arange(65536,dtype=np.uint16)
    image = np.stack([codes,codes,codes],axis=-1)[None,:,:]
    vendor.apply_gamma_controls_u16(image,[c['x_u16'] for c in controls],[c['y_i32'] for c in controls]).astype('<u2').tofile(args.goldens/'tone.bin')
    print('Original upstream kernels: 12,288 FilmLUT and 196,608 gamma samples generated')
print('Pinned upstream file hashes verified')
