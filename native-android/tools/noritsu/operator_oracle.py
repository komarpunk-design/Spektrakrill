"""Goldens from the pinned, unmodified noritsu-tool Python functions (NumPy).
The input bridge/identity job is explicitly Spektrafilm's operator adapter.
"""
from pathlib import Path
import importlib.util,sys,json,hashlib,struct
import numpy as np
root=Path(__file__).resolve().parents[3];source=root/'docs/upstream/noritsu'
for name,digest in json.loads((source/'manifest.json').read_text())['files'].items():
    assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest,name
def module(name):
    spec=importlib.util.spec_from_file_location('noritsu_'+name,source/(name+'.py'))
    m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m);return m
vendor=module('vendor');render=module('render')
j=json.loads((source/'vendor_nega_135.json').read_text());curves=j['variants']['g0_t1']['common_gamma_control_points'];x=np.array(curves[0]['x_u16'],dtype=np.int64)
y_sources=[x]+[np.array(c['y_i32'],dtype=np.int64) for c in curves]
cases=[(100,100,100,0,1,1,1,1,1),
 (50,100,100,0,1,1,1,1,1),(100,150,100,0,1,1,1,1,1),(100,100,250,0,1,1,1,1,1),
 (100,100,100,1,1,1,1,1,1),(100,100,100,2,1,1,1,1,1),(100,100,100,3,1,1,1,1,1),
 (100,100,100,0,.7,1,1,1,1),(100,100,100,0,1.7,1,1,1,1),
 (100,100,100,0,1,0,1,1,1),(100,100,100,0,1,2,1,1,1),
 (100,100,100,0,1,1,1.3,1,1),(100,100,100,0,1,1,1,1.3,1),(100,100,100,0,1,1,1,1,1.3),
 (50,130,250,2,.8,1.3,.9,1.2,1.1),(0,0,0,3,.2,0,.25,4,1),
 (300,300,300,1,3,2,4,.25,4)]
# Random ratio combinations catch signed truncation/anchor seam errors.
rng=np.random.default_rng(966)
for _ in range(16):cases.append((*rng.integers(0,301,3).tolist(),int(rng.integers(0,4)),1,1,1,1,1))
image=rng.random((1,512,3));image[0,:5]=[[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1]]
path=Path(sys.argv[1]);path.mkdir(parents=True,exist_ok=True);image.astype('<f8').tofile(path/'input.bin')
with (path/'operators.bin').open('wb') as f:
    f.write(struct.pack('<I',len(cases)))
    for low,mid,high,uo,gamma,sat,r,g,b in cases:
        f.write(struct.pack('<9d',low,mid,high,uo,gamma,sat,r,g,b))
        for y in y_sources:
            out,_=vendor.make_gamma_curve2(y,x,low,mid,high);out.astype('<i8').tofile(f)
            out,_=vendor.make_nega_tone2(y,x,0x5f00,0x5f00,uo,low,mid,high);out.astype('<i8').tofile(f)
        mapped,_=vendor.make_nega_tone2(x,x,0x5f00,0x5f00,uo,low,mid,high)
        ramp=np.repeat(np.arange(65536,dtype=np.uint16)[None,:,None],3,axis=-1)
        lut=vendor.apply_gamma_controls_u16(ramp,[x]*3,[mapped]*3)[0,:,0];lut.astype('<u2').tofile(f)
        out=image.astype(np.float32)
        gains=(r,g,b)
        if any(abs(v-1)>1e-4 for v in gains):out=render.white_balance(out,gains)
        if gamma!=1:out=render.gamma_curve(out,gamma)
        if (low,mid,high,uo)!=(100,100,100,0):
            codes=np.floor(np.clip(out.astype(np.float64),0,1)*65535+.5).astype(np.uint16)
            out=vendor.apply_gamma_controls_u16(codes,[x]*3,[mapped]*3).astype(np.float32)/np.float32(65535)
        if abs(sat-1)>1e-4:out=render.adjust_saturation(out,sat)
        np.clip(out,0,1).astype('<f4').tofile(f)
print(f'{len(cases)} original upstream operator cases, {len(cases)*65536} interpolation codes; SHA-256 source files verified')
