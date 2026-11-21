#include "model/output_models.h"
#include "spektra.h"
#include <iostream>
#include <stdexcept>
int main(int argc,char**argv)try{
 if(argc!=2)return 2;
 for(auto film:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400"}){
  auto f=spk::load_profile_file(std::string(argv[1])+"/profiles/"+film+".json");
  for(double ev:{-.6,-.3,0.,.3,.6}){
   float d[3],out[3];for(int c=0;c<3;c++)d[c]=spk::outputs::density_at(f,ev,c,1);
   spk::outputs::Params p;p.mode="nikon-scan";p.automatic=false;
   spk::outputs::scan(f,p,d,1,1,out,1,SPK_CS_LINEAR_SRGB,false,0,0,0);
   double spread=std::max({out[0],out[1],out[2]})-std::min({out[0],out[1],out[2]});
   if(spread>(ev==0?.001:.05))throw std::runtime_error("neutral film patch has excessive color cast");
   if(ev==0)for(auto v:out)if(std::abs(v-.18)>.001)throw std::runtime_error("middle gray calibration failed");
   std::cout<<"PASS "<<film<<" e="<<ev<<" RGB="<<out[0]<<","<<out[1]<<","<<out[2]<<'\n';
  }
  for(int channel=0;channel<3;channel++){
   float d[3],out[3];for(int c=0;c<3;c++)d[c]=spk::outputs::density_at(f,c==channel?.25:0,c,1);
   for(bool automatic:{false,true}){
    spk::outputs::Params p;p.mode="nikon-scan";p.automatic=automatic;
    spk::outputs::scan(f,p,d,1,1,out,1,SPK_CS_LINEAR_SRGB,false,0,0,0);
    if(std::max({out[0],out[1],out[2]})-std::min({out[0],out[1],out[2]})<.02)throw std::runtime_error("color patch was desaturated by calibration");
    if(out[channel]<out[(channel+1)%3]||out[channel]<out[(channel+2)%3])throw std::runtime_error("primary hue direction reversed");
    std::cout<<"PASS primary retained "<<film<<" channel="<<channel<<" auto="<<automatic<<'\n';
   }
  }
 }
 spk_engine* engine=nullptr;if(spk_engine_create(argv[1],&engine)!=SPK_OK)throw std::runtime_error("engine initialization");
 for(auto stock:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400"}){
  spk_params p;spk_default_params(&p);p.film_profile=stock;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;p.scan_film=1;
  p.experimental_json=R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":"nikon-scan","autoSetup":false}})";
  std::vector<float> source(16*16*3,.18f);spk_image input{source.data(),16,16,SPK_CS_PROPHOTO},out{};
  if(spk_simulate(engine,&input,&p,&out)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
  if(std::max({out.data[0],out.data[1],out.data[2]})-std::min({out.data[0],out.data[1],out.data[2]})>.04)throw std::runtime_error("full photo pipeline has excessive gray cast");
  spk_image_free(&out);std::cout<<"PASS actual gray photo pipeline "<<stock<<'\n';
 }
 spk_engine_destroy(engine);
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
