/* Exact parameterized stages from noritsu-tool/vendor.py (MIT); adapter GPLv3. */
#pragma once
#include "profiles/json_min.h"
#include <array>
#include <vector>
#include <memory>
#include <cstdint>
namespace spk::noritsu::advanced {
using Pixel=std::array<uint16_t,3>;
struct AutoContrast {int factor=0,size=0,strength=0,clamp=0;std::vector<int16_t> weights;std::vector<int32_t> intercept;std::vector<int16_t> blend;};
struct Sharp {std::array<int,5> sizes{},scales{};std::array<std::vector<int16_t>,5> kernels;int blend=0,meanRadius=0,featureRadius=0;std::vector<uint16_t> envelope,tone;std::vector<int16_t> response;};
struct Job {
 std::array<float,9> forward{},inverse{};std::array<float,6> sharpMatrix{};std::array<int16_t,3> offsets{};
 std::array<std::vector<uint16_t>,3> transfer,gamma;
 std::vector<uint16_t> yLut;std::vector<float> chromaScale;std::array<std::vector<int32_t>,2> chromaOffsets;
 std::vector<int16_t> hue;int saturation=100;std::array<int16_t,2> balance{};
 std::unique_ptr<AutoContrast> local;std::unique_ptr<Sharp> sharp;
 bool srgb=false;int bits=16;
};
std::shared_ptr<const Job> read_job(const json::Value& value);
// Input: RGB FilmLUT codes in float storage. Output: linear sRGB adapter.
// The same storage is compacted to u16 and expanded in reverse, without RGB frame copies.
void process(float* rgbCodes,int w,int h,const Job& job,bool local,bool sharp,bool hue);
// Raw-stage entry point for independent oracle tests; tightly packed C0,C1,Y words.
void stage(uint16_t* rgb,int w,int h,const Job& job,int which);
}
