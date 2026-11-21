#include "spektra.h"
#include <vector>
#include <iostream>
#include <cmath>
#include <stdexcept>
int main(int argc,char**argv)try{
 if(argc!=2)return 2;spk_engine* e; if(spk_engine_create(argv[1],&e)!=SPK_OK)throw std::runtime_error("engine");
 // The recovered Noritsu 7x7 filter at factor 8 requires at least 56px per side.
 constexpr int w=64,h=64;std::vector<float> src(w*h*3);for(int i=0;i<w*h;i++){src[i*3]=.002f+.9f*i/(w*h);src[i*3+1]=.03f;src[i*3+2]=.003f;}
 spk_image in{src.data(),w,h,SPK_CS_PROPHOTO};spk_params p{};p.film_profile="kodak_portra_400";p.print_profile="kodak_portra_endura";spk_default_params(&p);p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.auto_exposure=0;p.scan_film=1;p.scanner_unsharp[1]=0;p.preview_max_size=64;
 auto render=[&](const std::string& mode,int gamut,bool preview=false){const bool factory=mode=="noritsu-factory";std::string json=std::string("{")+(factory?"\"noritsuJobId\":\"ls600-g0t1-neutral-v1\",":"")+"\"outputModel\":{\"mode\":\""+(factory?"noritsu-ls600":mode)+"\",\"cyan\":-0.7,\"magenta\":0.6,\"yellow\":0.4,\"noritsuSaturation\":1.7"+(factory?",\"noritsuJobEnabled\":true,\"noritsuJobNormalize\":true,\"noritsuLocalContrast\":true,\"noritsuFilmSharp\":true,\"noritsuHueSat\":true":"")+"}}";p.experimental_json=json.c_str();p.output_gamut_compress=gamut;spk_image out{};auto st=preview?spk_simulate_preview(e,&in,&p,&out):spk_simulate(e,&in,&p,&out);if(st!=SPK_OK)throw std::runtime_error(std::string("status ")+std::to_string(st)+" "+spk_last_error_message());std::vector<float> v(out.data,out.data+w*h*3);spk_image_free(&out);for(auto x:v)if(!std::isfinite(x)||x<0||x>1)throw std::runtime_error("nonfinite or unbounded output");return v;};
 for(auto mode:{"digital","auto-levels","lab-scan","noritsu-ls600","nikon-scan","noritsu-factory"}){
  auto base=render(mode,0);if(base!=render(mode,1))throw std::runtime_error("legacy/off mismatch");
  for(int gamut=2;gamut<=6;gamut++){
   auto value=render(mode,gamut);if(value==base)throw std::runtime_error(std::string("gamut ignored by ")+mode+" mode="+std::to_string(gamut));
   if(value!=render(mode,gamut,true))throw std::runtime_error("preview/export mismatch");
   std::cout<<"PASS gamut reaches "<<mode<<" algorithm="<<gamut<<'\n';
  }
 }
 spk_engine_destroy(e);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
