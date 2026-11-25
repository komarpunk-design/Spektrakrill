/* GPLv3. Adapter only: production Android RAW decoder and film engine, without JNI. */
#include "raw_decoder.h"
#include "spektra.h"
#include "runtime/memory_budget.h"
#include "process_limit.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/resource.h>
#include <cmath>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

struct Fd { int value; ~Fd(){ if(value>=0)::close(value); } };
struct EngineDeleter { void operator()(spk_engine* p)const{spk_engine_destroy(p);} };
struct Image { spk_image value{}; ~Image(){spk_image_free(&value);} };
int main(int argc,char** argv)try {
    if(argc!=6)throw std::runtime_error("Usage: spektrafilm-develop INPUT ASSETS OUTPUT_DIR natural|warm|bw MAX_EDGE");
    const std::string look=argv[4];
    if(look!="natural"&&look!="warm"&&look!="bw")throw std::runtime_error("Unknown look");
    const int edge=std::stoi(argv[5]);
    if(edge!=0&&(edge<512||edge>6000))throw std::runtime_error("MAX_EDGE must be 0 (full resolution) or 512..6000");
    const uint16_t byte_order=1;if(*reinterpret_cast<const uint8_t*>(&byte_order)!=1)throw std::runtime_error("Little-endian host required");
    // A malformed or oversized input cannot consume the server's entire address space.
    if(!lower_address_space_limit(3ULL<<30))throw std::runtime_error("Cannot establish worker memory limit");
    spk::memory::process_memory_budget().set_limit_bytes(1536ULL<<20);
    Fd input{::open(argv[1],O_RDONLY|O_CLOEXEC)};
    if(input.value<0)throw std::runtime_error("Cannot open RAW input");
    std::unique_ptr<FILE,decltype(&std::fclose)> scratch(std::tmpfile(),&std::fclose);
    if(!scratch)throw std::runtime_error("Cannot create private RAW scratch file");
    spectrafilm::DecodeOptions options;
    options.whiteBalance=spectrafilm::WhiteBalanceMode::AsShot;
    options.halfSize=false;options.maxLongEdge=edge;
    options.admittedBytes=1536ULL<<20;options.inputScratchFd=fileno(scratch.get());
    std::cerr<<"decode\n";
    auto decoded=spectrafilm::decodeFromFd(input.value,options);
    if(!decoded.ok)throw std::runtime_error("RAW decoder ["+std::to_string(decoded.status)+"]: "+decoded.error);
    spk_engine* handle=nullptr;
    if(spk_engine_create(argv[2],&handle)!=SPK_OK)throw std::runtime_error("Cannot load film engine assets");
    std::unique_ptr<spk_engine,EngineDeleter> engine(handle);
    spk_params p{};spk_default_params(&p);
    const bool mono=look=="bw";
    p.film_profile=mono?"negs_ilford_hp5_plus_6p5min":look=="warm"?"kodak_gold_200":"kodak_portra_400";
    p.print_profile="kodak_portra_endura";p.scan_film=1;
    p.auto_exposure=1;p.auto_exposure_method="matrix";
    p.film_format_mm=36;p.grain_active=1;p.halation_active=1;p.dir_couplers_active=!mono;
    p.output_color_space=SPK_CS_SRGB;p.output_cctf_encoding=1;p.output_gamut_compress=6;
    std::string recipe=mono?
        R"({"spectralMethod":"arctic2026beta04","grainRms":true,"dirLangmuir":false,"layeredTransport":{"model":"layered"},"outputModel":{"mode":"digital","autoSetup":true}})":
        R"({"spectralMethod":"arctic2026beta04","grainRms":true,"dirLangmuir":true,"layeredTransport":{"model":"layered"},"noritsuJobId":"ls600-g0t1-neutral-v1","outputModel":{"mode":"noritsu-ls600","autoSetup":true,"noritsuJobEnabled":true,"noritsuLocalContrast":true,"noritsuFilmSharp":true,"noritsuHueSat":true,"noritsuJobNormalize":true}})";
    p.experimental_json=recipe.c_str();
    spk_image source{decoded.rgb.data(),decoded.width,decoded.height,SPK_CS_PROPHOTO};Image output;
    std::cerr<<"develop "<<decoded.width<<"x"<<decoded.height<<"\n";
    const auto status=spk_simulate(engine.get(),&source,&p,&output.value);
    if(status!=SPK_OK)throw std::runtime_error("Film engine ["+std::to_string(status)+"]: "+spk_last_error_message());
    const size_t count=size_t(output.value.width)*output.value.height*3;
    for(size_t i=0;i<count;++i)if(!std::isfinite(output.value.data[i]))throw std::runtime_error("Nonfinite rendered pixels");
    const std::string directory=argv[3];
    std::ofstream pixels(directory+"/result.f32",std::ios::binary);
    pixels.write(reinterpret_cast<const char*>(output.value.data),count*sizeof(float));pixels.close();
    if(!pixels)throw std::runtime_error("Cannot finish rendered pixel file");
    std::ofstream meta(directory+"/render.json");
    meta<<"{\"width\":"<<output.value.width<<",\"height\":"<<output.value.height
        <<",\"format\":\"f32le-srgb\",\"film\":\""<<p.film_profile<<"\",\"look\":\""<<look
        <<"\",\"scanner\":\""<<(mono?"digital":"noritsu-ls600")
        <<"\",\"raw_decoder\":\"LibRaw native, full demosaic, linear ProPhoto\",\"max_edge\":"<<edge
        <<",\"lab\":"<<recipe<<"}\n";
    meta.close();if(!meta)throw std::runtime_error("Cannot finish render metadata");
    std::cerr<<"complete\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
