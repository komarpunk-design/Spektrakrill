#include "spektra.h"
#include "model/receiver_acceleration.h"
#include "gpu/vulkan_compute.h"
#include "runtime/stages/filming.h"
#include <vector>
#include <iostream>
#include <stdexcept>
#include <cmath>
#include <cstdlib>
uint64_t spk_test_pregrain_cache_hits(spk_engine*,int);
int main(int argc,char**argv)try{
 if(argc!=2)return 2;if(!spk::gpu::available())throw std::runtime_error("Vulkan required");
 spk_engine* e=nullptr;if(spk_engine_create(argv[1],&e)!=SPK_OK)throw std::runtime_error("engine");
 const int w=160,h=128;std::vector<float> src(w*h*3);
 for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)src[i*3+c]=.003+std::pow(double((i*1879+c*3103)%65521)/65521,2)*.8;
 spk_image image{src.data(),w,h,SPK_CS_PROPHOTO};int renders=0;
 for(auto mode:{"nikon-scan","noritsu-ls600"})for(bool grain:{false,true})for(bool exporting:{false,true})for(bool automatic:{false,true})for(bool fast_preview:{false,true}){
  if(exporting&&fast_preview)continue;
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.auto_exposure=automatic;p.exposure_compensation_ev=automatic?.7f:0;p.grain_active=grain;p.scan_film=1;p.preview_max_size=192;p.scanner_unsharp[1]=0;
  const std::string settings=std::string(R"({"spectralMethod":"arctic2026beta04","grainRms":true,"grainRmsRed":4.5,"grainRmsGreen":4.5,"grainRmsBlue":4.5,"dirLangmuir":true,"layeredTransport":{"model":"layered"},"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":")")+mode+R"(","noritsuJobEnabled":true,"noritsuJobNormalize":true,"noritsuLocalContrast":true,"noritsuFilmSharp":true,"noritsuHueSat":true}})";
  p.experimental_json=settings.c_str();spk_image cpu{},fast{};
  // Compare Fast exports with the SAME Fast grain realization on both sides.
  // Lab film stages remain CPU on export; only receiver offload differs.
  p.disable_buffer_memos=1;p.gpu_export=exporting||fast_preview;setenv("SPK_RECEIVER_GPU","0",1);
  if(spk_simulate(e,&image,&p,&cpu)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
  unsetenv("SPK_RECEIVER_GPU");p.gpu_preview=1;const auto before=spk::outputs::receiver_gpu_stats();
  const auto expose_before=spk::gpu_projected_expose_frames_rendered();
  const auto transport_before=spk::gpu::transport_convolve_passes();
  auto rc=exporting?spk_simulate(e,&image,&p,&fast):spk_simulate_preview(e,&image,&p,&fast);
  if(rc!=SPK_OK)throw std::runtime_error(spk_last_error_message());
  if(spk::outputs::receiver_gpu_stats().frames<=before.frames)throw std::runtime_error("receiver did not use Vulkan");
  if(!exporting&&spk::gpu_projected_expose_frames_rendered()<=expose_before)throw std::runtime_error("Arctic expose did not use Vulkan");
  if(!exporting&&spk::gpu::transport_convolve_passes()<=transport_before)throw std::runtime_error("Layered stencil did not use Vulkan");
  double maximum=0,rms=0;for(int i=0;i<w*h*3;i++){double d=std::abs(cpu.data[i]-fast.data[i]);if(!std::isfinite(d))throw std::runtime_error("nonfinite");maximum=std::max(maximum,d);rms+=d*d;}
  rms=std::sqrt(rms/(w*h*3));std::cout<<mode<<" RMS grain="<<grain<<" export="<<exporting<<" Fast-preview="<<fast_preview<<" AE="<<automatic<<" max="<<maximum<<" rms="<<rms<<'\n';
  if(maximum>.01||rms>.00015)throw std::runtime_error("full pipeline precision");
  spk_image_free(&cpu);spk_image_free(&fast);renders++;
 }
 // A fast preview must never seed an exact render with approximate memos.
 for(bool scan:{false,true})for(bool fast_quality:{false,true}){
  spk_engine *warm=nullptr,*cold=nullptr;spk_engine_create(argv[1],&warm);spk_engine_create(argv[1],&cold);
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.print_profile="kodak_portra_endura";p.scan_film=scan;p.auto_exposure=0;p.preview_max_size=192;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=p.print_glare_active=0;p.scanner_unsharp[1]=0;
  p.experimental_json=scan?R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":"nikon-scan","autoSetup":false}})":R"({"spectralMethod":"arctic2026beta04"})";
  spk_image fast{},after{},reference{};p.gpu_preview=1;p.gpu_export=fast_quality;
  if(spk_simulate_preview(warm,&image,&p,&fast)!=SPK_OK)throw std::runtime_error(spk_last_error_message());spk_image_free(&fast);p.gpu_preview=0;p.gpu_export=0;
  if(spk_simulate(warm,&image,&p,&after)!=SPK_OK||spk_simulate(cold,&image,&p,&reference)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
  bool same=after.width==reference.width&&after.height==reference.height;
  if(same)for(int i=0;i<after.width*after.height*3;i++)if(after.data[i]!=reference.data[i]){same=false;break;}
  spk_image_free(&after);spk_image_free(&reference);spk_engine_destroy(warm);spk_engine_destroy(cold);
  if(!same)throw std::runtime_error("GPU preview memo contaminated exact CPU output");
  std::cout<<"PASS exact cache isolation scan="<<scan<<'\n';
 }
 // The application's default sends Fast quality to BOTH APIs. A scanner-only
 // edit must hit the pre-grain memo even then, and equal a fresh GPU preview.
 for(auto mode:{"nikon-scan","noritsu-ls600"}){
  spk_engine* warm=nullptr;spk_engine_create(argv[1],&warm);
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=1;p.gpu_export=p.gpu_preview=1;p.preview_max_size=192;p.scanner_unsharp[1]=0;
  const std::string base=R"({"spectralMethod":"arctic2026beta04","grainRms":true,"dirLangmuir":true,"layeredTransport":{"model":"layered"},"outputModel":{"mode":")"+std::string(mode);
  std::string json=base+R"(","exposure":0}})";p.experimental_json=json.c_str();spk_image first{},edited{},cold{};
  if(spk_simulate_preview(warm,&image,&p,&first)!=SPK_OK)throw std::runtime_error("Fast preview");spk_image_free(&first);
  const auto hits=spk_test_pregrain_cache_hits(warm,1);const auto before=spk::gpu_projected_expose_frames_rendered();
  json=base+R"(","exposure":0.4}})";p.experimental_json=json.c_str();
  if(spk_simulate_preview(warm,&image,&p,&edited)!=SPK_OK)throw std::runtime_error("cached Fast preview");
  if(spk_test_pregrain_cache_hits(warm,1)<=hits||spk::gpu_projected_expose_frames_rendered()!=before)throw std::runtime_error("Fast quality still bypassed preview memos");
  p.disable_buffer_memos=1;
  if(spk_simulate_preview(warm,&image,&p,&cold)!=SPK_OK)throw std::runtime_error("cold Fast preview");
  for(int i=0;i<w*h*3;i++)if(edited.data[i]!=cold.data[i])throw std::runtime_error("cached Fast preview changed pixels");
  spk_image_free(&edited);spk_image_free(&cold);spk_engine_destroy(warm);
  std::cout<<"PASS cached Fast preview exact "<<mode<<'\n';
 }
 spk_engine_destroy(e);std::cout<<"PASS "<<renders<<" full Arctic/Layered/Langmuir/RMS/Noritsu/Nikon Vulkan comparisons\n";
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
