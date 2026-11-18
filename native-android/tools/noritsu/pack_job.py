"""Package captured PCB/COM data for Android; does not create missing calibration.
Requires NumPy. The caller explicitly declares output encoding and bit depth.
"""
from pathlib import Path
import argparse,importlib.util,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[3];SOURCE=ROOT/'docs/upstream/noritsu'
def source_module(name):
    for n,digest in json.loads((SOURCE/'manifest.json').read_text())['files'].items():
        assert hashlib.sha256((SOURCE/n).read_bytes()).hexdigest()==digest,n
    spec=importlib.util.spec_from_file_location('noritsu_job_'+name,SOURCE/(name+'.py'))
    m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m);return m
def chunks(data):
    text=data.hex();return [text[i:i+4096] for i in range(0,len(text),4096)]
def plain(d):return {k:(v.tolist() if hasattr(v,'tolist') else v)for k,v in d.items()}
def pack(path,lattice,encoding,bits,name):
    import numpy as np
    pcb=source_module('pcb');vendor=source_module('vendor');raw=Path(path).read_bytes()
    selectors=pcb.decode_effective_selectors(raw)
    if selectors['0x1e']!=2 or selectors['0x22']!=1 or selectors['0x26']!=1:raise ValueError('Only the supported S1 / YCC-correction / variant-1 job is accepted')
    if any(selectors[key] not in (0,1) for key in ('0x1f','0x21','0x23')):raise ValueError('Unsupported AutoContrast / FilmSharp / HueSat selector')
    if lattice and selectors['0x23']!=1:raise ValueError('A lattice was supplied, but Hue/Saturation S0 is not active in this PCB')
    f=pcb.decode_rgb_to_ycc_s1_parameters(raw);c=pcb.decode_ycc_correction_controls(raw);g=pcb.decode_ycc_to_rgb_gamma_controls(raw)
    build=vendor.build_fused_gamma_luts_bgr_u16 if bits==16 else vendor.build_fused_gamma_luts_bgr
    gamma=build(g['x_controls_rgb'],g['y_controls_rgb_u8'],g['counts_rgb'])
    if bits==8:gamma=gamma.astype(np.uint16)*257
    job=dict(schema=1,name=name,origin='capture',sourceSha256=hashlib.sha256(raw).hexdigest(),encoding=encoding,outputBits=bits,
      rgbToYcc=dict(matrix=f['matrix_q10000'].tolist(),offsets=f['input_offsets_rgb'].tolist(),counts=f['counts_rgb'].tolist(),x=f['x_controls_rgb'].tolist(),y=f['y_controls_rgb'].tolist()),
      inverseMatrix=g['matrix_q10000'].tolist(),gammaBgrHex=chunks(gamma[:,:4096].astype('<u2').tobytes()),
      yccCorrection=dict(yX=c['y_x_u16'].tolist(),y=c['y_values_q4_u16'].tolist(),yCount=c['y_count'],chromaX=c['chroma_x_u16'].tolist(),offsets=c['chroma_offsets_i16'].tolist(),scale=c['chroma_scale_u16'].tolist(),chromaCount=c['chroma_count']))
    if selectors['0x21']==1:
        block=raw[vendor.FILM_SHARP_PARAMETER_PCB_OFFSET:vendor.FILM_SHARP_PARAMETER_PCB_OFFSET+vendor.FILM_SHARP_PARAMETER_BLOCK_SIZE]
        vendor.decode_film_sharp_parameter_block(block);job['filmSharpHex']=chunks(block)
    if selectors['0x1f']==1:
        a=pcb.decode_auto_contrast_s0_parameters(raw);x,y=vendor.prepare_auto_contrast_s0_curve(a['inner_x_u16'],a['inner_y_u16'],a['extrapolation_slopes_q9'])
        job['autoContrast']=dict(factor=a['downsample_factor'],size=a['kernel_size'],strength=a['spatial_strength_u8'],clamp=a['clamp_radius_u16'],quadrant=a['kernel_quadrant_i8'].ravel().tolist(),x=x.tolist(),y=y.tolist(),blend=a['extrapolation_slopes_q9'].tolist())
    if lattice:
        h=pcb.decode_hue_saturation_s0_controls(raw);data=pcb.read_hue_saturation_lattice(lattice);job.update(hueLatticeHex=chunks(data.astype('<i2').tobytes()),saturation=h['saturation_u8'],balance=h['total_balance_i16'].tolist(),latticeSha256=hashlib.sha256(Path(lattice).read_bytes()).hexdigest())
    return job
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pcb',required=True,type=Path);p.add_argument('--lattice',type=Path);p.add_argument('--encoding',required=True,choices=['linear','srgb']);p.add_argument('--output-bits',required=True,type=int,choices=[8,16]);p.add_argument('--name',required=True);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
    a.output.write_text(json.dumps(pack(a.pcb,a.lattice,a.encoding,a.output_bits,a.name),ensure_ascii=False,separators=(',',':'))+'\n');print(a.output)
