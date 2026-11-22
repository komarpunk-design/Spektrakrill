/* GPL-3.0. Virtual LED receiver acceleration, same spectral integral as CPU. */
#include "model/receiver_acceleration.h"
#include "gpu/vulkan_compute.h"
#include "runtime/stage_timer.h"
#include <atomic>
#include <mutex>
#include <unordered_map>
#include <cmath>
#include <cstring>
#include <chrono>
#include <cstdlib>
#ifdef __ANDROID__
#include <android/log.h>
#endif
namespace spk::outputs {
namespace {
std::atomic<uint64_t> checks{0},frames{0},refusals{0};
thread_local const char* lastReason="not-requested";
void note(const char* reason){
#ifdef __ANDROID__
 if(std::strcmp(lastReason,reason))__android_log_print(ANDROID_LOG_INFO,"Spektra","LED receiver: %s",reason);
#endif
 lastReason=reason;
}
std::mutex guard;
std::unordered_map<uint64_t,bool> validated;
constexpr float identity[]={1,0,0,0,1,0,0,0,1};
uint64_t hash(const void* p,size_t n,uint64_t h=1469598103934665603ull){auto b=static_cast<const unsigned char*>(p);for(size_t i=0;i<n;i++){h^=b[i];h*=1099511628211ull;}return h;}
}
ReceiverGpuStats receiver_gpu_stats(){return {checks.load(),frames.load(),refusals.load(),lastReason};}
bool receiver_gpu_integral(const Profile& f,const float* in,int count,float* out,
 const std::vector<std::array<double,3>>& bands,const std::array<double,3>& sums)try{
 auto refuse=[](const char* reason){++refusals;note(reason);return false;};
 // Diagnostic override for isolating this stage without changing Fast RNG.
 const char* enabled=std::getenv("SPK_RECEIVER_GPU");
 if(enabled&&enabled[0]=='0')return refuse("disabled");
 if(count<4096)return refuse("small-frame");
 if(!in||!out)return refuse("null-buffer");
 if(f.n_samples!=81||bands.size()!=81||f.channel_density.size()!=243||f.base_density.size()!=81)return refuse("spectral-shape");
 if(in==out)return refuse("aliased-buffer");
 if(!gpu::available())return refuse("vulkan-unavailable");
 std::array<float,243> dye{},cmf{};std::array<float,3> upper{6,6,6};
 for(size_t i=0;i<f.density_curves.size();i++)if(std::isfinite(f.density_curves[i]))upper[i%3]=std::max(upper[i%3],float(f.density_curves[i]*1.25));
 for(int i=0;i<81;i++){
  const bool active=bands[i][0]+bands[i][1]+bands[i][2]>0;
  for(int c=0;c<3;c++){
   dye[i*3+c]=active?f.channel_density[i*3+c]:0;
   cmf[i*3+c]=active?float(std::pow(10.,-double(f.base_density[i]))*bands[i][c]/std::max(sums[c],1e-12)):0;
   if(!std::isfinite(dye[i*3+c])||!std::isfinite(cmf[i*3+c]))return refuse("nonfinite-tables");
  }
 }
 // The tested density domain covers the entire frame, not just selected pixels.
 for(int i=0;i<count;i++)for(int c=0;c<3;c++)if(!std::isfinite(in[i*3+c])||in[i*3+c]<-.25f||in[i*3+c]>upper[c])return refuse("density-domain");
 const auto start=std::chrono::steady_clock::now();
 const uint64_t key=hash(upper.data(),sizeof upper,hash(cmf.data(),sizeof cmf,hash(dye.data(),sizeof dye)));
 bool ok;
 {
  std::lock_guard<std::mutex> lock(guard);auto it=validated.find(key);
  if(it!=validated.end())ok=it->second;
  else {
   // Every table set is checked on this Vulkan device in log-energy space,
   // including the negative grain tail and deep shadows. RGB checks alone
   // hide large relative errors in tiny transmission values.
   std::vector<float> samples,actual;
   for(int r=0;r<7;r++)for(int g=0;g<7;g++)for(int b=0;b<7;b++){
    int level[]={r,g,b};for(int c=0;c<3;c++)samples.push_back(-.25f+(upper[c]+.25f)*level[c]/6.f);
   }
   actual.resize(samples.size());++checks;
   ok=gpu::scan_spectral_linear(samples.data(),actual.data(),uint32_t(samples.size()/3),dye.data(),cmf.data(),identity);
   if(ok)for(size_t pixel=0;pixel<samples.size()/3&&ok;pixel++){
    double expected[3]={0,0,0};
    for(int i=0;i<81;i++){
     if(bands[i][0]+bands[i][1]+bands[i][2]==0)continue;
     double od=f.base_density[i];for(int c=0;c<3;c++)od+=double(samples[pixel*3+c])*f.channel_density[i*3+c];
     const double energy=std::pow(10.,-od);for(int c=0;c<3;c++)expected[c]+=bands[i][c]*energy;
    }
    for(int c=0;c<3;c++){
     double e=std::log10(std::max(expected[c]/std::max(sums[c],1e-12),1e-12));
     double v=actual[pixel*3+c];
     if(!std::isfinite(v)||v<0||std::abs(std::log10(std::max(v,1e-12))-e)>2e-5){ok=false;break;}
    }
   }
   if(validated.size()>=32)validated.clear();validated.emplace(key,ok);
  }
 }
 const double guard_ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
 if(!ok)return refuse("self-check-failed");
 const auto dispatch=std::chrono::steady_clock::now();
 if(!gpu::scan_spectral_linear(in,out,uint32_t(count),dye.data(),cmf.data(),identity))return refuse("dispatch-failed");
 // Check a deterministic frame sample too; mismatch discards the entire pass.
 const int step=std::max(1,count/64);
 for(int pixel=0;pixel<count;pixel+=step){double expected[3]={0,0,0};
  for(int i=0;i<81;i++){if(bands[i][0]+bands[i][1]+bands[i][2]==0)continue;double od=f.base_density[i];for(int c=0;c<3;c++)od+=double(in[pixel*3+c])*f.channel_density[i*3+c];double energy=std::pow(10.,-od);for(int c=0;c<3;c++)expected[c]+=bands[i][c]*energy;}
  for(int c=0;c<3;c++){double v=out[pixel*3+c],e=std::log10(std::max(expected[c]/std::max(sums[c],1e-12),1e-12));if(!std::isfinite(v)||v<0||std::abs(std::log10(std::max(v,1e-12))-e)>2e-5){std::lock_guard<std::mutex> lock(guard);validated[key]=false;return refuse("frame-check-failed");}}
 }
 ++frames;note("gpu");
 const double elapsed=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-dispatch).count();
 stage_timing_note_gpu_scan_add(1,guard_ms,elapsed,0,uint64_t(count)*12,uint64_t(count)*12);
 return true;
}catch(...){++refusals;note("exception");return false;}
}
