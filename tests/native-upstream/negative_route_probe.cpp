#include "spektra.h"
#include <iostream>
#include <vector>
#include <stdexcept>
#include <cmath>
int main(int argc,char**argv)try{
 if(argc!=2&&argc!=3)return 2;spk_engine* e=nullptr;if(spk_engine_create(argv[1],&e)!=SPK_OK)throw std::runtime_error("engine");
 spk_params p{};p.film_profile="kodak_portra_400";p.print_profile="kodak_portra_endura";spk_default_params(&p);p.scan_film=1;p.scanner_unsharp[1]=0;
 const int w=24,h=16;std::vector<float> src(w*h*3);for(int i=0;i<w*h;i++){src[i*3]=.15f+.35f*i/(w*h);src[i*3+1]=.04f+.14f*i/(w*h);src[i*3+2]=.015f+.07f*i/(w*h);}
 spk_image in{src.data(),w,h,SPK_CS_PROPHOTO};
 auto render=[&](const std::string& json){p.experimental_json=json.c_str();spk_image out{};auto status=spk_simulate(e,&in,&p,&out);if(status!=SPK_OK)throw std::runtime_error(std::string("status=")+std::to_string(status)+" "+spk_last_error_message());std::vector<float> data(out.data,out.data+w*h*3);spk_image_free(&out);return data;};
 if(argc==2){
 auto clear=render(R"({"workflow":"negative-clear","outputModel":{"mode":"paper"}})");
 for(auto mode:{"digital","lab-scan","noritsu-ls600","nikon-scan"}){
  auto value=render(std::string("{\"workflow\":\"negative-clear\",\"outputModel\":{\"mode\":\"")+mode+"\"}}");
  if(clear!=value)throw std::runtime_error(std::string("negative-clear contaminated by saved receiver ")+mode);
  std::cout<<"PASS clear route bypass "<<mode<<'\n';
 }
 }
 const std::string normal=R"({"workflow":"negative-scan","outputModel":{"mode":"digital","autoSetup":false}})";
 auto base=render(normal);p.density_curve_gamma=1.6f;if(base!=render(normal))throw std::runtime_error("virtual film gamma changes real-negative scan");
 p.density_curve_gamma=1;
 if(base!=render(R"({"workflow":"negative-scan","filmChemistry":true,"filmRed":0.5,"filmFast":1.7,"outputModel":{"mode":"digital","autoSetup":false}})"))throw std::runtime_error("virtual film chemistry changes real-negative scan");
 std::cout<<"PASS real-negative conversion ignores virtual film development\n";
 p.scan_film=0;
 const std::string paper=R"({"workflow":"negative-print","outputModel":{"mode":"noritsu-ls600"}})";
 auto printed=render(paper);p.exposure_compensation_ev=1;p.density_curve_gamma=1.6f;
 if(printed!=render(paper))throw std::runtime_error("virtual camera or film gamma changes physical-negative print");
 std::cout<<"PASS real-negative print ignores virtual camera exposure and film gamma\n";
 p.camera_filter_uv[0]=1;p.camera_filter_ir[0]=.8f;p.spectral_gaussian_blur=.4f;p.apply_hanatos_window=0;p.apply_hanatos_surface=1;
 if(printed!=render(paper))throw std::runtime_error("virtual camera spectral settings change physical-negative print");
 std::cout<<"PASS real-negative print ignores virtual camera spectral settings\n";
 spk_engine_destroy(e);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
