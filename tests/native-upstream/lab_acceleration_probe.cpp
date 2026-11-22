#include "model/output_models.h"
#include "runtime/lab_acceleration.h"
#include "gpu/vulkan_compute.h"
#include <iostream>
#include <stdexcept>
#include <cstring>
int main(int argc,char**argv)try{
 if(argc<2)return 2;bool requireGpu=argc>2;
 if(requireGpu&&!spk::gpu::available())throw std::runtime_error("Vulkan dispatch required, unavailable");
 if(spk::stage_gpu_requested(false,true,false,true)||!spk::stage_gpu_requested(true,true,false,true)||spk::stage_gpu_requested(true,true,true,true)||spk::stage_gpu_requested(true,true,false,false)||!spk::stage_gpu_requested(true,false,true,true))throw std::runtime_error("stage policy");
 auto f=spk::load_profile_file(std::string(argv[1])+"/profiles/kodak_portra_400.json");
 const int w=192,h=128;std::vector<float> density(w*h*3),cpu(density.size()),fast(cpu.size());
 for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)density[i*3+c]=float(spk::outputs::density_at(f,-1.5+3.*((i*17+c*103)%997)/996.,c,1));
 int renders=0;
 for(auto mode:{"digital","auto-levels","lab-scan","noritsu-ls600","nikon-scan","factory"})for(bool automatic:{false,true})for(auto cs:{SPK_CS_SRGB,SPK_CS_ADOBE_RGB,SPK_CS_PROPHOTO}){
  spk::outputs::Params p;p.mode=std::string(mode)=="factory"?"noritsu-ls600":mode;p.automatic=automatic;
  if(std::string(mode)=="factory"){p.job=spk::noritsu::advanced::builtin_job("ls600-g0t1-neutral-v1");p.jobEnabled=p.jobNormalize=p.local=p.sharp=p.hue=true;}
  auto before=spk::outputs::receiver_gpu_stats();
  spk::outputs::scan(f,p,density.data(),w,h,cpu.data(),1,cs,true,0,0,0);
  spk::outputs::scan(f,p,density.data(),w,h,fast.data(),1,cs,true,0,0,0,spk::OutputGamutCompress::kLegacyClip,0,1,6,nullptr,true);
  auto after=spk::outputs::receiver_gpu_stats();if(requireGpu&&after.frames<=before.frames)throw std::runtime_error(std::string("GPU pass refused ")+mode);
  double maximum=0,rms=0;for(size_t i=0;i<cpu.size();i++){if(!std::isfinite(fast[i]))throw std::runtime_error("nonfinite");double d=std::abs(cpu[i]-fast[i]);maximum=std::max(maximum,d);rms+=d*d;}
  rms=std::sqrt(rms/cpu.size());std::cout<<mode<<" cs="<<int(cs)<<" auto="<<automatic<<" max="<<maximum<<" rms="<<rms<<" GPU="<<(after.frames-before.frames)<<'\n';
  if(requireGpu?(maximum>2./255||rms>.001):std::memcmp(cpu.data(),fast.data(),cpu.size()*4)!=0)throw std::runtime_error("receiver parity");renders++;
 }
 // Unsupported density domains must fall back without losing original data.
 density[0]=-.5;auto before=spk::outputs::receiver_gpu_stats();spk::outputs::Params p;p.mode="nikon-scan";p.automatic=false;
 spk::outputs::scan(f,p,density.data(),w,h,cpu.data(),1,SPK_CS_SRGB,true,0,0,0);
 spk::outputs::scan(f,p,density.data(),w,h,fast.data(),1,SPK_CS_SRGB,true,0,0,0,spk::OutputGamutCompress::kLegacyClip,0,1,6,nullptr,true);
 if(spk::outputs::receiver_gpu_stats().frames!=before.frames||std::memcmp(cpu.data(),fast.data(),cpu.size()*4))throw std::runtime_error("out of domain fallback is not exact");
 std::cout<<"PASS "<<renders<<" receiver paths, exact CPU fallback, guarded stage policy\n";
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
