"""Independent original-kernel oracle. ALL generated profiles are synthetic TEST fixtures,
not scanner calibrations. None is shipped in APK assets.
"""
from pathlib import Path
import sys,json,struct,types,copy
import numpy as np
from pack_job import source_module,chunks,SOURCE
vendor=source_module('vendor')
# Reuse the exact original identity-block fixture, not a fabricated OEM profile.
pkg=types.ModuleType('noritsu');pkg.__path__=[str(SOURCE)];sys.modules['noritsu']=pkg;sys.modules['noritsu.vendor']=vendor;sys.modules['noritsu.tables']=types.ModuleType('noritsu.tables')
tests=source_module('test_vendor')
path=Path(sys.argv[1]);path.mkdir(parents=True,exist_ok=True)
x=np.array(json.loads((SOURCE/'vendor_nega_135.json').read_text())['variants']['g0_t1']['common_gamma_control_points'][0]['x_u16'],dtype=np.uint16)
control_x=np.array([0,16,241,466,691,915,1140,1365,1590,1815,2056,2280,2505,2730,2955,3180,3404,3629,3854,4095],dtype=np.uint16)
control_y=np.array([0,1,15,29,43,57,71,85,99,113,128,142,156,170,184,198,212,226,240,255],dtype=np.uint8)
gamma=vendor.build_fused_gamma_luts_bgr_u16(np.tile(control_x,(3,1)),np.tile(control_y,(3,1)),[20]*3)
base=dict(schema=1,name='SYNTHETIC TEST ONLY',origin='synthetic-test',sourceSha256='0'*64,encoding='linear',outputBits=16,
 rgbToYcc=dict(matrix=list(vendor.LS600_G0_TYPE1_RGB_TO_YCC_Q10000),offsets=[0,0,0],counts=[20]*3,x=[x.tolist()]*3,y=[x.tolist()]*3),
 inverseMatrix=list(vendor.LS600_G0_TYPE1_YCC_TO_RGB_Q10000),gammaBgrHex=chunks(gamma[:,:4096].astype('<u2').tobytes()),
 yccCorrection=dict(yX=x.tolist(),y=x.tolist(),yCount=20,chromaX=x.tolist(),offsets=[[0]*20,[0]*20],scale=[1000]*20,chromaCount=20),
 autoContrast=dict(factor=2,size=5,strength=128,clamp=65535,quadrant=[1]*9,x=[0,10000,30000,50000,65535],y=[0,10000,30000,50000,65535],blend=[640]*4),saturation=100,balance=[0,0])
block=bytearray(tests.VendorKernelTests._film_sharp_identity_block());block[0]=3;struct.pack_into('<4h',block,2,1,2,3,20);struct.pack_into('<H',block,0x14,32)
# Exercise response, signed detail and all five convolution families.
for so,ko,stride,sc,size in [(0x2c,0x2e,7,0x90,13),(0x92,0x94,6,0xdc,11),(0xde,0xe0,5,0x112,5)]:
 block[so]=size;struct.pack_into('<h',block,ko+(size//2*stride+size//2)*2,8);struct.pack_into('<h',block,ko,-1);struct.pack_into('<H',block,sc,8)
struct.pack_into('<4H',block,0x118,16000,8192,8000,65535);struct.pack_into('<4H',block,0x120,1000,2000,500,10000);struct.pack_into('<Hh',block,0x150,4095,2047)
struct.pack_into('<10H',block,0x128,*np.linspace(0,65535,10,dtype=np.uint16));struct.pack_into('<10H',block,0x13c,*np.linspace(1024,65535,10,dtype=np.uint16));base['filmSharpHex']=chunks(bytes(block))
rng=np.random.default_rng(967);lattice=rng.integers(-80,81,(9,33,33,3),dtype=np.int16);base['hueLatticeHex']=chunks(lattice.astype('<i2').tobytes())
for case,(w,h,factor,saturation,kernel) in enumerate([(31,29,2,100,5),(32,40,2,0,5),(73,149,4,50,7),(84,156,6,200,9),(91,161,8,255,5)]):
 j=copy.deepcopy(base);a=j['autoContrast'];a.update(factor=factor,size=kernel,quadrant=[1]*((kernel//2+1)**2));j['saturation']=saturation
 if case==1:j['balance']=[-64,128]
 selected_gamma=gamma
 if case==1:
  selected_gamma=vendor.build_fused_gamma_luts_bgr(np.tile(control_x,(3,1)),np.tile(control_y,(3,1)),[20]*3).astype(np.uint16)*257
  j['outputBits']=8;j['gammaBgrHex']=chunks(selected_gamma[:,:4096].astype('<u2').tobytes())
 if case==2:j['encoding']='srgb'
 job=path/f'job{case}.json';job.write_text(json.dumps(j,separators=(',',':')))
 image=rng.integers(0,65536,(h,w,3),dtype=np.uint16);image[0,:4]=[[0,0,0],[65535,65535,65535],[65535,0,0],[0,65535,65535]]
 fwd=j['rgbToYcc'];lut=vendor.build_rgb_to_ycc_luts_u16(fwd['x'],fwd['y'],fwd['counts']);forward=vendor.apply_rgb_to_ycc_s1(image,fwd['matrix'],fwd['offsets'],lut)
 cc=j['yccCorrection'];cc_tables=vendor.build_ycc_correction_tables(cc['yX'],cc['y'],cc['yCount'],cc['chromaX'],cc['offsets'],cc['scale'],cc['chromaCount'])
 corrected=vendor.apply_ycc_correction(forward,*cc_tables);hue=vendor.apply_hue_saturation_s0(corrected,lattice,saturation,j['balance'])
 auto=lambda im:np.dstack([im[...,0],im[...,1],vendor.apply_auto_contrast_s0(im[...,2],np.array(a['quadrant'],dtype=np.int8).reshape(kernel//2+1,kernel//2+1),a['x'],a['y'],a['blend'],downsample_factor=factor,kernel_size=kernel,spatial_strength_u8=a['strength'],clamp_radius_u16=a['clamp'])])
 sharp=lambda im:vendor.apply_film_sharp_full_ycc(im,block,j['inverseMatrix'])
 pairs=[(image,forward),(forward,auto(forward)),(forward,sharp(forward)),(forward,corrected),(corrected,hue),(hue,vendor.apply_ycc_to_rgb_s0_variant1_u16(hue,j['inverseMatrix'],selected_gamma))]
 for stage,(src,expected)in enumerate(pairs):
  with (path/f'case{case}-stage{stage}.bin').open('wb')as f:f.write(struct.pack('<II',w,h));src.astype('<u2').tofile(f);expected.astype('<u2').tofile(f)
 chain=vendor.apply_ycc_to_rgb_s0_variant1_u16(vendor.apply_hue_saturation_s0(vendor.apply_ycc_correction(sharp(auto(forward)),*cc_tables),lattice,saturation,j['balance']),j['inverseMatrix'],selected_gamma)
 normalized=chain.astype(np.float64)/65535
 if j['encoding']=='srgb':normalized=np.where(normalized<=.04045,normalized/12.92,((normalized+.055)/1.055)**2.4)
 with(path/f'case{case}-full.bin').open('wb')as f:f.write(struct.pack('<II',w,h));image.astype('<u2').tofile(f);normalized.astype('<f4').tofile(f)
print('5 original-kernel test profiles; 30 isolated stages and 5 full pipelines. All profiles are synthetic, never production calibration.')
