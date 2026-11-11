#!/usr/bin/env python3
"""Copy Fotufilm's inferred optical constructions (CC BY-SA 4.0) without changing film profiles."""
import argparse,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];source=a.source
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='b9049f3e8897a51ab8f917edb39f023cb340d2e2'
def normalized(s):return re.sub('[^a-z0-9]','',s.lower())
models={};names={}
for file in sorted((source/'Sources/FotufilmCore/Stocks').glob('*.json')):
 data=json.loads(file.read_text())
 if data.get('layeredTransport'):models[file.stem]=data['layeredTransport'];names[file.stem]=data['name']
aliases={'portra400':['portra400'],'gold200':['gold200'],'ektar100':['ektar100'],'ektachromee100':['ektachromee100'],'provia100f':['provia100f'],'velvia50':['velvia50'],'cinestill800t':['cinestill800t'],'cinestill400d':['cinestill400d'],'hp5plus400':['hp5plus'],'fp4plus125':['fp4plus'],'trix400':['trix400'],'tmax100':['tmax100'],'doublex5222':['doublex'],'delta3200':['delta3200'],'acros100':['acros'],'aerocolor2460':['aerocolor2460'],'aerochrome1443':['aerochrome1443'],'infraredcolor':['infraredcolor'],'f64d':['f64d'],'vision250d':['vision3250d'],'vision500t':['vision3500t'],'reala500d':['reala500d'],'reala100':['reala100'],'ultramax400':['ultramax400'],'c200':['fujifilmc200'],'pro400h':['pro400h'],'pro160ns':['pro160ns'],'superia200':['superia200'],'superia400':['superiaxtra400','superia400'],'phoenix200':['phoenix200'],'verita200d':['verita200d'],'lomochromepurple':['lomochromepurple'],'lomochrometurquoise':['lomochrometurquoise'],'lomochromemetropolis':['lomochromemetropolis'],'lomocolor100':['lomographycolornegative100'],'kodachrome25':['kodachrome25'],'kodachrome64':['kodachrome64'],'kodachrome200':['kodachrome200'],'agfachrome50':['agfachrome50'],'agfachrome100':['agfachrome100'],'agfachrome200':['agfachrome200'],'astia100f':['astia100f'],'eterna500':['eterna500t'],'eternavivid500':['eternavivid500']}
films={};catalog=json.loads((root/'public/profiles/catalog.json').read_text())
for meta in catalog['films']:
 key=normalized(meta['id'])
 for model,patterns in aliases.items():
  if any(s in key for s in patterns):films[meta['id']]=model;break
payload={'source':'https://github.com/DhaliwalX/fotufilm-engine','commit':'b9049f3e8897a51ab8f917edb39f023cb340d2e2','license':'CC BY-SA 4.0 · Fotufilm / MUAStudio Inc. · https://fotufilm.com','models':models,'films':films}
(root/'src/lib/film/layered-transport-data.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
lines=['// CC BY-SA 4.0. Fotufilm / MUAStudio Inc. https://fotufilm.com; copied inferred constructions.','#pragma once','#include <string>','#include <unordered_map>','namespace spk { namespace transport {','inline const char* construction_json(const std::string& film) {',' static const std::unordered_map<std::string,std::string> films={']
lines += ['{'+json.dumps(k)+','+json.dumps(v)+'},' for k,v in films.items()];lines+=[' };',' static const std::unordered_map<std::string,const char*> models={']
lines+=['{'+json.dumps(k)+',R"SPK('+json.dumps(v,separators=(',',':'))+')SPK"},' for k,v in models.items()];lines+=[' };',' auto it=films.find(film);if(it==films.end())return nullptr;return models.at(it->second);','}','}}']
(root/'android/engine/spektra-core/src/main/cpp/model/layered_transport_data.h').write_text('\n'.join(lines)+'\n')
docs=root/'docs/upstream/fotufilm-transport';docs.mkdir(parents=True,exist_ok=True)
for name in ['LICENSE','licenses/FILM-PROFILES.txt','licenses/CC-BY-SA-4.0.txt','Sources/FotufilmCore/LayeredTransport.swift','Sources/FotufilmCore/HalationModel.swift','Sources/FotufilmCore/TransportKernelCompiler.swift','docs/layered-transport.md','Tests/FotufilmCoreTests/LayeredTransportTests.swift']:(docs/Path(name).name).write_bytes((source/name).read_bytes())
print(len(models),'original inferred constructions;',len(films),'matched bundled profiles; remaining use named illustrative fallback')
