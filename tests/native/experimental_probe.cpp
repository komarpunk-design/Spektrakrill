// GPLv3. Host probe for the actual shipping native profile-preparation path.
#include "model/experimental.h"
#include "model/negative.h"
#include "model/negative_calibration.h"
#include "profiles/profile.h"
#include "model/density_curves.h"
#include "model/couplers.h"
#include "model/experimental_projection.h"
#include "model/negs_projection.h"
#include "io/npy_lut.h"
#include "runtime/stages/autoexposure.h"
#include <fstream>
#include <filesystem>
#include <iostream>
#include <iomanip>
#include <cmath>
void values(const std::vector<float>& data){std::cout<<'[';for(size_t i=0;i<data.size();i++){if(i)std::cout<<',';if(std::isfinite(data[i]))std::cout<<data[i];else std::cout<<"null";}std::cout<<']';}
int main(int argc,char** argv){try{
 if(argc==6&&std::string(argv[1])=="--calibrate"){
  std::ifstream json_file(argv[2]);std::string profile((std::istreambuf_iterator<char>(json_file)),std::istreambuf_iterator<char>());
  std::ifstream input(argv[5],std::ios::binary|std::ios::ate);size_t bytes=input.tellg();input.seekg(0);std::vector<float> data(bytes/sizeof(float));input.read(reinterpret_cast<char*>(data.data()),bytes);
  std::cout<<spk::calibrate_negative(profile,argv[3],data,std::string(argv[4])=="base")<<'\n';return 0;
 }
 if(argc==3&&std::string(argv[1])=="--render"){
  spk_engine* engine=nullptr;if(spk_engine_create(argv[2],&engine)!=SPK_OK)throw std::runtime_error("engine create failed");
  struct Owner{spk_engine* engine;~Owner(){spk_engine_destroy(engine);}} owner{engine};
  const int w=32,h=24;std::vector<float> input(w*h*3);for(int i=0;i<w*h;i++)for(int c=0;c<3;c++)input[i*3+c]=.01+.45*(i%37)/36.+.015*c;
  spk_image image{input.data(),w,h,SPK_CS_PROPHOTO};spk_params params;spk_default_params(&params);params.grain_active=0;params.halation_active=0;params.glare_active=0;params.dir_couplers_active=0;params.auto_exposure=0;params.scanner_unsharp[0]=0;params.scanner_unsharp[1]=0;
  auto render=[&](const char* tap=nullptr){spk_image out{};auto code=tap?spk_simulate_tap(engine,&image,&params,tap,&out):spk_simulate(engine,&image,&params,&out);if(code!=SPK_OK)throw std::runtime_error(std::string(spk_status_str(code))+": "+spk_last_error_message());std::vector<float> result(out.data,out.data+out.width*out.height*3);spk_image_free(&out);for(float v:result)if(!std::isfinite(v))throw std::runtime_error("nonfinite render");return result;};
  int count=0;
  for(const char* stock:{"kodak_portra_400","exp_kodak_portra_400","exp_kodak_doublex_6p5min","exp_kodak_trix_1min"}){
   params.film_profile=stock;params.print_profile="exp_kodak_portra_endura";
   for(int route=0;route<2;route++){params.scan_film=route;params.experimental_json="{}";auto baseline=render();if(render()!=baseline)throw std::runtime_error("memo instability");
    params.experimental_json=R"({"filmChemistry":true,"filmFast":1.3,"filmExhaustion":0.3,"printChemistry":true,"printSlow":0.9,"filmBaseActive":true,"filmBaseScale":1.2,"colorFilter":"hoya_r1","dirLangmuir":true})";params.dir_couplers_active=1;auto changed=render();params.dir_couplers_active=0;
    if(changed==baseline)throw std::runtime_error("controls have no effect");count++;
   }
  }
  params.film_profile="exp_kodak_portra_400";params.scan_film=0;
  for(const char* method:{"hanatos2025","mallett2019","otsu2018","jakob2019","arctic2026beta04","gauss-lasers"}){
   std::string json="{\"spectralMethod\":\""+std::string(method)+"\"}";params.experimental_json=json.c_str();render();count++;
  }
  params.experimental_json=R"({"workflow":"negative-print","scanIlluminant":"LED-B3"})";
  auto profile=spk::load_profile_file(std::string(argv[2])+"/profiles/exp_kodak_portra_400.json");auto settings=spk::negative_settings(params.experimental_json);spk::NegativeConverter converter(profile,settings,SPK_CS_PROPHOTO);
  std::vector<float> known(w*h*3);for(int i=0;i<w*h;i++){double density[3]={.2+.8*(i%19)/18.,.1+.9*(i%23)/22.,.3+.6*(i%17)/16.},rgb[3];converter.forward(density,rgb);for(int c=0;c<3;c++){input[i*3+c]=rgb[c];known[i*3+c]=density[c];}}
  auto recovered=render("film_density_cmy");for(size_t i=0;i<known.size();i++)if(std::abs(known[i]-recovered[i])>2e-4)throw std::runtime_error("negative route failed to bypass filming");
  auto printed=render();params.scan_film=1;params.experimental_json=R"({"workflow":"negative-scan","scanIlluminant":"LED-B3"})";auto scanned=render();params.experimental_json=R"({"workflow":"negative-clear","scanIlluminant":"LED-B3"})";auto clear=render();if(scanned==clear||printed==scanned)throw std::runtime_error("negative routes collapsed");
  params.experimental_json=R"({"grainRms":true})";params.grain_active=1;render();params.film_profile="exp_kodak_doublex_6p5min";render();
  params.experimental_json=R"({"grainRms":true,"grainScaleFast":0})";spk_image rejected{};if(spk_simulate(engine,&image,&params,&rejected)!=SPK_ERR_BAD_ARGS||rejected.data)throw std::runtime_error("invalid RMS controls escaped C API validation");
  std::cout<<"PASS "<<count<<" full native pipelines, deterministic memos, six spectral methods, inverse density recovery and all three negative routes, RMS finite output\n";return 0;
 }
 if(argc==7&&std::string(argv[1])=="--negative"){
  auto p=spk::load_profile_file(argv[2]);spk::prepare_experimental_profile(p,argv[3],true,1);
  auto settings=spk::negative_settings(argv[3]);spk::NegativeConverter converter(p,settings,static_cast<spk_color_space>(std::stoi(argv[4])));
  std::ifstream input(argv[5],std::ios::binary|std::ios::ate);size_t bytes=input.tellg();input.seekg(0);std::vector<float> data(bytes/sizeof(float)),out(data.size());input.read(reinterpret_cast<char*>(data.data()),bytes);
  converter.convert(data.data(),nullptr,1,data.size()/3,out.data());std::ofstream output(argv[6],std::ios::binary);output.write(reinterpret_cast<const char*>(out.data()),out.size()*sizeof(float));return 0;
 }
 if(argc>=3&&std::string(argv[1])=="--meter"){
  std::vector<double> raw(17*13*3);for(int i=0;i<17*13;i++)for(int c=0;c<3;c++)raw[i*3+c]=.01+.013*i+.12*c;
  std::cout<<std::setprecision(17)<<spk::measure_raw_autoexposure_ev(raw.data(),17,13,argv[2])<<'\n';return 0;
 }
 if(argc>=6&&std::string(argv[1])=="--spectral"){
  auto p=spk::load_profile_file(argv[2]);spk::select_experimental_spectral_method(p,argv[3]);
  const auto spectra=spk::load_npy(argv[4]);const double* illuminant=p.reference_illuminant=="T"?spk::experimental_spd_T:p.reference_illuminant=="BB3200"?spk::negs_spd_BB3200:spk::experimental_spd_D55;
  const float uv[3]={0,410,8},ir[3]={0,675,15};const auto raw=spk::build_experimental_tc_lut(p,spectra,illuminant,0,true,false,uv,ir);
  std::ofstream stream(argv[5],std::ios::binary);stream.write(reinterpret_cast<const char*>(raw.data.data()),raw.data.size()*sizeof(double));
  std::cout<<raw.shape[0]<<' '<<raw.shape[1]<<' '<<raw.shape[2]<<'\n';return 0;
 }
 if(argc==3&&std::string(argv[1])=="--all-profiles"){
  int count=0;for(auto& file:std::filesystem::directory_iterator(argv[2]))if(file.path().extension()==".json"){try{spk::load_profile_file(file.path().string());count++;}catch(const std::exception& e){std::cerr<<file.path()<<": "<<e.what()<<'\n';return 1;}}
  std::cout<<"Loaded "<<count<<" native profiles\n";return 0;
 }
 if(argc<4)return 2;
 auto profile=spk::load_profile_file(argv[1]);spk::prepare_experimental_profile(profile,argv[2],std::string(argv[3])=="film",argc>4?std::stod(argv[4]):1);
 spk::GrainParams grain;spk::configure_experimental_grain(grain,profile,argv[2]);
 std::vector<float> areas(3);for(int c=0;c<3;c++)areas[c]=grain.agx_particle_scale[c];
 std::vector<float> texture(48);for(int i=0;i<16;i++)for(int c=0;c<3;c++)texture[i*3+c]=static_cast<float>(.15+.008*i+.03*c);
 spk::finish_experimental_grain(texture.data(),4,4,grain,0);
 std::vector<float> normalized=profile.density_curves;
 for(int c=0;c<3;c++){float floor=1e30f;for(int x=0;x<profile.n_density_pts;x++)floor=std::min(floor,normalized[x*3+c]);for(int x=0;x<profile.n_density_pts;x++)normalized[x*3+c]-=floor;}
 std::vector<float> lograw(192),density(192),coupled(192);const float gamma[]={1,1,1};
 for(int i=0;i<64;i++)for(int c=0;c<3;c++)lograw[i*3+c]=static_cast<float>(profile.log_exposure.front()+(profile.log_exposure.back()-profile.log_exposure.front())*(i+(profile.monochrome?0:.3*c))/65.);
 spk::interpolate_exposure_to_density(lograw.data(),64,normalized.data(),profile.log_exposure.data(),profile.n_density_pts,gamma,density.data());
 spk::DirCouplersParams dir;dir.active=true;dir.gamma_samelayer_rgb[0]=.341;dir.gamma_samelayer_rgb[1]=.324;dir.gamma_samelayer_rgb[2]=.273;
 dir.gamma_interlayer_r_to_gb[0]=.355;dir.gamma_interlayer_r_to_gb[1]=.305;dir.gamma_interlayer_g_to_rb[0]=.154;dir.gamma_interlayer_g_to_rb[1]=.358;dir.gamma_interlayer_b_to_rg[0]=.171;dir.gamma_interlayer_b_to_rg[1]=.225;
 spk::configure_experimental_couplers(dir,argv[2],&profile);
 dir.diffusion_size_um=argc>5?std::stod(argv[5]):0;
 spk::apply_density_correction_dir_couplers_spatial(density.data(),8,8,lograw.data(),profile.log_exposure.data(),normalized.data(),profile.n_density_pts,dir,profile.is_positive(),gamma,10,coupled.data());
 std::cout<<std::setprecision(10)<<"{\"curves\":";values(profile.density_curves);std::cout<<",\"layers\":";values(profile.density_curves_layers);std::cout<<",\"base\":";values(profile.base_density);std::cout<<",\"sensitivity\":";values(profile.log_sensitivity);std::cout<<",\"areas\":";values(areas);std::cout<<",\"texture\":";values(texture);std::cout<<",\"lograw\":";values(lograw);std::cout<<",\"coupled\":";values(coupled);std::cout<<"}\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
