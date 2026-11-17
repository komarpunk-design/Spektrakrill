/* Partial Noritsu reconstruction: independent upstream oracle and real renders. GPLv3. */
#include "model/output_models.h"
#include "spektra.h"
#include <fstream>
#include <iostream>
#include <cstring>
using namespace spk::outputs;
void check(bool ok,const char* message){if(!ok)throw std::runtime_error(message);std::cout<<"PASS "<<message<<'\n';}
std::vector<uint16_t> golden(const std::string& path,size_t n){std::vector<uint16_t> v(n);std::ifstream f(path,std::ios::binary);f.read(reinterpret_cast<char*>(v.data()),n*2);if(size_t(f.gcount())!=n*2)throw std::runtime_error("missing/truncated oracle fixture");return v;}
int main(int argc,char**argv)try{
 if(argc!=3)return 2;
 auto film=golden(std::string(argv[2])+"/film.bin",4096*3),tone=golden(std::string(argv[2])+"/tone.bin",65536*3);
 for(unsigned i=0;i<4096;i++){auto out=spk::noritsu::film_bgr({uint16_t(i),uint16_t(4095-i),uint16_t(i*7%4096)});for(int c=0;c<3;c++)if(out[c]!=film[i*3+c])throw std::runtime_error("FilmLUT lane mismatch");}
 check(true,"all 12,288 FilmLUT outputs equal original upstream BGR kernel");
 for(unsigned i=0;i<65536;i++)for(int c=0;c<3;c++)if(spk::noritsu::tone(c,i)!=tone[i*3+c])throw std::runtime_error("gamma mismatch at "+std::to_string(i)+" channel "+std::to_string(c));
 check(true,"all 196,608 gamma outputs equal original upstream NumPy kernel");
 bool rejects=false;try{spk::noritsu::film_bgr({4096,0,0});}catch(...){rejects=true;}check(rejects,"12-bit table domain enforced");
 spk_engine* e=nullptr;check(spk_engine_create(argv[1],&e)==SPK_OK,"engine created");struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}}owner{e};
 const int w=48,h=32;std::vector<float> source(w*h*3);
 for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)source[i*3+c]=.002+std::pow(double(i)/(w*h-1),2)*(c==0?.8:c==1?.6:.4);
 spk_image image{source.data(),w,h,SPK_CS_PROPHOTO};spk_params p;spk_default_params(&p);p.auto_exposure=0;p.scan_film=1;p.grain_active=0;p.halation_active=0;p.glare_active=0;p.dir_couplers_active=0;p.scanner_unsharp[0]=0;p.scanner_unsharp[1]=0;p.preview_max_size=64;
 int renders=0;
 auto render=[&](std::string json,bool preview=false){p.experimental_json=json.c_str();spk_image out{};auto status=preview?spk_simulate_preview(e,&image,&p,&out):spk_simulate(e,&image,&p,&out);if(status!=SPK_OK)throw std::runtime_error(spk_last_error_message());std::vector<float> data(out.data,out.data+w*h*3);spk_image_free(&out);renders++;for(auto v:data)if(!std::isfinite(v)||v<0||v>1)throw std::runtime_error("invalid output");return data;};
 const std::string prefix="{\"outputModel\":{\"mode\":\"noritsu-ls600\"";
 for(auto stock:{"kodak_portra_400","kodak_gold_200"}){
  p.film_profile=stock;auto base=render(prefix+"}}");
  for(auto control:{",\"exposure\":1",",\"cyan\":0.3",",\"magenta\":0.3",",\"yellow\":0.3",",\"contrast\":1.4",",\"blackPoint\":0.025",",\"whitePoint\":0.8",",\"autoSetup\":false"})check(base!=render(prefix+control+"}}"),"Noritsu operator affects pixels");
  check(render(prefix+",\"look\":0}}")==render(prefix+",\"look\":1}}"),"Fotufilm finish is absent");
  const auto edited=prefix+",\"exposure\":0.7,\"cyan\":0.2,\"contrast\":1.3}}";
  check(render(edited)==render(edited,true),"Noritsu preview and export match at equal resolution");
  check(base==render(prefix+",\"contrast\":1,\"blackPoint\":0,\"whitePoint\":1}}"),"neutral controls preserve pixels");
 }
 p.film_profile="kodak_portra_400";
 for(auto cs:{SPK_CS_SRGB,SPK_CS_ADOBE_RGB,SPK_CS_PROPHOTO,SPK_CS_REC2020,SPK_CS_LINEAR_SRGB}){p.output_color_space=cs;check(render(prefix+"}}")==render(prefix+"}}",true),"Noritsu color-space output is finite and preview/export identical");}p.output_color_space=SPK_CS_SRGB;
 const auto fixed=prefix+",\"autoSetup\":false}}";
 auto before=render(fixed);auto savedSource=source;
 for(int i=w*h/2;i<w*h;i++)for(int c=0;c<3;c++)source[i*3+c]*=3;
 auto changedFrame=render(fixed);
 check(std::memcmp(before.data(),changedFrame.data(),w*h/2*3*sizeof(float))==0,"fixed adapter does not retime identical pixels when frame composition changes");source=savedSource;
 p.film_profile="negs_ilford_hp5_plus_6p5min";
 check(render(prefix+"}}")==render(R"({"outputModel":{"mode":"digital"}})"),"BW explicitly uses Digital Reference fallback");
 p.film_profile="fujifilm_velvia_100";
 check(render(prefix+"}}")==render(R"({"outputModel":{"mode":"digital"}})"),"slide bypass preserved");
 p.film_profile="kodak_portra_400";
 const auto real=R"({"workflow":"negative-scan","outputModel":{"mode":"noritsu-ls600","exposure":0.4}})";
 check(render(real)==render(real,true),"real-negative route preview/export match");
 std::cout<<"PASS "<<renders<<" actual Noritsu renders\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
