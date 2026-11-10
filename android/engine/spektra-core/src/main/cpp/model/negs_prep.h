/* GPLv3. Negs Prep @26c903b; yosoyelchris d2a144d / Noah Haasis. */
#pragma once
#include <vector>
namespace spk {
struct NegsPrep {
 float exposure=0,highlights=0,shadows=0,contrast=0,lift=0,gain=0,color_boost=0,saturation=0,detail=0;
 bool active()const{return exposure!=0||controls();}
 bool controls()const{return highlights!=0||shadows!=0||contrast!=0||lift!=0||gain!=0||color_boost!=0||saturation!=0||detail!=0;}
};
NegsPrep read_negs_prep(const char* experimental_json);
void apply_negs_prep(float* rgb,int width,int height,const NegsPrep&,bool prophoto=true);
std::vector<float> negs_guided_base(const std::vector<float>&,int width,int height);
void negs_prep_core(const float* rgb,float base,const NegsPrep&,float* out);
}
