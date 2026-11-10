#!/usr/bin/env python3
"""Expose bundled film dye spectra to the browser output receiver.
Uses the licensed assets already shipped in Android, preserving their values;
no new profile or fitted film curve is introduced. See docs/OUTPUT_MODELS.md.
"""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
catalog=json.loads((root/'public/profiles/catalog.json').read_text());spectra={}
for meta in catalog['films']:
 path=root/'android/engine/spektra-core/src/main/assets/spektra/profiles'/f"{meta['id']}.json"
 if not path.exists():continue
 data=json.loads(path.read_text())['data']
 assert len(data['wavelengths'])==len(data['channel_density'])==len(data['base_density'])
 assert all(len(row)==3 for row in data['channel_density'])
 spectra[meta['id']]={'wavelengths':data['wavelengths'],'dyes':data['channel_density'],'base':data['base_density']}
(root/'public/profiles/scanner-spectra.json').write_text(json.dumps(spectra,separators=(',',':'))+'\n')
print('Copied spectra for',len(spectra),'bundled film profiles')
