/* GPLv3. Immutable provenance skips input materialization/hash without changing pixels. */
#include "spektra.h"
#include "gpu/vulkan_compute.h"
#include <vector>
#include <stdexcept>
#include <iostream>
#include <cstring>
uint64_t spk_test_input_hash_bytes();
uint64_t spk_test_input_materialized_bytes();
uint64_t spk_test_scan_film_cache_hits(spk_engine*);
uint64_t spk_test_scan_film_cache_misses(spk_engine*);
uint64_t spk_test_film_cache_hits(spk_engine*);
int main(int argc,char** argv) try {
 if(argc<2)return 2;
 const bool gpu=argc>2&&std::string(argv[2])=="--gpu";
 if(gpu&&!spk::gpu::available())return 9;
 const auto gpuBefore=spk_gpu_scan_frames();
 const int w=96,h=80;std::vector<float> pixels(w*h*3);
 for(size_t i=0;i<pixels.size();i++)pixels[i]=.004f+.5f*((i*1879)%65521)/65521.;
 spk_image image{pixels.data(),w,h,SPK_CS_PROPHOTO};spk_engine* engine=nullptr;
 if(spk_engine_create(argv[1],&engine)!=SPK_OK)return 3;
 struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}}owner{engine};
 int checks=0;
 for(bool scan:{false,true})for(bool automatic:{false,true})for(bool arctic:{false,true})for(bool grain:{false,true}) {
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.print_profile="kodak_portra_endura";
  p.scan_film=scan;p.auto_exposure=automatic;p.grain_active=grain;p.halation_active=p.glare_active=p.print_glare_active=0;p.scanner_unsharp[1]=0;p.preview_max_size=128;
  if(gpu)p.allow_gpu_scan=p.gpu_export=p.gpu_preview=1;
  p.experimental_json=arctic?R"({"spectralMethod":"arctic2026beta04","grainRms":true,"outputModel":{"mode":"digital"}})":nullptr;
  auto render=[&](uint64_t id,bool cold){auto params=p;params.disable_buffer_memos=cold;spk_image out{};
   auto status=spk_simulate_preview_immutable_cancellable(engine,&image,&params,&out,cold?0:id,nullptr,nullptr);
   if(status!=SPK_OK)throw std::runtime_error(spk_last_error_message());
   std::vector<float> result(out.data,out.data+out.width*out.height*3);spk_image_free(&out);return result;};
  const auto beforeHash=spk_test_input_hash_bytes(),beforeMaterialized=spk_test_input_materialized_bytes();
  auto first=render(100,false),second=render(100,false);
  if(spk_test_input_hash_bytes()!=beforeHash||spk_test_input_materialized_bytes()!=beforeMaterialized)throw std::runtime_error("immutable source copied/hashed");
  if(first!=second||second!=render(0,true))throw std::runtime_error("immutable/cold mismatch");
  const auto old=pixels[11];pixels[11]+=.03f;auto changed=render(101,false);
  if(changed!=render(0,true))throw std::runtime_error("new identity reused old pixels");
  pixels[11]=old;
  // Mutable clients retain content hashing and detect writes, even at the same pointer.
  auto mutableFirst=render(0,false);const auto old2=pixels[19];pixels[19]+=.02f;
  const auto mutableChanged=render(0,false);
  // Use a fresh memo with the SAME mutable input/backend path. A one-shot
  // reference is f32-direct while mutable previews may upload gained f64;
  // their GPU roundoff is a different contract from content invalidation.
  if(spk_engine_forget_profile(engine,p.film_profile)!=SPK_OK)throw std::runtime_error("forget profile");
  if(mutableChanged!=render(0,false))throw std::runtime_error("mutable source skipped content validation");
  pixels[19]=old2;
  ++checks;
 }
 // Input decoding is a density dependency on the physical-negative route.
 {
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=0;
  p.grain_active=p.halation_active=p.glare_active=p.dir_couplers_active=0;p.scanner_unsharp[1]=0;
  p.experimental_json=R"({"workflow":"negative-scan","outputModel":{"mode":"digital","autoSetup":false}})";
  auto render=[&](bool cold){spk_params q=p;q.disable_buffer_memos=cold;spk_image out{};
   if(spk_simulate_preview_immutable_cancellable(engine,&image,&q,&out,500,nullptr,nullptr)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
   std::vector<float> values(out.data,out.data+out.width*out.height*3);spk_image_free(&out);return values;};
  render(false);const auto misses=spk_test_scan_film_cache_misses(engine);p.input_cctf_decoding=1;
  if(render(false)!=render(true)||spk_test_scan_film_cache_misses(engine)<=misses)throw std::runtime_error("input decoder reused stale negative density");
 }
 // Deterministic preview resizing retains provenance. Crop/rescale geometry
 // may still materialize and hash, rather than claiming an unsafe identity hit.
 for(bool cropped:{false,true}) {
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.preview_max_size=64;
  p.grain_active=p.halation_active=p.glare_active=0;p.crop=cropped;p.crop_size[0]=p.crop_size[1]=.75f;
  spk_image a{},b{};const auto before=spk_test_input_materialized_bytes();
  if(spk_simulate_preview_immutable_cancellable(engine,&image,&p,&a,200,nullptr,nullptr)!=SPK_OK)return 7;
  if(!cropped&&spk_test_input_materialized_bytes()!=before)throw std::runtime_error("resize lost immutable provenance");
  p.disable_buffer_memos=1;
  if(spk_simulate_preview(engine,&image,&p,&b)!=SPK_OK)return 8;
  if(a.width!=b.width||a.height!=b.height||std::memcmp(a.data,b.data,size_t(a.width)*a.height*12))throw std::runtime_error("resized/cropped immutable mismatch");
  spk_image_free(&a);spk_image_free(&b);
 }
 spk_params p{};spk_default_params(&p);spk_image cancelled{};
 if(spk_simulate_preview_immutable_cancellable(engine,&image,&p,&cancelled,123,[](void*){return 1;},nullptr)!=SPK_ERR_CANCELLED)return 4;
 const auto before=spk_test_input_materialized_bytes();p.film_profile="kodak_portra_400";p.scan_film=1;p.grain_active=p.halation_active=p.glare_active=0;
 spk_image out{};if(spk_simulate_preview(engine,&image,&p,&out)!=SPK_OK)return 5;spk_image_free(&out);
 if(spk_test_input_materialized_bytes()<=before)throw std::runtime_error("immutable identity leaked after cancellation");
 if(gpu&&spk_gpu_scan_frames()<=gpuBefore)throw std::runtime_error("no actual Vulkan scan dispatch");
 std::cout<<"PASS gpu="<<gpu<<" "<<checks<<" immutable/mutable source variants, exact cold parity and scoped cancellation\n";
} catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
