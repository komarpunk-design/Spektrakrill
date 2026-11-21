"""Embed the same declared factory-reference profile used by Android's UI. No OEM code."""
from pathlib import Path
import argparse
import hashlib

root = Path(__file__).resolve().parents[3]
asset = root / "native-android/app/src/main/assets/lab/noritsu-factory-experimental.json"
target = root / "native-android/engine/spektra-core/src/main/cpp/model/noritsu_factory_data.h"
data = asset.read_text().strip()
assert ')NSFACTORY"' not in data
header = f'''/* Generated functional factory parameters; no OEM executable payload.
 * Synthetic neutral reference, not a physical scanner calibration. GPLv3 adapter.
 * Asset SHA-256: {hashlib.sha256(asset.read_bytes()).hexdigest()}
 * Regenerate: python3 native-android/tools/noritsu/generate_factory_data.py
 */
#pragma once
namespace spk::noritsu::factory_data {{
inline constexpr const char* id = "ls600-g0t1-neutral-v1";
inline constexpr const char* json = R"NSFACTORY({data})NSFACTORY";
}}
'''
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check',action='store_true')
args=parser.parse_args()
if args.check:
    assert target.read_text()==header, "Native profile differs from Android asset; regenerate it"
else:
    target.write_text(header)
print("Factory profile asset/native data match")
