/* GPLv3. Bounded damped Gauss-Newton inverse Beer-Lambert scan model.
 * Numerical source: Andrea Volpato, experimental/model/convert.py @28bf883. */
#include "model/negative.h"
#include "model/experimental_illuminants.h"
#include "model/spectral.h"
#include "profiles/json_min.h"
#include "kernels/parallel.h"
#include <cmath>
#include <algorithm>
#include <sstream>
#include <stdexcept>
#include <cstring>
#include <mutex>
#include <limits>
namespace spk {
namespace {
constexpr double ln10=2.302585092994045684;
bool solve(const double* a,const double* b,double* out){
 double x[3][4];for(int r=0;r<3;r++){for(int c=0;c<3;c++)x[r][c]=a[r*3+c];x[r][3]=b[r];}
 for(int k=0;k<3;k++){int pivot=k;for(int r=k+1;r<3;r++)if(std::abs(x[r][k])>std::abs(x[pivot][k]))pivot=r;
 if(std::abs(x[pivot][k])<1e-16)return false;
 for(int c=k;c<4;c++)std::swap(x[k][c],x[pivot][c]);double d=x[k][k];for(int c=k;c<4;c++)x[k][c]/=d;
 for(int r=0;r<3;r++)if(r!=k){double scale=x[r][k];for(int c=k;c<4;c++)x[r][c]-=scale*x[k][c];}}
 for(int c=0;c<3;c++)out[c]=x[c][3];return true;
}
const NamedScanSpectrum& illuminant(const NegativeSettings& settings){
 const auto* spd=named_scan_spectrum(settings.illuminant.c_str());if(!spd)throw std::runtime_error("Unsupported negative capture illuminant");return *spd;
}
}
NegativeSettings negative_settings(const char* text){
 NegativeSettings s;if(!text||!*text)return s;if(std::strlen(text)>16384)throw std::runtime_error("experimental parameters too large");
 auto j=json::parse(text);if(!j->is_object())throw std::runtime_error("experimental parameters must be an object");
 if(j->has("workflow"))s.workflow=j->at("workflow").as_string();
 if(s.workflow!="normal"&&s.workflow!="negative-print"&&s.workflow!="negative-scan"&&s.workflow!="negative-clear")throw std::runtime_error("Unknown negative workflow");
 if(j->has("scanIlluminant"))s.illuminant=j->at("scanIlluminant").as_string();
 if(j->has("scanExposure")){const auto& v=j->at("scanExposure");if(!v.is_number()||!std::isfinite(v.number)||std::abs(v.number)>12)throw std::runtime_error("Invalid scan exposure");s.exposure=v.number;}
 if(j->has("scanCalibration"))s.calibration=j->at("scanCalibration").as_string();
 if(j->has("scanUseLut"))s.use_lut=j->at("scanUseLut").type==json::Type::Bool&&j->at("scanUseLut").boolean;
 return s;
}
NegativeViewing::NegativeViewing(const NegativeSettings& settings){
 const auto& src=illuminant(settings);double norm=0;for(int w=0;w<81;w++){spectrum[w]=src.values[w];norm+=src.values[w]*kCieCmf1931[w][1];}
 value={src.name,spectrum,norm,src.matrices};
}
NegativeConverter::NegativeConverter(const Profile& p,const NegativeSettings& s,spk_color_space cs,bool inputCctf):decode(inputCctf){
 if(!p.is_negative()||p.monochrome||p.n_samples!=81)throw std::runtime_error("Negative conversion requires a colour-negative film profile");
 if(cs<SPK_CS_SRGB||cs>SPK_CS_LINEAR_SRGB)throw std::runtime_error("Unsupported negative input colour space");
 const auto& src=illuminant(s);double norm=0;for(int w=0;w<81;w++)norm+=src.values[w]*kCieCmf1931[w][1];
 for(int c=0;c<3;c++){double lo=1e30,top=-1e30;for(int i=0;i<p.n_density_pts;i++){double v=p.density_curves[i*3+c];lo=std::min(lo,v);top=std::max(top,v);}hi[c]=top-lo;center[c]=hi[c]/2;if(!(hi[c]>0))throw std::runtime_error("Invalid negative density range");}
 for(int w=0;w<81;w++){
  bool valid=std::isfinite(p.base_density[w]);for(int c=0;c<3;c++)valid=valid&&std::isfinite(p.channel_density[w*3+c]);
  base[w]=valid?p.base_density[w]:0;
  for(int c=0;c<3;c++){dye[w][c]=valid?p.channel_density[w*3+c]:0;for(int k=0;k<3;k++)weights[w][c]+=(valid?src.values[w]/norm:0)*src.matrices[cs][c*3+k]*kCieCmf1931[w][k];}
 }
 double rgb[3],jac[9],g[9];forward(center,rgb,jac);
 for(int r=0;r<3;r++){log0[r]=std::log10(std::max(rgb[r],1e-12));for(int c=0;c<3;c++)g[r*3+c]=-jac[r*3+c]/(std::max(rgb[r],1e-12)*ln10);}
 for(int c=0;c<3;c++){double unit[3]={},sol[3];unit[c]=1;if(!solve(g,unit,sol))throw std::runtime_error("Negative dye model is singular");for(int r=0;r<3;r++)seed_inverse[r*3+c]=sol[r];}
 gain=std::exp2(s.exposure);for(int i=0;i<9;i++)matrix[i]=(i%4==0)?1:0;
 std::string text=s.calibration;for(char& c:text)if(c==','||c==';'||c=='['||c==']'||c=='('||c==')')c=' ';
 std::istringstream input(text);double parsed[9],extra;bool valid=true;for(double& v:parsed)if(!(input>>v)||!std::isfinite(v)){valid=false;break;}if(valid&&!(input>>extra)){input.clear();std::string trailing;if(!(input>>trailing))std::copy(parsed,parsed+9,matrix);}
 if(s.use_lut){
  // A single immutable cache entry, bounded to one 33^3 table. Exposure and
  // device matrix are applied outside the table and do not invalidate it.
  std::string key;auto bytes=[&](const void* data,size_t n){key.append(static_cast<const char*>(data),n);};
  bytes(weights,sizeof(weights));bytes(dye,sizeof(dye));bytes(base,sizeof(base));bytes(hi,sizeof(hi));
  static std::mutex mutex;static std::string last_key;static std::shared_ptr<const PreparedLut3D> last;
  std::lock_guard<std::mutex> lock(mutex);
  if(last&&key==last_key)prepared=last;
  else{
   double low[3],high[3];for(int c=0;c<3;c++){low[c]=std::numeric_limits<double>::infinity();high[c]=-low[c];}
   for(int r=0;r<12;r++)for(int g=0;g<12;g++)for(int b=0;b<12;b++){
    double cmy[3]={hi[0]*r/11,hi[1]*g/11,hi[2]*b/11},rgb[3];forward(cmy,rgb);
    for(int c=0;c<3;c++){low[c]=std::min(low[c],rgb[c]);high[c]=std::max(high[c],rgb[c]);}}
   for(int c=0;c<3;c++){double margin=.02*(high[c]-low[c]);low[c]-=margin;high[c]+=margin;}
   auto sample=[](const double* in,double* out,void* ctx){float density[3];static_cast<const NegativeConverter*>(ctx)->invert(in,density);for(int c=0;c<3;c++)out[c]=density[c];};
   auto lut=build_lut_3d(low,high,33,{},sample,this);prepared=prepare_lut_3d_pchip(std::move(lut));last=prepared;last_key=std::move(key);
  }
 }
}
void NegativeConverter::forward(const double* cmy,double* rgb,double* jac)const{
 std::fill(rgb,rgb+3,0);if(jac)std::fill(jac,jac+9,0);
 for(int w=0;w<81;w++){double d=base[w];for(int c=0;c<3;c++)d+=dye[w][c]*cmy[c];double light=std::exp(-ln10*d);
  for(int r=0;r<3;r++){double v=light*weights[w][r];rgb[r]+=v;if(jac)for(int c=0;c<3;c++)jac[r*3+c]-=ln10*v*dye[w][c];}}
}
void NegativeConverter::invert(const double* y,float* out)const{
 double x[3],logdelta[3];for(int c=0;c<3;c++)logdelta[c]=log0[c]-std::log10(std::max(y[c],1e-12));
 for(int c=0;c<3;c++){x[c]=center[c];for(int k=0;k<3;k++)x[c]+=seed_inverse[c*3+k]*logdelta[k];x[c]=std::clamp(x[c],0.,hi[c]);}
 for(int iter=0;iter<8;iter++){
  double f[3],jac[9],a[9]{},b[3]{},dx[3];forward(x,f,jac);
  for(int c=0;c<3;c++){for(int r=0;r<3;r++)b[c]+=jac[r*3+c]*(f[r]-y[r]);for(int k=0;k<3;k++){for(int r=0;r<3;r++)a[c*3+k]+=jac[r*3+c]*jac[r*3+k];if(c==k)a[c*3+k]+=1e-7;}}
  if(!solve(a,b,dx))break;for(int c=0;c<3;c++)x[c]=std::clamp(x[c]-dx[c],0.,hi[c]);
 }
 for(int c=0;c<3;c++)out[c]=x[c];
}
void NegativeConverter::convert(const float* f32,const double* f64,double inputGain,int pixels,float* out)const{
 constexpr int chunk=256;
 parallel_for(0,(pixels+chunk-1)/chunk,[&](int begin,int end){for(int block=begin;block<end;block++){
  const int first=block*chunk,n=std::min(chunk,pixels-first);double targets[chunk*3]{},density[chunk*3];
  for(int i=0;i<n;i++){double* y=targets+i*3;for(int c=0;c<3;c++)for(int k=0;k<3;k++){double v=f32?f32[(first+i)*3+k]*inputGain:f64[(first+i)*3+k];if(decode)v=v<.03125?v/16:std::copysign(std::pow(std::abs(v),1.8),v);y[c]+=v*matrix[k*3+c]*gain;}for(int c=0;c<3;c++)if(!std::isfinite(y[c]))y[c]=0;}
  if(prepared){apply_prepared_lut_3d_pchip(*prepared,targets,n,1,density);for(int i=0;i<n*3;i++)out[first*3+i]=density[i];}
  else for(int i=0;i<n;i++)invert(targets+i*3,out+(first+i)*3);
 }});
}
}
