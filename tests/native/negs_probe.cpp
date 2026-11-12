// GPLv3. Exercises shipping Negs ports; source fixtures are from upstream.
#include "model/negs_prep.h"
#include "model/experimental.h"
#include "model/negs_projection.h"
#include "profiles/profile.h"
#include "io/npy_lut.h"
#include "spektra.h"
#include <fstream>
#include <filesystem>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <cstring>
std::vector<float> read(const char* path){std::ifstream f(path,std::ios::binary|std::ios::ate);if(!f)throw std::runtime_error("fixture missing");size_t n=f.tellg();f.seekg(0);std::vector<float> a(n/4);f.read(reinterpret_cast<char*>(a.data()),n);return a;}
void write(const char* path,const std::vector<float>& a){std::ofstream f(path,std::ios::binary);f.write(reinterpret_cast<const char*>(a.data()),a.size()*4);}
int main(int argc,char** argv)try{
 if(argc==3&&std::string(argv[1])=="--core"){
  auto p=spk::read_negs_prep(argv[2]);float rgb[3]={.12f,.54f,1.3f},out[3];spk::negs_prep_core(rgb,.43f,p,out);std::cout<<std::setprecision(10)<<'['<<out[0]<<','<<out[1]<<','<<out[2]<<"]\n";return 0;
 }
 if(argc==6&&std::string(argv[1])=="--guided"){
  auto data=read(argv[4]);auto out=spk::negs_guided_base(data,std::stoi(argv[2]),std::stoi(argv[3]));write(argv[5],out);return 0;
 }
 if(argc==8&&std::string(argv[1])=="--prep"){
  auto data=read(argv[5]);spk::apply_negs_prep(data.data(),std::stoi(argv[2]),std::stoi(argv[3]),spk::read_negs_prep(argv[4]),std::string(argv[7])=="prophoto");write(argv[6],data);return 0;
 }
 if(argc==3&&std::string(argv[1])=="--pipelines"){
  spk_engine* engine=nullptr;if(spk_engine_create(argv[2],&engine)!=SPK_OK)throw std::runtime_error("engine create");struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}} owner{engine};
  std::vector<float> pixels(48*32*3);for(size_t i=0;i<pixels.size();i++)pixels[i]=.01+.49*(i%57)/56.;spk_image input{pixels.data(),48,32,SPK_CS_PROPHOTO};spk_params p{};spk_default_params(&p);p.auto_exposure=0;p.grain_active=0;p.halation_active=0;p.glare_active=0;p.dir_couplers_active=0;p.scanner_unsharp[0]=0;p.scanner_unsharp[1]=0;p.print_profile="kodak_portra_endura";
  auto render=[&](){spk_image out{};spk_status status=spk_simulate(engine,&input,&p,&out);if(status!=SPK_OK)throw std::runtime_error(std::string(p.film_profile)+": "+spk_last_error_message());std::vector<float> data(out.data,out.data+out.width*out.height*3);spk_image_free(&out);for(float v:data)if(!std::isfinite(v))throw std::runtime_error("nonfinite output");return data;};
  int n=0;for(const auto& file:std::filesystem::directory_iterator(std::string(argv[2])+"/profiles")){
   std::string id=file.path().stem();if(id.rfind("negs_",0)!=0||id.find("mgrc")!=std::string::npos)continue;p.film_profile=id.c_str();
   for(int scan=0;scan<2;scan++){p.scan_film=scan;p.experimental_json="{}";auto baseline=render();if(render()!=baseline)throw std::runtime_error("cache instability");p.experimental_json=R"({"negsPrep":{"highlights":-65,"shadows":30,"colorBoost":20,"detail":15,"exposure":0.4}})";auto changed=render();if(changed==baseline)throw std::runtime_error("Prep has no effect");n++;}
  }
  p.film_profile="negs_ilford_hp5_plus_6p5min";p.experimental_json=R"({"grainRms":true,"grainRmsRed":17,"grainUniformityRed":0.6,"grainFloorRed":0.01})";p.scan_film=1;p.grain_active=1;auto a=render();auto b=render();if(a!=b)throw std::runtime_error("four-layer grain not deterministic");
  p.grain_active=0;p.scan_film=0;p.film_profile="negs_kodak_trix400_d76_8min_8min";p.print_profile="negs_ilford_mgrc_deluxe_grade2_1min";p.experimental_json="{}";render();p.print_profile="kodak_portra_endura";p.film_profile="kodak_portra_400";p.experimental_json="{}";auto baseline=render();p.experimental_json=R"({"negsPrep":{"exposure":0,"colorBoost":0}})";if(render()!=baseline)throw std::runtime_error("neutral Prep changed old pixels");
  p.experimental_json=R"({"negsPrep":{"exposure":1}})";p.print_exposure_compensation=1;p.scan_film=0;auto placed=render();p.experimental_json="{}";if(render()==placed)throw std::runtime_error("print compensation cancelled Prep exposure");
  std::cout<<"PASS "<<n<<" Negs full film/print pipelines; memo and Prep effect; 4-layer BW grain; neutral legacy identity; independent Prep exposure\n";return 0;
 }
 return 2;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
