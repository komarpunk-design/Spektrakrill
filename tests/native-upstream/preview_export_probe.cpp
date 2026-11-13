// Compare complete preview/export processing at identical source resolution. GPLv3.
#include "spektra.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <vector>
int main(int argc,char** argv) try {
    if(argc!=2)return 2;
    spk_engine* engine=nullptr;
    if(spk_engine_create(argv[1],&engine)!=SPK_OK)throw std::runtime_error("engine creation failed");
    struct Owner{spk_engine* e;~Owner(){spk_engine_destroy(e);}}owner{engine};
    constexpr int w=48,h=32;
    std::vector<float> pixels(w*h*3);
    for(int y=0;y<h;++y)for(int x=0;x<w;++x)for(int c=0;c<3;++c)
        pixels[(y*w+x)*3+c]=.001f+float(std::pow(double(x+1)/w,2.1)*(c==0?.9:c==1?.55:.3)+.025*double(y)/h);
    spk_image input{pixels.data(),w,h,SPK_CS_PROPHOTO};
    int checks=0,failures=0;
    for(auto film:{"kodak_gold_200","kodak_portra_400","negs_ilford_hp5_plus_6p5min","fujifilm_velvia_100"})
    for(auto route:{"legacy","paper","digital","auto-levels","lab-scan"})
    for(int lut=0;lut<2;++lut)
    for(int gpu=0;gpu<2;++gpu) {
        spk_params p{};spk_default_params(&p);p.film_profile=film;p.print_profile="kodak_portra_endura";
        p.auto_exposure=0;p.preview_max_size=64;p.scan_film=std::strcmp(route,"paper")!=0&&std::strcmp(route,"legacy")!=0;
        p.use_scanner_lut=lut;p.use_enlarger_lut=lut;p.gpu_preview=gpu;p.gpu_export=gpu;
        p.grain_active=0;p.halation_active=0;p.glare_active=0;
        const std::string lab=std::string("{\"outputModel\":{\"mode\":\"")+route+"\",\"look\":0.6}}";
        p.experimental_json=std::strcmp(route,"legacy")==0?nullptr:lab.c_str();
        for(int spatial=0;spatial<2;++spatial) {
            p.grain_active=spatial;p.halation_active=spatial;
            spk_image preview{},full{};
            auto a=spk_simulate_preview(engine,&input,&p,&preview);
            auto b=spk_simulate(engine,&input,&p,&full);
            if(a!=SPK_OK||b!=SPK_OK)throw std::runtime_error(std::string("render failed: ")+spk_last_error_message());
            if(preview.width!=w||preview.height!=h||full.width!=w||full.height!=h||!preview.data||!full.data)throw std::runtime_error("unexpected output geometry");
            double maxError=0,mean=0;
            for(int i=0;i<w*h*3;++i){if(!std::isfinite(preview.data[i])||!std::isfinite(full.data[i]))throw std::runtime_error("nonfinite output");double d=std::abs(double(preview.data[i])-full.data[i]);maxError=std::max(maxError,d);mean+=d;}
            const bool unchanged=p.use_scanner_lut==lut&&p.use_enlarger_lut==lut&&p.gpu_export==gpu&&p.gpu_preview==gpu&&p.allow_gpu_scan==0;
            const bool same=unchanged&&std::memcmp(preview.data,full.data,w*h*3*sizeof(float))==0;
            std::cout<<(same?"PASS ":"FAIL ")<<film<<" "<<route<<" effects="<<spatial<<" LUT="<<lut<<" GPU-request="<<gpu<<" max="<<maxError<<" mean="<<mean/(w*h*3)<<'\n';
            ++checks;if(!same)++failures;spk_image_free(&preview);spk_image_free(&full);
        }
    }
    std::cout<<checks<<" comparisons; "<<failures<<" mismatches\n";return failures?1:0;
} catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
