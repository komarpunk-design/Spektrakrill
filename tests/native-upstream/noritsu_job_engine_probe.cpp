#include "spektra.h"
#include "model/lab_json.h"
#include <vector>
#include <fstream>
#include <sstream>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
void check(bool v,const char* msg){if(!v)throw std::runtime_error(msg);std::cout<<"PASS "<<msg<<'\n';}
int main(int argc,char**argv)try{
 if(argc!=3)return 2;std::ifstream jf(argv[2]);std::stringstream ss;ss<<jf.rdbuf();const std::string profile=ss.str();
 spk_engine* e=nullptr;check(spk_engine_create(argv[1],&e)==SPK_OK,"engine created");struct Owner{spk_engine* p;~Owner(){spk_engine_destroy(p);}}owner{e};
 const int w=48,h=32;std::vector<float> in(w*h*3);for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)in[i*3+c]=.002+std::pow(double(i)/(w*h-1),2)*(c==0?.8:c==1?.6:.4);
 auto rejected=[](const std::string& value){try{spk::parse_lab_json(value.c_str());return false;}catch(const std::exception&){return true;}};
 check(rejected(std::string(17000,' ')+"{}"),"large ordinary recipes retain their original size guard");
 check(rejected(std::string(512*1024+1,' ')),"job envelopes cannot exceed 512 KiB");
 check(rejected(std::string(17000,' ')+R"({"noritsuJob":false})"),"only an explicit job object permits large envelopes");
 spk_image image{in.data(),w,h,SPK_CS_PROPHOTO};spk_params p;spk_default_params(&p);p.auto_exposure=0;p.scan_film=1;p.grain_active=0;p.halation_active=0;p.glare_active=0;p.dir_couplers_active=0;p.scanner_unsharp[1]=0;p.preview_max_size=64;int renders=0;
 auto json=[&](const char* mode,const std::string& settings="",const char* workflow="normal"){return std::string("{\"noritsuJob\":")+profile+",\"workflow\":\""+workflow+"\",\"outputModel\":{\"mode\":\""+mode+"\""+settings+"}}";};
 auto render=[&](const std::string& text,bool preview=false){p.experimental_json=text.c_str();spk_image out{};auto status=preview?spk_simulate_preview(e,&image,&p,&out):spk_simulate(e,&image,&p,&out);if(status!=SPK_OK)throw std::runtime_error(spk_last_error_message());std::vector<float> data(out.data,out.data+w*h*3);spk_image_free(&out);for(auto v:data)if(!std::isfinite(v)||v<0||v>1)throw std::runtime_error("invalid RGB");renders++;return data;};
 const std::string master=",\"noritsuJobEnabled\":true",all=master+",\"noritsuLocalContrast\":true,\"noritsuFilmSharp\":true,\"noritsuHueSat\":true";
 for(auto stock:{"kodak_portra_400","kodak_gold_200"}){
  p.film_profile=stock;auto old=render(json("noritsu-ls600"));auto base=render(json("noritsu-ls600",master));check(old!=base,"profile color pipeline reaches real engine");
  for(auto flag:{"noritsuLocalContrast","noritsuFilmSharp","noritsuHueSat"})check(base!=render(json("noritsu-ls600",master+",\""+flag+"\":true")),"each imported stage changes image");
  check(render(json("noritsu-ls600",all))==render(json("noritsu-ls600",all),true),"all three stages preview/export identical");
  check(base!=render(json("noritsu-ls600",master+",\"exposure\":0.7,\"noritsuGamma\":0.8,\"contrast\":1.2")),"operator controls remain connected after profile processing");
 }
 p.film_profile="kodak_portra_400";
 for(auto cs:{SPK_CS_SRGB,SPK_CS_ADOBE_RGB,SPK_CS_PROPHOTO,SPK_CS_REC2020,SPK_CS_LINEAR_SRGB}){p.output_color_space=cs;check(render(json("noritsu-ls600",all))==render(json("noritsu-ls600",all),true),"profile path matches preview/export in selected output space");}p.output_color_space=SPK_CS_SRGB;
 p.scanner_unsharp[0]=1;p.scanner_unsharp[1]=0;auto sharp=render(json("noritsu-ls600",all));p.scanner_unsharp[1]=3;check(sharp==render(json("noritsu-ls600",all)),"Film Sharp bypasses shared unsharp without erasing its values");p.scanner_unsharp[1]=0;
 check(render(json("noritsu-ls600",all,"negative-scan"))==render(json("noritsu-ls600",all,"negative-scan"),true),"real-negative route retains coherent profile processing");
 for(auto mode:{"digital","auto-levels","lab-scan","paper"}){
  const auto plain=std::string("{\"outputModel\":{\"mode\":\"")+mode+"\"}}";
  check(render(plain)==render(json(mode,all)),"inactive job stages do not leak into other output modes");
 }
 p.film_profile="negs_ilford_hp5_plus_6p5min";check(render(json("noritsu-ls600",all))==render(R"({"outputModel":{"mode":"digital"}})"),"BW fallback remains Digital Reference");
 p.film_profile="fujifilm_velvia_100";check(render(json("noritsu-ls600",all))==render(R"({"outputModel":{"mode":"digital"}})"),"slide bypass remains unchanged");
 std::cout<<"PASS "<<renders<<" complete native job renders\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
