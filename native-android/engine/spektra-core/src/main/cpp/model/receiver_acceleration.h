#pragma once
#include "profiles/profile.h"
#include <array>
#include <vector>
#include <cstdint>
namespace spk::outputs {
struct ReceiverGpuStats {uint64_t checks=0,frames=0,refusals=0;const char* reason="not-requested";};
ReceiverGpuStats receiver_gpu_stats();
// Read virtual LED energy using the existing spectral-integral shader. On any
// refusal/failure caller recomputes the entire image with its original f64 read.
// Only a successful call leaves a usable energy raster (before log10).
bool receiver_gpu_integral(const Profile&,const float*,int,float*,
 const std::vector<std::array<double,3>>&,const std::array<double,3>&);
}
