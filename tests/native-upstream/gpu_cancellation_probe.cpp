/* GPLv3. Every cancellation boundary must leave the persistent Vulkan state reusable. */
#include "gpu/vulkan_compute.h"
#include "kernels/parallel.h"
#include <vector>
#include <cmath>
#include <iostream>
#include <stdexcept>
struct Poll { int calls=0, limit=0; };
static int check(void* p) { auto& x=*static_cast<Poll*>(p);return ++x.calls==x.limit; }
int main() try {
 if(!spk::gpu::available())throw std::runtime_error("actual Vulkan required");
 constexpr int n=2048;std::vector<float> source(n*3),reference(n*3),result(n*3);
 float dyes[81*3],icmf[81*3],matrix[]={1,0,0,0,1,0,0,0,1};
 for(int i=0;i<n*3;i++)source[i]=float(i%137)*.013f;
 for(int i=0;i<81*3;i++){dyes[i]=.01f+float(i%17)*.025f;icmf[i]=.0005f+float(i%11)*.00003f;}
 auto render=[&](float* out){return spk::gpu::scan_spectral_linear(source.data(),out,n,dyes,icmf,matrix);};
 if(!render(reference.data()))throw std::runtime_error("Vulkan scan refused");
 Poll count;
 { spk::ParallelCancellationScope scope(check,&count);if(!render(result.data()))throw std::runtime_error("scoped scan refused"); }
 if(result!=reference)throw std::runtime_error("cancellation scope changed output");
 int cancelled=0;
 for(int limit=1;limit<=std::min(count.calls+8,96);++limit) {
  Poll request{0,limit};bool interrupted=false;
  try {spk::ParallelCancellationScope scope(check,&request);render(result.data());}
  catch(const spk::ParallelCancelled&){interrupted=true;++cancelled;}
  if(!render(result.data())||result!=reference)throw std::runtime_error("cancel poisoned the next Vulkan scan");
  if(interrupted&&request.calls<limit)throw std::runtime_error("unexpected cancellation");
 }
 if(cancelled<2)throw std::runtime_error("cancellation probe did not reach enough boundaries");
 std::cout<<"PASS "<<cancelled<<" Vulkan cancellation boundaries and exact warm recovery\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
