#pragma once
namespace spk {
// Stage kernels still enforce their own operator/shape/precision guards. The
// fused whole-pipeline and band planners retain their stronger Lab exclusions.
// Lab exports retain CPU film stages (device export validation is outstanding).
inline bool stage_gpu_requested(bool requested,bool lab,bool exporting,bool fits){
 return requested&&(!lab||(!exporting&&fits));
}
}
