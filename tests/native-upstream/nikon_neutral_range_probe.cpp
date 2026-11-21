#include "model/output_models.h"
#include "spektra.h"
#include <iostream>
#include <stdexcept>
int main(int argc,char**argv)try{
 if(argc!=2)return 2;int errors=0;
 const double exposure[]={-2,-1.5,-1,-.6,0,.6,1,1.5,2};
 for(auto film:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400"}){
  auto f=spk::load_profile_file(std::string(argv[1])+"/profiles/"+film+".json");float density[27],out[27];
  for(int i=0;i<9;i++)for(int c=0;c<3;c++)density[i*3+c]=spk::outputs::density_at(f,exposure[i],c,1);
  for(bool automatic:{false,true})for(double ev:{-1.,0.,1.}){
   spk::outputs::Params p;p.mode="nikon-scan";p.automatic=automatic;p.exposure=ev;
   spk::outputs::scan(f,p,density,9,1,out,1,SPK_CS_SRGB,true,0,0,0);
   for(int i=0;i<9;i++){
    const double spread=std::max({out[i*3],out[i*3+1],out[i*3+2]})-std::min({out[i*3],out[i*3+1],out[i*3+2]});
    for(int c=0;c<3;c++)if(!std::isfinite(out[i*3+c]))throw std::runtime_error("nonfinite output");
    if(spread>.004){errors++;std::cerr<<"CAST "<<film<<" auto="<<automatic<<" EV="<<ev<<" axis="<<exposure[i]<<" RGB="<<out[i*3]<<","<<out[i*3+1]<<","<<out[i*3+2]<<'\n';}
   }
  }
 }
 // A small blue-only exposure change must not become a red cast. This
 // failed before full-channel virtual-input adaptation (ratio 0.46..0.50).
 for(auto film:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400"}){
  auto f=spk::load_profile_file(std::string(argv[1])+"/profiles/"+film+".json");float d[6],out[6];
  for(int i=0;i<2;i++)for(int c=0;c<3;c++)d[i*3+c]=spk::outputs::density_at(f,c==2?(i?.015:-.015):0,c,1);
  spk::outputs::Params p;p.mode="nikon-scan";p.automatic=false;spk::outputs::scan(f,p,d,2,1,out,1,SPK_CS_LINEAR_SRGB,false,0,0,0);
  const double red=std::abs(std::log10(out[3]/out[0])),blue=std::log10(out[5]/out[2]);
  if(blue<=0||red/blue>.2)throw std::runtime_error("blue leaks excessively into red");
  std::cout<<"PASS blue/red separation "<<film<<" cross="<<red/blue<<'\n';
 }
 spk_engine* engine=nullptr;if(spk_engine_create(argv[1],&engine)!=SPK_OK)throw std::runtime_error("engine initialization");
 const double levels[]={.001,.003,.01,.03,.09,.18,.36,.6,.9};std::vector<float> source(9*3);for(int i=0;i<9;i++)for(int c=0;c<3;c++)source[i*3+c]=levels[i];
 for(auto film:{"kodak_portra_400","kodak_gold_200","exp_kodak_portra_400"}){
  spk_params p{};spk_default_params(&p);p.film_profile=film;p.input_cctf_decoding=0;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;p.scan_film=1;
  p.experimental_json=R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":"nikon-scan","autoSetup":false}})";
  spk_image input{source.data(),9,1,SPK_CS_PROPHOTO},out{};if(spk_simulate(engine,&input,&p,&out)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
  for(int i=0;i<9;i++){double spread=std::max({out.data[i*3],out.data[i*3+1],out.data[i*3+2]})-std::min({out.data[i*3],out.data[i*3+1],out.data[i*3+2]});
   if(spread>.02){errors++;std::cerr<<"PHOTO CAST "<<film<<" level="<<levels[i]<<" RGB="<<out.data[i*3]<<","<<out.data[i*3+1]<<","<<out.data[i*3+2]<<'\n';}
  }spk_image_free(&out);
 }
 // The scanner calibration must not undo an explicit red-channel development edit.
 spk_params p{};spk_default_params(&p);p.film_profile="exp_kodak_portra_400";p.input_cctf_decoding=0;p.auto_exposure=0;p.grain_active=p.halation_active=p.dir_couplers_active=p.glare_active=0;p.scanner_unsharp[1]=0;p.scan_film=1;
 spk_image input{source.data(),9,1,SPK_CS_PROPHOTO},base{},edited{};
 p.experimental_json=R"({"spectralMethod":"arctic2026beta04","outputModel":{"mode":"nikon-scan","autoSetup":false}})";
 if(spk_simulate(engine,&input,&p,&base)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
 p.experimental_json=R"({"spectralMethod":"arctic2026beta04","filmChemistry":true,"filmRed":1.35,"outputModel":{"mode":"nikon-scan","autoSetup":false}})";
 if(spk_simulate(engine,&input,&p,&edited)!=SPK_OK)throw std::runtime_error(spk_last_error_message());
 double channelEdit=0;for(int i=0;i<9;i++)channelEdit=std::max(channelEdit,double(std::abs((edited.data[i*3]-edited.data[i*3+1])-(base.data[i*3]-base.data[i*3+1]))));
 spk_image_free(&base);spk_image_free(&edited);if(channelEdit<.02)throw std::runtime_error("Nikon calibration cancels manual channel chemistry");
 std::cout<<"PASS manual red chemistry retained, delta="<<channelEdit<<'\n';
 spk_engine_destroy(engine);
 if(errors)throw std::runtime_error(std::to_string(errors)+" gray patches have a color cast");
 std::cout<<"PASS 162 density gray patches and 27 actual photo gray patches\n";
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
