/* Operator controls for the paperless scan workstation. GPLv3. */
#include "model/output_models.h"
#include "spektra.h"
#include <cstring>
#include <iostream>
#include <stdexcept>
using namespace spk::outputs;
void check(bool ok,const char* message) {if(!ok)throw std::runtime_error(message);std::cout<<"PASS "<<message<<'\n';}
int main(int argc,char**argv) try {
 if(argc!=2)return 2;
 Params neutral;
 for(auto value:{RGB{-.01,0,.03},RGB{.18,.18,.18},RGB{.9,.6,.2},RGB{1,1,1}}) {
  auto out=operator_tone(value,neutral);check(std::memcmp(value.data(),out.data(),sizeof(RGB))==0,"neutral operator is bit-identical");
 }
 Params contrast;contrast.contrast=2;
 auto dark=operator_tone({.09,.09,.09},contrast);
 auto mid=operator_tone({.18,.18,.18},contrast);
 check(dark[0]>.0&&dark[0]<.09&&std::abs(mid[0]-.18)<1e-14,"contrast pivots at 18% and darkens shadows");
 auto white=operator_tone({1,1,1},contrast);auto black=operator_tone({0,0,0},contrast);
 check(white[0]==1&&black[0]==0,"contrast retains neutral black and white endpoints");
 double last=-1;bool monotonic=true;
 for(int i=0;i<=1000;++i){double v=i/1000.;auto out=operator_tone({v,v,v},contrast);monotonic &= std::isfinite(out[0])&&out[0]>=last;last=out[0];}
 check(monotonic,"contrast ramp remains finite and monotonic");
 Params endpoints;endpoints.black=.02;endpoints.white=.8;
 check(std::abs(operator_tone({.02,.02,.02},endpoints)[0])<1e-14&&std::abs(operator_tone({.8,.8,.8},endpoints)[0]-1)<1e-14,"manual endpoints map to black and white");
 auto bounded=read_params(R"({"outputModel":{"contrast":9,"blackPoint":9,"whitePoint":-9}})");
 check(bounded.contrast==2&&bounded.black==.1&&bounded.white==.5&&bounded.white>bounded.black,"hostile endpoint ranges cannot cross");
 bool rejected=false;try{read_params(R"({"outputModel":{"contrast":1e309}})");}catch(...){rejected=true;}check(rejected,"nonfinite operator rejected");
 spk_engine* e=nullptr;check(spk_engine_create(argv[1],&e)==SPK_OK,"engine created");
 struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}}owner{e};
 const int w=48,h=32;std::vector<float> source(w*h*3);
 for(int i=0;i<w*h;++i)for(int c=0;c<3;++c)source[i*3+c]=.002+std::pow(double(i)/(w*h-1),2)*(c==0?.8:c==1?.6:.4);
 spk_image image{source.data(),w,h,SPK_CS_PROPHOTO};spk_params p;spk_default_params(&p);
 p.auto_exposure=0;p.scan_film=1;p.grain_active=0;p.halation_active=0;p.glare_active=0;p.scanner_unsharp[0]=0;p.scanner_unsharp[1]=0;p.preview_max_size=64;
 auto render=[&](const std::string& json,bool preview=false){p.experimental_json=json.c_str();spk_image out{};auto status=preview?spk_simulate_preview(e,&image,&p,&out):spk_simulate(e,&image,&p,&out);if(status!=SPK_OK)throw std::runtime_error(spk_last_error_message());std::vector<float> data(out.data,out.data+w*h*3);spk_image_free(&out);for(auto v:data)if(!std::isfinite(v)||v<0||v>1)throw std::runtime_error("invalid output");return data;};
 int renders=0;
 for(auto stock:{"kodak_portra_400","negs_ilford_hp5_plus_6p5min"})for(auto mode:{"digital","auto-levels","lab-scan"}) {
  p.film_profile=stock;std::string prefix=std::string("{\"outputModel\":{\"mode\":\"")+mode+"\"";
  auto base=render(prefix+"}}");
  for(auto control:{",\"contrast\":1.4",",\"blackPoint\":0.025",",\"whitePoint\":0.8"})check(render(prefix+control+"}}")!=base,"each scan operator reaches the engine");
  auto edited=prefix+",\"contrast\":1.3,\"blackPoint\":-0.01,\"whitePoint\":1.1}}";
  check(render(edited)==render(edited,true),"operator preview/export match at equal resolution");
  check(render(prefix+",\"contrast\":1,\"blackPoint\":0,\"whitePoint\":1}}" )==base,"explicit reset restores original scan pixels");
  renders+=7;
 }
 p.film_profile="kodak_portra_400";
 auto real=render(R"({"workflow":"negative-scan","outputModel":{"mode":"lab-scan"}})");
 const auto realEdit=R"({"workflow":"negative-scan","outputModel":{"mode":"lab-scan","contrast":1.4}})";
 check(real!=render(realEdit),"real negative scan operator reaches the receiver");
 check(render(realEdit)==render(realEdit,true),"real negative operator preview/export match");
 renders+=4;
 p.film_profile="fujifilm_velvia_100";check(render(R"({"outputModel":{"mode":"lab-scan"}})")==render(R"({"outputModel":{"mode":"lab-scan","contrast":2,"blackPoint":0.1,"whitePoint":0.5}})"),"slide bypass preserved");
 std::cout<<"PASS "<<renders+2<<" actual scan operator renders\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
