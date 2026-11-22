/* GPL-3.0. The original arbitrary stencil and clamp boundary, never a surrogate. */
#include "gpu/vulkan_compute.h"
#include "model/layered_transport.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>

int main() try {
    if (!spk::gpu::available()) throw std::runtime_error("real Vulkan required");
    int comparisons = 0;
    for (auto shape : {std::pair<int,int>{192,128}, {97,83}, {8192,1}})
    for (int radius : {8,14}) for (int pattern = 0; pattern < 3; ++pattern) {
        const int w=shape.first,h=shape.second,side=2*radius+1;
        std::vector<double> kernel(side*side); double sum=0;
        // Deliberately asymmetric: a flipped/transposed stencil must fail.
        for(size_t i=0;i<kernel.size();i++) {kernel[i]=1+((i*1879)%997);sum+=kernel[i];}
        for(auto& k:kernel)k/=sum;
        std::vector<float> source(w*h),out(source.size());
        for(size_t i=0;i<source.size();i++)source[i]=pattern==0?3.25f:pattern==1?float(.001+16.*((i*1879)%65521)/65521.):0;
        if(pattern==2)source[0]=source[(h/2)*w+w/2]=1;
        const auto before=spk::gpu::transport_convolve_passes();
        if(!spk::gpu::transport_convolve(source.data(),w,h,kernel.data(),radius,out.data())||spk::gpu::transport_convolve_passes()<=before)
            throw std::runtime_error("stencil did not dispatch");
        double maximum=0;
        for(int y=0;y<h;y++)for(int x=0;x<w;x++){
            double expected=0;
            for(int dy=-radius;dy<=radius;dy++)for(int dx=-radius;dx<=radius;dx++)
                expected+=kernel[(dy+radius)*side+dx+radius]*source[std::clamp(y+dy,0,h-1)*w+std::clamp(x+dx,0,w-1)];
            double delta=std::abs(out[y*w+x]-expected);maximum=std::max(maximum,delta);
            if(!std::isfinite(delta)||delta>2e-5*std::max(std::abs(expected),1e-5))throw std::runtime_error("stencil or clamp boundary differs");
        }
        std::cout<<"PASS stencil "<<w<<"x"<<h<<" radius="<<radius<<" pattern="<<pattern<<" max="<<maximum<<'\n';++comparisons;
    }
    const int w=192,h=128;std::vector<double> source(w*h*3);
    for(size_t i=0;i<source.size();i++)source[i]=.001+((i*1879)%65521)/65521.;
    auto cpu=source,gpu=source;spk::transport::Params p;p.model="layered";p.anti=.4;
    double strengths[]={.1,.05,.025};
    spk::transport::apply(cpu.data(),w,h,"kodak_portra_400",p,strengths,.035,1,1);
    const auto before=spk::gpu::transport_convolve_passes();
    spk::transport::apply(gpu.data(),w,h,"kodak_portra_400",p,strengths,.035,1,1,true);
    if(spk::gpu::transport_convolve_passes()<=before)throw std::runtime_error("full optical solve did not use Vulkan");
    double maximum=0;for(size_t i=0;i<cpu.size();i++){double delta=std::abs(cpu[i]-gpu[i]);maximum=std::max(maximum,delta);if(!std::isfinite(delta)||delta>3e-5)throw std::runtime_error("full transport precision");}
    std::cout<<"PASS complete physical transport max="<<maximum<<'\n';
    std::vector<float> invalid(192*128,1),untouched(invalid.size(),17);std::vector<double> kernel(17*17,1./(17*17));invalid[0]=-1;
    if(spk::gpu::transport_convolve(invalid.data(),192,128,kernel.data(),8,untouched.data()))throw std::runtime_error("unsupported source accepted");
    for(float v:untouched)if(v!=17)throw std::runtime_error("preflight refusal wrote output");
    std::cout<<"PASS "<<comparisons<<" actual Vulkan stencils, full optical solve and refusal\n";
} catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
