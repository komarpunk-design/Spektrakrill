// Test shipping output adapters and LabScanFinish; upstream algorithm Apache-2.0.
#include "model/output_models.h"
#include "spektra.h"
#include <iostream>
#include <iomanip>
#include <stdexcept>
int main(int argc,char** argv)try{
 if(argc==5&&std::string(argv[1])=="--finish"){auto rgb=spk::outputs::finish({std::stod(argv[2]),std::stod(argv[3]),std::stod(argv[4])});std::cout<<std::setprecision(15)<<'['<<rgb[0]<<','<<rgb[1]<<','<<rgb[2]<<"]\n";return 0;}
 if(argc!=2)return 2;
 spk_engine* engine=nullptr;if(spk_engine_create(argv[1],&engine)!=SPK_OK)throw std::runtime_error("engine create");struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}} owner{engine};
 int w=48,h=32;std::vector<float> input(w*h*3);for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)input[i*3+c]=.002+std::pow(double(i)/(w*h-1),2)*(c==0?.8:c==1?.6:.4);
 spk_image image{input.data(),w,h,SPK_CS_PROPHOTO};spk_params p{};spk_default_params(&p);p.print_profile="kodak_portra_endura";p.auto_exposure=0;p.grain_active=0;p.halation_active=0;p.dir_couplers_active=0;p.glare_active=0;p.scanner_unsharp[0]=0;p.scanner_unsharp[1]=0;p.scan_film=1;
 auto render=[&](std::string json){p.experimental_json=json.c_str();spk_image out{};auto status=spk_simulate(engine,&image,&p,&out);if(status!=SPK_OK)throw std::runtime_error(std::string(p.film_profile)+" status="+std::to_string(status)+" "+json+" "+spk_last_error_message());std::vector<float> result(out.data,out.data+out.width*out.height*3);spk_image_free(&out);for(auto v:result)if(!std::isfinite(v)||v<0||v>1)throw std::runtime_error("invalid output");return result;};
 int renders=0;for(auto stock:{"kodak_portra_400","negs_cinestill_800t","negs_ilford_hp5_plus_6p5min","fujifilm_velvia_100"}){
 p.film_profile=stock;auto baseline=render("{}");if(render(R"({"outputModel":{"mode":"paper"}})")!=baseline)throw std::runtime_error("default model changed old pixels");
 auto digital=render(R"({"outputModel":{"mode":"digital"}})");auto lab=render(R"({"outputModel":{"mode":"lab-scan"}})");
 if(std::string(stock)!="fujifilm_velvia_100"){
 if(digital==baseline||lab==digital)throw std::runtime_error("output has no effect");if(render(R"({"outputModel":{"mode":"lab-scan"}})")!=lab)throw std::runtime_error("unstable memo");
 if(render(R"({"outputModel":{"mode":"digital","exposure":1}})")==digital)throw std::runtime_error("operator exposure ignored");
 auto neutral=render(R"({"outputModel":{"mode":"lab-scan","look":0,"autoSetup":false}})");if(neutral!=digital)throw std::runtime_error("zero Lab finish must equal fixed digital receiver");
 for(auto cs:{SPK_CS_SRGB,SPK_CS_ADOBE_RGB,SPK_CS_PROPHOTO,SPK_CS_REC2020,SPK_CS_LINEAR_SRGB}){p.output_color_space=cs;render(R"({"outputModel":{"mode":"auto-levels"}})");renders++;}p.output_color_space=SPK_CS_SRGB;
 }else if(lab!=baseline)throw std::runtime_error("slide must bypass negative inversion");
 renders+=5;}
 p.film_profile="kodak_portra_400";p.auto_exposure=1;std::fill(input.begin(),input.end(),.184f);auto gray=render(R"({"outputModel":{"mode":"digital"}})");double mean=0;for(auto v:gray)mean+=v;mean/=gray.size();if(mean<.15||mean>.8)throw std::runtime_error("Native mid-grey misplaced: "+std::to_string(mean));
 std::cout<<"Native encoded mid-grey "<<mean<<"; ";
 std::cout<<"PASS "<<renders<<" native output renders: default identity, digital/auto/Lab, operator keys, repeated memo, slide bypass and five colour spaces\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
