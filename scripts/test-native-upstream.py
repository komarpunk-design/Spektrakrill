#!/usr/bin/env python3
"""Run the unchanged upstream parity table against our merged host engine."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1] / 'native-android'
p = argparse.ArgumentParser(__doc__)
p.add_argument('--build-dir', required=True, type=Path)
p.add_argument('--workers', type=int, default=2)
p.add_argument('--timeout', type=int, default=900)
p.add_argument('--results', type=Path, default=Path('/tmp/spektrafilm-native-parity'))
a = p.parse_args()
a.results.mkdir(parents=True, exist_ok=True)
cpp = root / 'engine/spektra-core/src/main/cpp'
asset = root / 'engine/spektra-core/src/main/assets/spektra'
variables = {'ASSET': asset, 'G': root / 'tools/parity/goldens', 'LUT': asset / 'luts/spectral_upsampling/irradiance_xy_tc.npy', 'CPP': cpp}
table = (root / 'tools/parity/run_engine_parity.sh').read_text().split('TESTS=(', 1)[1].split('\n)', 1)[0]
rows = []
for row in re.findall(r'^\s*"([^"]+)"', table, re.M):
    for key, value in variables.items():
        row = row.replace('$' + key, str(value))
    rows.append(row.split('|'))
def run(row):
    name, *args = row
    try:
        result = subprocess.run([str(a.build_dir.resolve() / name), *args], cwd=cpp,
            capture_output=True, text=True, timeout=a.timeout,
            env={**os.environ, 'SPK_NUM_THREADS': os.environ.get('SPK_NUM_THREADS', '2')})
        log, code = result.stdout + result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        log, code = 'TIMEOUT: test did not finish within the configured limit.\n', 124
    (a.results / (name + '.log')).write_text(log)
    print(('PASS ' if code == 0 else 'FAIL ') + name, flush=True)
    return name, code
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
    results = list(pool.map(run, rows))
(a.results / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
print(f'{sum(code == 0 for _, code in results)}/{len(results)} passed')
raise SystemExit(any(code != 0 for _, code in results))
