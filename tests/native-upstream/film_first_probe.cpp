#include "spektra.h"
#include <vector>
#include <cmath>
#include <iostream>
#include <stdexcept>
int main(int argc,char**argv)try{
 if(argc!=2)return 2;spk_engine* e=nullptr;if(spk_engine_create(argv[1],&e)!=SPK_OK)throw std::runtime_error("engine");
 const int w=64,h=48;std::vector<float> src(w*h*3);for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)src[i*3+c]=.003f+float(std::pow(double(i+1)/(w*h),2)*(c==0?.8:c==1?.6:.4));spk_image image{src.data(),w,h,SPK_CS_PROPHOTO};
 for(auto film:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400","negs_ilford_hp5_plus_6p5min","fujifilm_velvia_100"})for(auto mode:{"noritsu-ls600","nikon-scan"}){
  spk_params p;spk_default_params(&p);p.film_profile=film;p.auto_exposure=0;p.preview_max_size=64;p.scan_film=1;
  std::string json=std::string(R"({"spectralMethod":"arctic2026beta04","grainRms":true,"grainRmsRed":4.5,"grainRmsGreen":4.5,"grainRmsBlue":4.5,"dirLangmuir":true,"layeredTransport":{"model":"layered"},"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":")")+mode+R"(","noritsuJobEnabled":true,"noritsuJobNormalize":true,"noritsuLocalContrast":true,"noritsuFilmSharp":true,"noritsuHueSat":true}})";
  p.experimental_json=json.c_str();spk_image out{};if(spk_simulate(e,&image,&p,&out)!=SPK_OK)throw std::runtime_error(spk_last_error_message());double lo=1,hi=0;for(int i=0;i<w*h*3;i++){double v=out.data[i];if(!std::isfinite(v)||v<0||v>1)throw std::runtime_error("bad pixels");lo=std::min(lo,v);hi=std::max(hi,v);}spk_image_free(&out);std::cout<<"PASS "<<film<<' '<<mode<<" range="<<lo<<".."<<hi<<'\n';if(hi-lo<.01)throw std::runtime_error("collapsed tonal range");
 }
 spk_engine_destroy(e);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
