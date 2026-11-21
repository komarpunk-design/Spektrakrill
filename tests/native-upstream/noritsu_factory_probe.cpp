/* Factory-calculated, synthetic-reference job: functional and domain checks. GPLv3. */
#include "spektra.h"
#include "model/output_models.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <numeric>
#include <cmath>
#include <stdexcept>
using namespace spk::noritsu::advanced;
static void check(bool value,const char* message){if(!value)throw std::runtime_error(message);std::cout<<"PASS "<<message<<'\n';}
static double rms(const std::vector<float>& a,const std::vector<float>& b){double sum=0;for(size_t i=0;i<a.size();i++)sum+=std::pow(double(a[i])-b[i],2);return std::sqrt(sum/a.size());}
int main(int argc,char**argv)try{
 if(argc!=3)return 2;
 std::ifstream file(argv[2]);std::stringstream text;text<<file.rdbuf();const std::string profile=text.str();
 auto root=spk::json::parse(profile);auto job=read_job(*root);
 check(job->local&&job->sharp&&!job->hue.empty(),"all original factory stage blocks are present");
 check(std::accumulate(job->local->weights.begin(),job->local->weights.end(),0)==258,"unaltered factory kernel total is 258");
 const auto reference=spk::noritsu::input::calibrate(*job);
 auto neutral=spk::noritsu::input::evaluate(*job,reference.middle);
 for(int c=0;c<3;c++)check(std::abs(neutral[c]-.18)<.003,"factory reference reproduces 18 percent linear gray");
 // 258 is safe only in a bounded S1 domain; retain rejection for a full-range job.
 auto unsafe=spk::json::parse(profile);
 for(auto& value:unsafe->object["rgbToYcc"]->object["offsets"]->array)value->number=0;
 bool rejected=false;try{read_job(*unsafe);}catch(...){rejected=true;}check(rejected,"large kernel outside verified float32 sum domain is rejected");
 auto broken=std::const_pointer_cast<Job>(read_job(*root));for(auto& gamma:broken->gamma)std::fill(gamma.begin(),gamma.end(),0);
 rejected=false;try{spk::noritsu::input::calibrate(*broken);}catch(...){rejected=true;}check(rejected,"a flat unusable job cannot silently claim neutral calibration");
 spk_engine* engine=nullptr;check(spk_engine_create(argv[1],&engine)==SPK_OK,"engine created");
 struct Owner{spk_engine* p;~Owner(){spk_engine_destroy(p);}}owner{engine};
 constexpr int w=256,h=192;std::vector<float> source(w*h*3);spk_image input{source.data(),w,h,SPK_CS_PROPHOTO};
 spk_params p;spk_default_params(&p);p.scan_film=1;p.auto_exposure=0;p.grain_active=0;p.halation_active=0;p.dir_couplers_active=0;p.glare_active=0;p.scanner_unsharp[1]=0;p.preview_max_size=512;
 int renders=0;
 auto settings=[&](const std::string& flags){return std::string("{\"noritsuJob\":")+profile+",\"outputModel\":{\"mode\":\"noritsu-ls600\",\"noritsuJobEnabled\":true"+flags+"}}";};
 const std::string normalized=",\"noritsuJobNormalize\":true";
 auto render=[&](const std::string& flags,bool preview=false,bool builtin=false){const auto json=builtin?std::string("{\"noritsuJobId\":\"ls600-g0t1-neutral-v1\",\"outputModel\":{\"mode\":\"noritsu-ls600\",\"noritsuJobEnabled\":true")+flags+"}}":settings(flags);p.experimental_json=json.c_str();spk_image out{};auto status=preview?spk_simulate_preview(engine,&input,&p,&out):spk_simulate(engine,&input,&p,&out);if(status!=SPK_OK)throw std::runtime_error(spk_last_error_message());check(out.width==w&&out.height==h,"render geometry retained");std::vector<float> data(out.data,out.data+w*h*3);spk_image_free(&out);for(float value:data)if(!std::isfinite(value)||value<0||value>1)throw std::runtime_error("invalid output");renders++;return data;};
 for(auto stock:{"kodak_portra_400","kodak_gold_200"})for(int scene=0;scene<2;scene++){
  p.film_profile=stock;
  for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)source[i*3+c]=scene==0?.01+double((unsigned(i)*18397u+unsigned(c)*4301u)%65521u)/65521.*.8:(i/w<h/2?(i%w<w/2?.001:.03):(i%w<w/2?.18:.8))*(.8+.1*c)+double((unsigned(i)*18397u)%65521u)/65521.*.001;
  auto old=render("");check(old==render(",\"noritsuJobNormalize\":false"),"old recipes retain their exact unnormalized pixels");
  auto base=render(normalized);check(rms(old,base)>.01,"reference calibration fixes the input-domain mismatch");
  for(auto flag:{"noritsuFilmSharp","noritsuHueSat","noritsuLocalContrast"}) {
   auto changed=render(normalized+",\""+flag+"\":true");double difference=rms(base,changed);
   std::cout<<stock<<" scene="<<scene<<" "<<flag<<" RMS="<<difference<<'\n';
   if(std::string(flag)!="noritsuLocalContrast"||scene==1)check(difference>1e-5,"stage visibly changes final RGB, beyond the intermediate buffer");
  }
  const auto all=normalized+",\"noritsuFilmSharp\":true,\"noritsuHueSat\":true,\"noritsuLocalContrast\":true";
  const auto complete=render(all);
  check(render(all,false,true)==complete,"compact builtin reference is pixel-identical to the complete job bundle");
  check(complete==render(all,true),"complete factory pipeline preview/export agree at equal resolution");
  if(scene==1){p.density_curve_gamma=1.35;check(render(all)!=complete,"film development remains connected with normalized job input");p.density_curve_gamma=1;}
 }
 std::cout<<"PASS "<<renders<<" factory-profile renders\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
