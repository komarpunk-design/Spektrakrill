"""Research harness for original local SpecialPcb calculations, never a fake table.
Unrecognized OS/CRT calls fail closed. No scanner hardware or private captures.
Only file/memory/diagnostic services are supplied by Python.
"""
from pathlib import Path
import hashlib, argparse
import struct, json, sys, collections
import pefile
from unicorn import *
from unicorn.x86_const import *

ROOT=Path('.')  # CLI source root; no vendor executable is distributed here.
class Machine:
 def __init__(self):
  dll=ROOT/'engine/ImageDataProc/SpecialPcb.dll'
  if hashlib.sha256(dll.read_bytes()).hexdigest()!='0241ff71b6da05dbccd65221d1f93e037a45d2ca8c142b500cb14b66ff303936':raise RuntimeError('Unsupported SpecialPcb.dll build')
  self.pe=pefile.PE(str(dll));self.u=Uc(UC_ARCH_X86,UC_MODE_32)
  self.base=self.pe.OPTIONAL_HEADER.ImageBase;size=(self.pe.OPTIONAL_HEADER.SizeOfImage+4095)&~4095
  self.u.mem_map(self.base,size);self.u.mem_write(self.base,self.pe.get_memory_mapped_image())
  self.u.mem_map(0,4096);self.u.mem_map(0x04000000,8*1024*1024);self.u.mem_map(0x30000000,96*1024*1024)
  self.heap=0x30000000;self.files={};self.mappings={};self.calls=collections.Counter();self.trace=collections.deque(maxlen=16)
  self.stub=0x0f000000;self.stop=0x0efff000;self.u.mem_map(self.stub,0x10000);self.u.mem_map(self.stop,4096);self.u.mem_write(self.stop,b'\xf4')
  self.imports={};self.stdcall={'PathCombineW':3,'PathIsDirectoryW':1,'PathFileExistsW':1,'IsBadWritePtr':2,'GetACP':0,'GetLastError':0,'InterlockedExchange':2,'InterlockedCompareExchange':3,'Sleep':1,'CopyRect':2,'GetSystemInfo':1,'GetFileSizeEx':2,'CloseHandle':1,'TlsGetValue':1,'TlsSetValue':2,'SetLastError':1}
  # Execute the bundled native math implementation as well: no host pow substitute.
  crtpath=next((ROOT/'runtime-crt').glob('msvcr80.dll.8.*'));
  if hashlib.sha256(crtpath.read_bytes()).hexdigest()!='9382aaed2db19cd75a70e38964f06c63f19f63c9dfb5a33b0c2d445bb41b6e46':raise RuntimeError('Unsupported native CRT build')
  crt=pefile.PE(str(crtpath));cb=crt.OPTIONAL_HEADER.ImageBase
  self.u.mem_map(cb,(crt.OPTIONAL_HEADER.SizeOfImage+4095)&~4095);self.u.mem_write(cb,crt.get_memory_mapped_image())
  math={e.name.decode():cb+e.address for e in crt.DIRECTORY_ENTRY_EXPORT.symbols if e.name in [b'_CIpow',b'floor',b'ceil']}
  self.u.hook_add(UC_HOOK_CODE,self.math_probe,begin=math['_CIpow'],end=math['_CIpow'])
  for module in [self.pe,crt]:
   for d in module.DIRECTORY_ENTRY_IMPORT:
    for entry in d.imports:
     name=entry.name.decode()if entry.name else '#'+str(entry.ordinal)
     if d.dll.lower()==b'msvcr80.dll'and name in math:self.w32(entry.address,math[name]);continue
     address=self.stub+len(self.imports)*16;self.imports[address]=(d.dll.decode(),name)
     pop=self.stdcall.get(name,0)*4;self.u.mem_write(address,b'\xc2'+struct.pack('<H',pop)if pop else b'\xc3');self.w32(entry.address,address)
  # Single-thread CRT runtime state: the source calloc size is 0x214.
  # These are OS/CRT fields, never scanner/calibration inputs. The CRT's
  # pointer-getter cache and PTD slots replace DLL-load process initialization.
  ptd=self.alloc(0x214);self.w32(ptd,1);self.w32(ptd+4,0xffffffff);self.w32(ptd+0x14,1)
  self.w32(ptd+0x5c,cb+0x91958);self.w32(ptd+0x68,cb+0x913d8);self.w32(ptd+0x70,1)
  getter=next(a for a,(_,n)in self.imports.items()if n=='TlsGetValue')
  self.tls={0:ptd,1:getter};self.last_error=0;self.w32(cb+0x8f1f0,0);self.w32(cb+0x8f1f4,1)
  self.u.hook_add(UC_HOOK_CODE,self.import_call,begin=self.stub,end=self.stub+0xffff)
  self.u.hook_add(UC_HOOK_MEM_INVALID,self.invalid)
  self.u.hook_add(UC_HOOK_MEM_READ|UC_HOOK_MEM_WRITE,self.low_access,begin=0,end=4095)
  self.u.hook_add(UC_HOOK_BLOCK,lambda u,a,n,data:self.trace.append(a))
  self.empty=self.alloc(4)
  # This export provides a diagnostic directory, not numerical parameters.
  self.u.hook_add(UC_HOOK_CODE,self.log_directory,begin=self.base+0x10d610,end=self.base+0x10d610)
  self.u.reg_write(UC_X86_REG_FPCW,0x027f)
  self.u.reg_write(UC_X86_REG_FPTAG,0xffff)
  self.u.reg_write(UC_X86_REG_FPSW,0)
  self.u.reg_write(UC_X86_REG_MXCSR,0x1f80)
 def read(self,p,n):return bytes(self.u.mem_read(p,n))
 def u32(self,p):return struct.unpack('<I',self.read(p,4))[0]
 def w32(self,p,n):self.u.mem_write(p,struct.pack('<I',n&0xffffffff))
 def alloc(self,n):
  p=self.heap;self.heap=(p+n+15)&~15
  if self.heap>0x36000000:raise RuntimeError('research heap exhausted')
  return p
 def cstr(self,p,wide=False):
  out=bytearray();size=2 if wide else 1
  for i in range(32768):
   b=self.read(p+i*size,size)
   if not any(b):return out.decode('utf-16-le'if wide else'utf-8',errors='replace')
   out.extend(b)
  raise RuntimeError('unterminated native string')
 def string(self,s,wide=False):
  b=s.encode('utf-16-le'if wide else'utf-8')+bytes(2 if wide else 1);p=self.alloc(len(b));self.u.mem_write(p,b);return p
 def low_access(self,u,access,address,size,value,data):
  eip=u.reg_read(UC_X86_REG_EIP)
  if self.read(eip,1)!=b'\x64':raise RuntimeError(f'non-SEH null-page access at {eip:08x}, address {address:x}')
 def math_probe(self,u,address,size,data):
  import math
  top=(u.reg_read(UC_X86_REG_FPSW)>>11)&7
  def fp(k):
   mant,exp=u.reg_read(UC_X86_REG_FP0+((top+k)&7))
   if (exp&32767)==32767:return f'special:{mant:x}/{exp:x}'
   return math.ldexp(mant/(1<<63),(exp&32767)-16383)*(-1 if exp&32768 else 1)
  self.calls['nativeCRTpow']+=1
  if self.calls['nativeCRTpow']<=8:print('NATIVE_POW',fp(1),fp(0),'top',top,flush=True)
 def invalid(self,u,access,address,size,value,data):
  raise RuntimeError(f'invalid memory access at {u.reg_read(UC_X86_REG_EIP):08x}: {address:08x}+{size}')
 def log_directory(self,u,address,size,data):
  sp=u.reg_read(UC_X86_REG_ESP);ret=self.u32(sp);u.reg_write(UC_X86_REG_EAX,self.empty);u.reg_write(UC_X86_REG_ESP,sp+4);u.reg_write(UC_X86_REG_EIP,ret)
 def import_call(self,u,address,size,data):
  library,name=self.imports[address];sp=u.reg_read(UC_X86_REG_ESP);a=[self.u32(sp+4+4*k)for k in range(10)];self.calls[library+'!'+name]+=1
  if name in ['memset','_MemSet']:
   self.u.mem_write(a[0],bytes([a[1]&255])*a[2]);result=a[0]
  elif name in ['memcpy','_MemCpy']:
   self.u.mem_write(a[0],self.read(a[1],a[2]));result=a[0]
  elif name=='wcsncpy':
   s=self.cstr(a[1],True).encode('utf-16-le');s=s[:a[2]*2].ljust(a[2]*2,b'\0');self.u.mem_write(a[0],s);result=a[0]
  elif name=='PathCombineW':
   parts=[self.cstr(x,True)if x else''for x in a[1:3]];s='\\'.join(x.rstrip('\\/')for x in parts if x);self.u.mem_write(a[0],s.encode('utf-16-le')+b'\0\0');result=a[0]
  elif name in ['PathIsDirectoryW','PathFileExistsW']:
   s=self.cstr(a[0],True).replace('\\','/');result=int(bool(s)and(Path(s).is_dir()if name=='PathIsDirectoryW'else Path(s).exists()))
  elif name in ['_wfopen','fopen']:
   wide=name=='_wfopen';s=self.cstr(a[0],wide).replace('\\','/');mode=self.cstr(a[1],wide)
   if any(c in mode for c in 'wa+'):raise RuntimeError('native attempted non-read-only file I/O')
   path=Path(s).resolve();allowed=(ROOT/'engine').resolve()
   if not path.is_relative_to(allowed):raise RuntimeError('native file read outside extracted engine: '+s)
   if path.is_file():
    result=self.alloc(32);self.files[result]=[path.read_bytes(),0];print('READ',path.name,flush=True)
   else:result=0;print('MISSING',s,flush=True)
  elif name=='fread':
   b,pos=self.files[a[3]];n=min(a[1]*a[2],len(b)-pos);self.u.mem_write(a[0],b[pos:pos+n]);self.files[a[3]][1]+=n;result=n//a[1]if a[1]else 0
  elif name=='fclose':self.files.pop(a[0],None);result=0
  elif name=='CreateFileX':
   path=Path(self.cstr(a[2],True).replace('\\','/')).resolve()
   if not path.is_relative_to((ROOT/'engine').resolve())or a[3]!=0x80000000 or a[6]!=3:raise RuntimeError('non-read-only native CreateFileX')
   if path.is_file():result=self.alloc(32);self.files[result]=[path.read_bytes(),0]
   else:result=0xffffffff
  elif name=='GetFileSizeEx':
   self.u.mem_write(a[1],struct.pack('<Q',len(self.files[a[0]][0])));result=1
  elif name=='CreateFileMappingX':
   result=self.alloc(32);self.mappings[result]=a[2]
  elif name=='MapViewOfFileX':
   # NkcIBaseLib's wrapper orders offset LOW, HIGH (unlike raw Win32).
   b=self.files[self.mappings[a[2]]][0];offset=(a[5]<<32)|a[4];count=a[6]or len(b)-offset
   if offset+count>len(b):raise RuntimeError('invalid native file mapping range')
   result=self.alloc(count);self.u.mem_write(result,b[offset:offset+count])
  elif name=='UnmapViewOfFileX':result=1
  elif name=='CloseHandle':self.files.pop(a[0],None);self.mappings.pop(a[0],None);result=1
  elif name in ['free','_aligned_free']or(library.upper()=='MFC80.DLL'and name=='#266'):result=0
  elif name in ['_malloc_crt','_aligned_malloc']or(library.upper()=='MFC80.DLL'and name=='#265'):result=self.alloc(a[0])
  elif name=='_heapchk':result=0xfffffffe
  elif name=='IsBadWritePtr':
   try:self.read(a[0],a[1]);result=int(a[0]==0)
   except Exception:result=1
  elif name=='GetACP':result=1252
  elif name=='GetLastError':result=self.last_error
  elif name=='SetLastError':self.last_error=a[0];result=0
  elif name=='TlsGetValue':result=self.tls.get(a[0],0)
  elif name=='TlsSetValue':self.tls[a[0]]=a[1];result=1
  elif name=='GetSystemInfo':
   self.u.mem_write(a[0],struct.pack('<9I',0,4096,0x10000,0x7ffeffff,1,1,586,65536,6));result=0
  elif name=='Sleep':result=0
  elif name=='CopyRect':self.u.mem_write(a[0],self.read(a[1],16));result=1
  elif name in ['InterlockedExchange','InterlockedCompareExchange']:
   result=self.u32(a[0]);
   if name=='InterlockedExchange'or result==a[2]:self.w32(a[0],a[1])
  else:raise RuntimeError(f'unimplemented {library}!{name}, caller {self.u32(sp):08x}, args '+','.join(hex(x)for x in a[:7]))
  u.reg_write(UC_X86_REG_EAX,result&0xffffffff)
 def call(self,rva,args,ecx=None):
  sp=0x047ff000-4*(len(args)+1);self.u.mem_write(sp,struct.pack('<'+'I'*(len(args)+1),self.stop,*args));self.u.reg_write(UC_X86_REG_ESP,sp);self.u.reg_write(UC_X86_REG_EBP,0)
  if ecx is not None:self.u.reg_write(UC_X86_REG_ECX,ecx)
  try:self.u.emu_start(self.base+rva,self.stop,timeout=60*1000000,count=100000000)
  except Exception:
   print('TRACE',','.join(hex(x)for x in self.trace));raise
  if self.u.reg_read(UC_X86_REG_EIP)!=self.stop:raise RuntimeError('native call did not return within bounded execution')
  return self.u.reg_read(UC_X86_REG_EAX)


if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Calculate an experimental neutral-reference PCB with original local OEM code; not a scanner capture. Requires pefile and unicorn. Original DLLs are not included.')
 parser.add_argument('--source-root',required=True,type=Path,help='Directory containing engine/ImageDataProc and runtime-crt')
 parser.add_argument('--reference-codes',required=True,nargs=3,type=int,help='Declared synthetic dark/middle/light source codes; these are not measured hardware data')
 parser.add_argument('--output',required=True,type=Path)
 args=parser.parse_args();ROOT=args.source_root.resolve()
 refs=args.reference_codes
 if not(0<=refs[0]<refs[1]<refs[2]<=65535):raise ValueError('Reference codes must increase within u16')
 m=Machine();info=m.alloc(32);ci=m.alloc(0x20000);out=m.alloc(0x20000)
 if m.call(0x1248e0,[ci,info,0])!=0:raise RuntimeError('Original initializer rejected input')
 order=m.alloc(8*1024*1024);calc=m.alloc(8*1024*1024);error=m.alloc(16)
 path=m.string(str(ROOT/'engine/ImageDataProc/Data/CorrectServ/IQGrp000/00000001/PCB_PARA'),True)
 if m.call(0x126700,[path,order,calc,error])!=1:raise RuntimeError('Original factory-bank loader failed')
 scn=m.alloc(0x20000);m.call(0x7b80,[],ecx=scn);m.u.mem_write(scn,bytes(0x20000))
 m.u.mem_write(scn+0x53de,struct.pack('<3H',*refs));m.w32(scn+0x53f8,refs[1])
 m.u.mem_write(ci+0x18,struct.pack('<3h',5,5,5));m.u.mem_write(ci+0x28,b'\x05')
 m.u.mem_write(ci+8,struct.pack('<4I',6391,4042,6048,4011))
 if m.call(0xa100,[out,ci,scn,order,calc])!=0:raise RuntimeError('Original PCB calculation failed')
 blob=m.read(out,0x1493e)
 if blob[0x1f]!=1:raise RuntimeError('Original calculator left Auto Contrast disabled')
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(blob)
 summary={'origin':'factory-calculated','context':'synthetic-neutral-reference','referenceSourceCodes':refs,'contextOffsets':{'anchors':'SCN_ORD_OUT+0x53de','middle':'SCN_ORD_OUT+0x53f8','autoControl':'CALC_INPUT+0x28'},'pcbSha256':hashlib.sha256(blob).hexdigest(),'geometry':struct.unpack_from('<4I',blob),'nativeServices':dict(m.calls),'hardwareCalibrationVerified':False,'originalPerFrameSceneJudgeImplemented':False}
 args.output.with_suffix('.provenance.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(summary,ensure_ascii=False))
