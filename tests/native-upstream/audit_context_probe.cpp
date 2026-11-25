#include "spektra.h"
#include "model/layered_transport.h"
#include "model/noritsu_advanced.h"
#include <iomanip>
#include <sstream>
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
int main(int argc,char**argv){
 if(argc<3)return 2;
 if(std::string(argv[1])=="transport"){
  spk::transport::Params p;p.model="layered";double strengths[]={.1,.05,.025};
  std::shared_ptr<const spk::transport::Prepared> first;
  if(std::string(argv[2])=="warm")first=spk::transport::prepare("kodak_portra_400",p,strengths,.0056001);
  auto second=spk::transport::prepare("kodak_portra_400",p,strengths,.0056004);
  std::cout<<"pitch keys "<<std::to_string(.0056001)<<" / "<<std::to_string(.0056004)<<" reused="<<(first==second)<<'\n';
  if(first==second)return 8;
  std::ofstream out(argv[3],std::ios::binary);
  for(auto&channel:second->kernels)for(auto&k:channel){out.write((char*)&k.radius,sizeof(k.radius));out.write((char*)&k.weight,sizeof(k.weight));out.write((char*)k.values.data(),k.values.size()*sizeof(double));}
  return 0;
 }
 spk_engine* e=nullptr;auto status=spk_engine_create(argv[2],&e);if(status!=SPK_OK)return 3;
 if(std::string(argv[1])=="roi"){
  const int w=128,h=96,cw=32,ch=32,x0=90,y0=32;std::vector<float> pixels(w*h*3),crop(cw*ch*3);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++)for(int c=0;c<3;c++)pixels[(y*w+x)*3+c]=(x<80?.01f:.35f)*(1.f-.2f*c)+.001f*y/h;
  for(int y=0;y<ch;y++)for(int x=0;x<cw;x++)for(int c=0;c<3;c++)crop[(y*cw+x)*3+c]=pixels[((y+y0)*w+x+x0)*3+c];
  for(const std::string mode:{"nikon-scan","lab-scan","auto-levels","noritsu-ls600"}) for(bool automatic:{false,true}){
   spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;
   std::string j=std::string(R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":")")+mode+R"(","autoSetup":)"+(automatic?"true":"false")+"}}";p.experimental_json=j.c_str();
   spk_image fullInput{pixels.data(),w,h,SPK_CS_PROPHOTO},cropInput{crop.data(),cw,ch,SPK_CS_PROPHOTO},full{},patch{};
   auto a=spk_simulate(e,&fullInput,&p,&full);
   double context[2];if(spk_meter_scanner_context(e,&fullInput,&p,context)!=SPK_OK)return 6;
   j.pop_back();j.pop_back();j+=",\"frameScale\":"+std::to_string(context[0])+",\"frameShift\":"+std::to_string(context[1])+"}}";p.experimental_json=j.c_str();
   p.film_format_mm*=float(cw)/w;auto b=spk_simulate(e,&cropInput,&p,&patch);if(a!=SPK_OK||b!=SPK_OK)return 5;
   double mx=0,mean=0;for(int y=0;y<ch;y++)for(int x=0;x<cw;x++)for(int c=0;c<3;c++){double d=std::abs(full.data[((y+y0)*w+x+x0)*3+c]-patch.data[(y*cw+x)*3+c]);mx=std::max(mx,d);mean+=d;}
   if(mx>3e-6)return 7;
   std::cout<<mode<<" automatic="<<automatic<<" full-frame vs same ROI max="<<mx<<" mean="<<mean/(cw*ch*3)<<'\n';spk_image_free(&full);spk_image_free(&patch);
  }
  spk_engine_destroy(e);return 0;
 }
 if(std::string(argv[1])=="meter"){
  const int w=480,h=320;std::vector<float> pixels(w*h*3);
  for(int i=0;i<w*h;i++){pixels[i*3]=.02f+.7f*float(i%127)/127;pixels[i*3+1]=.01f+.08f*float(i%83)/83;pixels[i*3+2]=.002f+.03f*float(i%53)/53;}
  for(bool arctic:{false,true}){
   spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=1;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;
   p.experimental_json=arctic?R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":"digital"}})":R"({"outputModel":{"mode":"digital"}})";
   spk_image image{pixels.data(),w,h,SPK_CS_PROPHOTO},normal{},external{};auto a=spk_simulate(e,&image,&p,&normal);double ev=0;spk_meter_exposure_ev(e,&image,&p,&ev);
   auto scaled=pixels;float gain=std::pow(2.,ev);for(auto& v:scaled)v*=gain;image.data=scaled.data();p.auto_exposure=0;auto b=spk_simulate(e,&image,&p,&external);
   double mx=0,mean=0;if(a==SPK_OK&&b==SPK_OK)for(int i=0;i<w*h*3;i++){double d=std::abs(normal.data[i]-external.data[i]);mx=std::max(mx,d);mean+=d;}else return 4;
   if(mx>3e-6)return 9;
   std::cout<<"arctic="<<arctic<<" full-auto vs external-meter+AE-off EV="<<ev<<" max="<<mx<<" mean="<<mean/(w*h*3)<<'\n';spk_image_free(&normal);spk_image_free(&external);
  }
  spk_engine_destroy(e);return 0;
 }

 if(std::string(argv[1])=="noritsu-min") {
  auto job=spk::noritsu::advanced::builtin_job("ls600-g0t1-neutral-v1");
  int minimum=spk::noritsu::advanced::minimum_axis(*job);
  for(int h:{minimum-1,minimum,minimum+1}) {
   std::vector<float> pixels(128*h*3,.18f);spk_image image{pixels.data(),128,h,SPK_CS_PROPHOTO};
   spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;
   p.experimental_json=R"({"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":"noritsu-ls600","noritsuJobEnabled":true,"noritsuJobNormalize":true,"noritsuLocalContrast":true}})";
   spk_image out{};auto status=spk_simulate(e,&image,&p,&out);spk_image_free(&out);
   if((h<minimum&&status!=SPK_ERR_BAD_ARGS)||(h>=minimum&&status!=SPK_OK))return 15;
  }
  const int w=2048,h=128;std::vector<float> pixels(w*h*3,.18f);spk_image image{pixels.data(),w,h,SPK_CS_PROPHOTO},out{};
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.preview_max_size=128;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;
  p.experimental_json=R"({"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":"noritsu-ls600","noritsuJobEnabled":true,"noritsuJobNormalize":true,"noritsuLocalContrast":true}})";
  if(spk_simulate_preview(e,&image,&p,&out)!=SPK_OK)return 16;
  if(out.height<minimum)return 17;spk_image_free(&out);
  p.crop=1;p.crop_size[0]=.2f;p.crop_size[1]=.02f;
  for(float factor:{1.f,.8f}){
   p.upscale_factor=factor;
   if(spk_simulate_preview(e,&image,&p,&out)!=SPK_OK)return 18;
   if(out.width<minimum||out.height<minimum)return 19;spk_image_free(&out);
  }
  p.upscale_factor=.5f;
  if(spk_simulate_preview(e,&image,&p,&out)!=SPK_ERR_BAD_ARGS)return 20;
  p.crop=0;p.upscale_factor=1;
  std::vector<float> thin(128*16*3,.18f);spk_image shortInput{thin.data(),128,16,SPK_CS_PROPHOTO};
  for(const char* material:{"fujifilm_velvia_100","negs_ilford_hp5_plus_6p5min"}){
   p.film_profile=material;
   if(spk_simulate_preview(e,&shortInput,&p,&out)!=SPK_OK)return 21;
   spk_image_free(&out);
  }
  spk_engine_destroy(e);std::cout<<"PASS job-specific minimum "<<minimum<<" and valid narrow draft without bypass\n";return 0;
 }
 const int w=128,h=argc>3?std::stoi(argv[3]):16;std::vector<float> pixels(w*h*3,.18f);spk_image image{pixels.data(),w,h,SPK_CS_PROPHOTO};
 for(bool local:{false,true}){
  spk_params p{};spk_default_params(&p);p.film_profile="kodak_portra_400";p.scan_film=1;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;
  std::string j=std::string(R"({"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":"noritsu-ls600","noritsuJobEnabled":true,"noritsuJobNormalize":true,"noritsuLocalContrast":)")+(local?"true":"false")+"}}";p.experimental_json=j.c_str();spk_image out{};
  auto s=spk_simulate(e,&image,&p,&out);std::cout<<"128x"<<h<<" AutoContrast="<<local<<" status="<<int(s)<<" detail="<<spk_last_error_message()<<'\n';spk_image_free(&out);
 }
 spk_engine_destroy(e);
}
