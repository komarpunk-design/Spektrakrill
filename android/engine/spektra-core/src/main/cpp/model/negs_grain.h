// GPLv3. Four-layer monochrome grain adapter for Negs profiles.
#pragma once
#include "profiles/profile.h"
#include "model/grain.h"
namespace spk {
bool apply_negs_grain(const Profile&,const float* normalized_curves,float* density,int width,int height,double pixel_um,const GrainParams&);
}
