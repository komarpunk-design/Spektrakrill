"""Exercise the complete PCB/COM packer with synthetic data; no OEM calibration.
Run after advanced_oracle.py: python test_pack_job.py /tmp/noritsu967-oracle
"""
from pathlib import Path
import json, struct, sys, tempfile, unittest
from pack_job import pack, source_module

class PackJobTest(unittest.TestCase):
    def test_original_decoders_and_both_output_depths(self):
        fixture=json.loads((Path(sys.argv[1])/'job0.json').read_text())
        pcb=source_module('pcb');vendor=source_module('vendor')
        raw=bytearray(pcb.FINAL_PCB_SIZE)
        for offset,value in [(0x1e,2),(0x1f,1),(0x21,1),(0x22,1),(0x23,1),(0x26,1)]:raw[offset]=value
        def words(offset,values):struct.pack_into('<'+'H'*len(values),raw,offset,*[v&65535 for v in values])
        f=fixture['rgbToYcc'];base=pcb.RGB_TO_YCC_OFFSET
        words(base,f['matrix']);words(base+0x12,f['offsets']);raw[base+0x18:base+0x1b]=bytes(f['counts'])
        for c in range(3):words(base+0x1c+40*c,f['x'][c]);words(base+0x94+40*c,f['y'][c])
        base=pcb.AUTO_CONTRAST_OFFSET;a=fixture['autoContrast'];raw[base]=a['factor'];raw[base+1]=a['size']
        for row in range(3):raw[base+2+8*row:base+5+8*row]=bytes(a['quadrant'][row*3:row*3+3])
        raw[base+0x42]=a['strength'];words(base+0x44,[a['clamp']]);words(base+0x46,a['x'][1:4]);words(base+0x4c,a['y'][1:4]);words(base+0x52,a['blend'])
        sharp=bytes.fromhex(''.join(fixture['filmSharpHex']));offset=vendor.FILM_SHARP_PARAMETER_PCB_OFFSET;raw[offset:offset+len(sharp)]=sharp
        base=pcb.YCC_CORRECTION_OFFSET;c=fixture['yccCorrection'];words(base,c['yX']);words(base+0x28,c['y']);raw[base+0x50]=c['yCount'];raw[base+0x51]=c['chromaCount'];words(base+0x52,c['chromaX']);words(base+0x7a,c['offsets'][0]);words(base+0xa2,c['offsets'][1]);words(base+0xca,c['scale'])
        base=pcb.HUE_SATURATION_OFFSET;raw[base]=fixture['saturation'];words(base+2,fixture['balance'])
        words(pcb.YCC_TO_RGB_OFFSET,fixture['inverseMatrix']);base=pcb.FUSED_GAMMA_OFFSET
        # Synthetic monotone gamma controls, not a device calibration.
        x=[round(i*4095/19) for i in range(20)];y=[round(i*255/19) for i in range(20)]
        raw[base:base+3]=bytes([20]*3)
        for ch in range(3):words(base+4+ch*40,x);raw[base+0x7c+ch*20:base+0x90+ch*20]=bytes(y)
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);p=d/'synthetic.pcb';p.write_bytes(raw);l=d/'synthetic.com';l.write_bytes(bytes.fromhex(''.join(fixture['hueLatticeHex'])))
            for depth in [8,16]:
                result=pack(p,l,'srgb',depth,'SYNTHETIC PACKER TEST ONLY')
                self.assertEqual(depth,result['outputBits']);self.assertEqual(fixture['filmSharpHex'],result['filmSharpHex']);self.assertEqual(fixture['hueLatticeHex'],result['hueLatticeHex']);self.assertEqual(f['matrix'],result['rgbToYcc']['matrix'])
                self.assertEqual(24576,len(bytes.fromhex(''.join(result['gammaBgrHex']))));self.assertTrue(all(len(v)<=4096 for k in ['gammaBgrHex','filmSharpHex','hueLatticeHex'] for v in result[k]))
                # Output is test data, even though the normal packer marks captured inputs.
                result['origin']='synthetic-test';(Path(sys.argv[1])/f'packed{depth}.json').write_text(json.dumps(result,separators=(',',':')))
            result=pack(p,None,'linear',16,'SYNTHETIC TEST WITHOUT LATTICE')
            self.assertNotIn('hueLatticeHex',result)
            raw[0x1f]=2;p.write_bytes(raw)
            with self.assertRaises(ValueError):pack(p,l,'linear',16,'unsupported AutoContrast selector')
            raw[0x1f]=1;raw[0x23]=0;p.write_bytes(raw)
            with self.assertRaises(ValueError):pack(p,l,'linear',16,'inactive Hue/Saturation')
            raw[0x1e]=0;p.write_bytes(raw)
            with self.assertRaises(ValueError):pack(p,l,'linear',16,'unsupported selector')

if __name__=='__main__':unittest.main(argv=[sys.argv[0]])
