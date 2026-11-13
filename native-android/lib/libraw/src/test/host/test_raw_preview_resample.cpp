/* Independent sampling/geometry regressions for RAW previews. GPLv3. */
#include "raw_preview_resample.h"
#include <array>
#include <cmath>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace spectrafilm;
void check(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
    std::cout << "ok   " << message << '\n';
}
int main() try {
    for (int edge : {256, 640, 1024, 1536, 1792, 2048}) {
        const auto s = preview::boundedSize(6240, 4155, edge);
        check(s.width == edge && s.height <= edge && s.height > 0,
              "26MP frame uses the requested long edge exactly");
        const auto p = preview::boundedSize(4155, 6240, edge);
        check(p.height == edge && p.width == s.height, "portrait geometry agrees");
    }
    const auto native = preview::boundedSize(6240, 4155, 0);
    check(native.width == 6240 && native.height == 4155, "uncapped export dimensions preserved");
    check(preview::boundedSize(13, 7, 2048).width == 13, "small sources are never enlarged");

    std::vector<uint16_t> checker(8*8*3);
    for (int y=0;y<8;++y) for (int x=0;x<8;++x) for (int c=0;c<3;++c)
        checker[(y*8+x)*3+c] = ((x+y)%2) ? 60000 : 0;
    const auto before = checker;
    std::vector<float> out(4*4*3+1, -99.f);
    check(preview::reduce(checker.data(),8,0,0,8,8,{4,4},1.f,out.data()), "checker reduction completes");
    bool neutral=true;
    for(int i=0;i<4*4*3;++i) neutral &= std::abs(out[i]-30000.f)<.001f;
    check(neutral, "fine detail averages to neutral instead of nearest-pixel aliasing");
    check(checker==before && out.back()==-99.f, "input and output guard remain intact");

    // Noninteger 3 -> 2 footprints each contain one dark pixel and half the bright one.
    const uint8_t impulse[] = {0,0,0, 90,90,90, 0,0,0};
    float fractional[6] = {};
    preview::reduce(impulse,3,0,0,3,1,{2,1},1.f,fractional);
    bool correct=true; for(float v:fractional) correct &= std::abs(v-30.f)<1e-6f;
    check(correct,"fractional area weights retain brightness and phase at odd ratios");

    // Bright guard border around a black odd-sized active area must never leak in.
    std::vector<uint16_t> cropped(7*5*3,65535);
    for(int y=1;y<4;++y) for(int x=1;x<6;++x) for(int c=0;c<3;++c) cropped[(y*7+x)*3+c]=1234;
    float active[3*1*3] = {};
    preview::reduce(cropped.data(),7,1,1,5,3,{3,1},1.f,active);
    correct=true; for(float v:active) correct &= std::abs(v-1234.f)<1e-4f;
    check(correct,"cropped stride and partial edge footprints exclude masked borders");

    float copy[9] = {};
    const uint16_t samples[] = {0,1,2, 1024,4095,16383, 32767,65534,65535};
    const float scale=1.f/65535.f;
    preview::reduce(samples,3,0,0,3,1,{3,1},scale,copy);
    correct=true;for(int i=0;i<9;++i){float expected=float(samples[i])*scale;correct &= std::memcmp(&expected,&copy[i],sizeof(float))==0;}
    check(correct,"full-resolution conversion remains bit-identical");
    std::atomic<bool> cancelled{true};
    check(!preview::reduce(samples,3,0,0,3,1,{2,1},scale,copy,&cancelled),"cancellation stops bounded filtering");
    return 0;
} catch(const std::exception& e) {std::cerr << "FAIL: " << e.what() << '\n';return 1;}
