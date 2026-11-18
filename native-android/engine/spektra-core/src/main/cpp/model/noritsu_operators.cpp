/* Ports from noritsu-tool/vendor.py and render.py @9c9298644c21.
 * MIT (c) 2026 noritsu-tool contributors; Spektrafilm adapters GPLv3.
 * No synthetic noritsu_tone_curve, OEM hue lattice or guessed scene model.
 * Compile without fast-math: original truncation/float32 stores are observable. */
#include "model/noritsu_operators.h"
#include "model/noritsu_tables.h"
#include "model/noritsu_uo_tables.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace spk::noritsu {
namespace {
struct Fraction{int64_t n,d;};
Fraction fraction(const Curve& y,const Curve& x,int64_t p){
 if(p<=x[0])return{y[0],1};if(p>=x[19])return{y[19],1};
 int hi=std::lower_bound(x.begin(),x.end(),p)-x.begin(),lo=hi-1;
 auto d=x[hi]-x[lo];return{y[lo]*d+(p-x[lo])*(y[hi]-y[lo]),d};
}
int64_t trunc_interp(const Curve& y,const Curve& x,int64_t p){auto f=fraction(y,x,p);return f.n/f.d;}
double interp(const Curve& y,const Curve& x,int64_t p){auto f=fraction(y,x,p);return double(f.n)/double(f.d);}
int64_t forward_uo(int mode,int64_t p){
 if(mode==0||p<uo_x[0]||p>uo_x[46])return p;
 int hi=std::lower_bound(uo_x,uo_x+47,p)-uo_x;if(hi==0)return uo_y[mode][0];
 int lo=hi-1;auto d=uo_x[hi]-uo_x[lo];return (uo_y[mode][lo]*d+(p-uo_x[lo])*(uo_y[mode][hi]-uo_y[mode][lo]))/d;
}
Curve inverse_uo(Curve y,int mode){
 if(mode==0)return y;const auto original=y;const auto* row=uo_y[mode];
 for(int i=19;i>=0;i--){auto v=y[i];
  if(v<row[0]){if(i==19)throw std::runtime_error("Undefined U/O endpoint");y[i]=original[i]-original[i+1]+y[i+1];continue;}
  if(v>row[46])continue;
  int hi=std::lower_bound(row,row+47,v)-row;
  int64_t mapped=uo_x[0];if(hi){int lo=hi-1;auto d=row[hi]-row[lo];mapped=(uo_x[lo]*d+(v-row[lo])*(uo_x[hi]-uo_x[lo]))/d;}
  y[i]=std::clamp<int64_t>(mapped,0,65535);
 }return y;
}
void validate(const Curve& x){for(int i=1;i<20;i++)if(x[i]<=x[i-1])throw std::invalid_argument("Gamma X must increase");}
float clip(float v){return std::clamp(v,0.f,1.f);}
}
Curve make_gamma_curve2(const Curve& y,const Curve& x,int lowRatio,int midRatio,int highRatio){
 validate(x);std::array<Curve,3> scaled;const int ratios[]={lowRatio,midRatio,highRatio};
 for(int b=0;b<3;b++){scaled[b][0]=y[0];for(int i=1;i<20;i++)scaled[b][i]=int64_t(double(y[i]-y[0])*double(ratios[b])*.01+double(y[0]));}
 const auto& low=scaled[0];const auto& mid=scaled[1];const auto& high=scaled[2];Curve out{};
 const int64_t atLow=trunc_interp(low,x,8000)-low[0],midBase=trunc_interp(mid,x,8000);
 const int64_t atHigh=atLow+trunc_interp(mid,x,60000)-midBase,highBase=trunc_interp(high,x,60000);
 for(int i=0;i<20;i++)out[i]=x[i]<8000?low[i]-low[0]:x[i]<60000?mid[i]-midBase+atLow:high[i]-highBase+atHigh;
 // Each interpolation is stored in binary64 before the subtraction (upstream).
 const double a=interp(y,x,0x5f00),b=interp(out,x,0x5f00);const auto shift=int64_t(a-b);for(auto& v:out)v+=shift;
 if(lowRatio!=midRatio){int i=std::upper_bound(x.begin(),x.end(),8000)-x.begin();
  const auto d=x[i+1]-x[i-1],n=out[i-1]*d+(x[i]-x[i-1])*(out[i+1]-out[i-1]);out[i]+=(n/d-out[i])/2;}
 if(midRatio!=highRatio){int i=int(std::lower_bound(x.begin(),x.end(),60000)-x.begin())-1;
  const auto d=x[i+1]-x[i-1],n=out[i-1]*d+(x[i]-x[i-1])*(out[i+1]-out[i-1]);out[i]+=(n/d-out[i])/2;}
 return out;
}
Curve make_nega_tone2(const Curve& source,const Curve& x,int target,int uoAnchor,int mode,int low,int mid,int high){
 validate(x);if(mode<0||mode>3)throw std::invalid_argument("U/O mode must be 0..3");
 auto y=source;auto offset=forward_uo(mode,uoAnchor)-trunc_interp(y,x,0x5f00);for(auto& v:y)v+=offset;
 y=make_gamma_curve2(y,x,low,mid,high);y=inverse_uo(y,mode);
 offset=target-trunc_interp(y,x,0x5f00);for(auto& v:y)v+=offset;return y;
}
uint16_t interpolate_u16(const Curve& y,const Curve& x,uint16_t code){
 const double value=interp(y,x,code);const double floor=std::floor(value),f=value-floor;
 return uint16_t(std::clamp(floor+((f>.5||(f==.5&&std::fmod(floor,2.)!=0))?1.:0.),0.,65535.));
}
Operator::Operator(const Controls& controls):c(controls){
 if(c.gradation()){
  Curve identity;for(int i=0;i<20;i++)identity[i]=tone_x[0][i];
  // Adapter: identity RGB code curve, not a captured scanner job calibration.
  const auto y=make_nega_tone2(identity,identity,0x5f00,0x5f00,c.uo,c.low,c.mid,c.high);
  lut.resize(65536);for(unsigned i=0;i<65536;i++)lut[i]=interpolate_u16(y,identity,uint16_t(i));
 }
}
RGB Operator::apply(RGB value) const {
 if(!c.active())return value; // Preserve 9.65 pixels including precision.
 std::array<float,3> v;for(int k=0;k<3;k++)v[k]=float(value[k]);
 // render.white_balance uses float32 gain multiplication and clipping.
 if(std::any_of(c.gains.begin(),c.gains.end(),[](double g){return std::abs(g-1)>1e-4;}))
  for(int k=0;k<3;k++)v[k]=clip(v[k]*float(c.gains[k]));
 if(c.gamma!=1)for(auto& f:v)f=std::pow(clip(f),float(c.gamma)); // gamma_curve
 if(!lut.empty())for(auto& f:v){auto code=unsigned(std::floor(double(clip(f))*65535.+.5));f=float(lut[code])/65535.f;}
 if(std::abs(c.saturation-1)>1e-4){
  const float y=.299f*v[0]+.587f*v[1]+.114f*v[2];
  float cb=(v[2]-y)*.564f,cr=(v[0]-y)*.713f;cb*=float(c.saturation);cr*=float(c.saturation);
  const float b=y+cb/.564f,r=y+cr/.713f,g=(y-.299f*r-.114f*b)/.587f;v={clip(r),clip(g),clip(b)};
 }
 return {clip(v[0]),clip(v[1]),clip(v[2])};
}
}
