/* GPLv3. Port of Negs core/prep.rs and prep/guided.rs @26c903b.
 * Original integration by yosoyelchris (d2a144d), maintained by Noah Haasis.
 * Control math parity, not a claim of a complete Resolve RAW pipeline. */
#include "model/negs_prep.h"
#include "model/negs_projection.h"
#include "profiles/json_min.h"
#include "kernels/parallel.h"
#include <algorithm>
#include <cmath>
#include <array>
#include <stdexcept>
namespace spk {
namespace {
using Plane=std::vector<float>;
float luma(const float* x){return x[0]*.2126f+x[1]*.7152f+x[2]*.0722f;}
float encode(float x){return x<=.018f?4.5f*x:1.099f*std::pow(x,.45f)-.099f;}
float decode(float x){return x<=.081f?x/4.5f:std::pow((x+.099f)/1.099f,1.f/.45f);}
Plane box(const Plane& a,int w,int h,int r){
 Plane tmp(a.size()),out(a.size());const double divisor=2*r+1;
 parallel_for(0,h,[&](int begin,int end){for(int y=begin;y<end;y++){double sum=0;for(int k=-r;k<=r;k++)sum+=a[y*w+std::clamp(k,0,w-1)];for(int x=0;x<w;x++){tmp[y*w+x]=sum/divisor;sum+=double(a[y*w+std::min(x+r+1,w-1)])-a[y*w+std::max(0,x-r)];}}});
 parallel_for(0,w,[&](int begin,int end){for(int x=begin;x<end;x++){double sum=0;for(int k=-r;k<=r;k++)sum+=tmp[std::clamp(k,0,h-1)*w+x];for(int y=0;y<h;y++){out[y*w+x]=sum/divisor;sum+=double(tmp[std::min(y+r+1,h-1)*w+x])-tmp[std::max(0,y-r)*w+x];}}});return out;
}
struct Axis{int lo,hi;float t;};
Axis axis(int i,int src,int dst){float scale=1.f/dst,v=std::clamp((i*scale+.5f*scale)*src-.5f,0.f,float(src-1));int lo=std::floor(v);return {lo,std::min(lo+1,src-1),v-lo};}
float bilinear(const Plane& a,int w,Axis x,Axis y){float top=a[y.lo*w+x.lo]+(a[y.lo*w+x.hi]-a[y.lo*w+x.lo])*x.t,bottom=a[y.hi*w+x.lo]+(a[y.hi*w+x.hi]-a[y.hi*w+x.lo])*x.t;return top+(bottom-top)*y.t;}
Plane resize(const Plane& a,int w,int h,int dw,int dh){Plane out(dw*dh);parallel_for(0,dh,[&](int begin,int end){for(int y=begin;y<end;y++)for(int x=0;x<dw;x++)out[y*dw+x]=bilinear(a,w,axis(x,w,dw),axis(y,h,dh));});return out;}
using Lut=std::array<float,1024>;
void smooth(Lut& lut,int start,int step,std::array<float,4> p){float a=std::fma(-.5f,p[0],.5f*p[2]),b=std::fma(-.5f,p[3],std::fma(2.f,p[2],std::fma(-2.5f,p[1],p[0]))),c=std::fma(.5f,p[3],std::fma(-1.5f,p[2],std::fma(-.5f,p[0],1.5f*p[1])));for(int j=1;j<step;j++){float t=float(j)/step;lut[start+j]=std::fma(c*t*t,t,std::fma(b*t,t,std::fma(a,t,p[1])));}}
Lut tone(const NegsPrep& p){float he=std::exp2(1.5f*(p.highlights/100.f)),se=std::exp2(-(p.shadows/200.f)*1.5f),denominator=std::pow(.5f,se);Lut lut;float x=0,dx=1.f/1023.f;for(float& v:lut){float h=std::pow(1.f-x,he),s=x>.5f?x:.5f*(std::pow(x,se)/denominator);v=std::fma(s,1.f-x,x*(1.f-h));x+=dx;}smooth(lut,480,64,{lut[416],lut[480],lut[544],lut[608]});smooth(lut,959,64,{lut[895],lut[959],lut[1023],lut[1023]+64.f/1024.f});return lut;}
float sample(const Lut& a,float x){float coordinate=std::clamp(x*1024.f-.5f,0.f,1023.f);int i=std::floor(coordinate),j=std::min(i+1,1023);return std::fma(a[j]-a[i],coordinate-i,a[i]);}
float tone_sample(const Lut& a,float x){if(x>1){float y=sample(a,1);return y+(y-sample(a,.875f))/.125f*(x-1);}if(x<0){float y=sample(a,0);return y+(sample(a,.125f)-y)/.125f*x;}return sample(a,x);}
struct Prepared{Lut lut;float mul,add,contrast;explicit Prepared(const NegsPrep& p):lut(tone(p)),contrast(std::pow(1.5f,p.contrast/100.f)){
 float top=1.f/std::max(std::pow(10.f,p.gain/100.f),.001f),lift=std::min(2.f*(p.lift/100.f),.999f),bottom=std::min(lift/(lift-1.f),top-.005f),span=top-bottom;mul=1.f/span;add=-bottom/span;}};
void core(const float* rgb,float base,const NegsPrep& s,const Prepared& p,float* out){
 float v[3]={rgb[0]*.5f,rgb[1]*.5f,rgb[2]*.5f},y=luma(v),a=v[0]*.5f-v[1]*.25f-v[2]*.25f,b=v[1]*.433012701892219f-v[2]*.433012701892219f,c=std::sqrt(a*a+b*b),hue=std::atan2(b,a)/(2.f*float(M_PI));if(hue<0)hue+=1;base*=.5f;float detail=y-base,mapped=tone_sample(p.lut,base),ratio=std::abs(base)>.00001f?std::clamp(mapped/base,1.f,4.f):1.f;y=mapped+ratio*detail;c*=ratio;y+=detail*(s.detail/100.f)*std::max(y*(1.f-y),0.f)*4.f;float boost=s.color_boost/100.f,weight=boost>=0?.7f*boost:boost;if(weight!=0)c=std::max(c+std::pow(c,.4f)*weight*.25f,0.f);c=std::max(c*(1.f+s.saturation/100.f),0.f);out[0]=out[1]=out[2]=y;
 if(c>0){a=c*std::cos(hue*2.f*float(M_PI));b=c*std::sin(hue*2.f*float(M_PI));out[0]=y+a*4.f/3.f;out[1]=y-a*2.f/3.f+b*1.154700538379252f;out[2]=y-a*2.f/3.f-b*1.154700538379252f;float correction=y-luma(out);for(int k=0;k<3;k++)out[k]+=correction;}
 for(int k=0;k<3;k++)out[k]=((2.f*out[k]-.5f)*p.contrast+.5f)*p.mul+p.add;
}
}
NegsPrep read_negs_prep(const char* text){NegsPrep p;if(!text||!*text)return p;auto root=json::parse(text);if(!root->has("negsPrep"))return p;const auto& j=root->at("negsPrep");if(!j.is_object())throw std::runtime_error("Prep must be an object");
 auto read=[&](const char* name,float& x,float low,float high){if(!j.has(name))return;const auto& v=j.at(name);if(!v.is_number()||!std::isfinite(v.number)||v.number<low||v.number>high)throw std::runtime_error(std::string("Invalid Prep parameter: ")+name);x=v.number;};
 read("exposure",p.exposure,-3,3);read("highlights",p.highlights,-180,100);read("shadows",p.shadows,-100,100);read("contrast",p.contrast,-100,100);read("lift",p.lift,-100,100);read("gain",p.gain,-100,100);read("colorBoost",p.color_boost,-100,100);read("saturation",p.saturation,-100,100);read("detail",p.detail,-100,100);return p;
}
Plane negs_guided_base(const Plane& luma,int w,int h){
 if(w<1||h<1||luma.size()!=size_t(w)*h)throw std::runtime_error("Invalid Prep dimensions");for(float v:luma)if(!std::isfinite(v)||!std::isfinite(v*v))throw std::runtime_error("Nonfinite Prep input");
 int radius=std::ceil((std::max(w,h)*.02f)*.5f),sub=std::clamp(w/320,1,4);if(sub>radius||h<sub)sub=1;int lw=w/sub,lh=h/sub,r=std::max(radius/sub,1);Plane small=(lw==w&&lh==h)?luma:resize(luma,w,h,lw,lh),square(small.size());for(size_t i=0;i<small.size();i++)square[i]=small[i]*small[i];Plane b=box(small,lw,lh,r),a=box(square,lw,lh,r);
 for(size_t i=0;i<a.size();i++){float variance=std::max(a[i]-b[i]*b[i],0.f);a[i]=variance/std::max(variance+.01f,.0001f);b[i]=b[i]-a[i]*b[i];}a=box(a,lw,lh,r);b=box(b,lw,lh,r);Plane out(luma.size());parallel_for(0,h,[&](int begin,int end){for(int y=begin;y<end;y++)for(int x=0;x<w;x++){Axis ax=axis(x,lw,w),ay=axis(y,lh,h);out[y*w+x]=bilinear(a,lw,ax,ay)*luma[y*w+x]+bilinear(b,lw,ax,ay);}});return out;
}
void negs_prep_core(const float* rgb,float base,const NegsPrep& p,float* out){core(rgb,base,p,Prepared(p),out);}
void apply_negs_prep(float* rgb,int w,int h,const NegsPrep& p,bool prophoto){
 if(!p.active())return;const int pixels=w*h;if(pixels<1)throw std::runtime_error("Invalid Prep frame");
 if(p.exposure!=0){double gain=std::exp2(double(p.exposure));parallel_for(0,pixels*3,[&](int b,int e){for(int i=b;i<e;i++)rgb[i]*=gain;});}
 if(!p.controls())return;Plane encoded(pixels*3),lum(pixels);
 parallel_for(0,pixels,[&](int begin,int end){for(int i=begin;i<end;i++){for(int c=0;c<3;c++){double v=rgb[i*3+c];if(prophoto){v=0;for(int k=0;k<3;k++)v+=negs_to709[c*3+k]*rgb[i*3+k];}encoded[i*3+c]=encode(v);}lum[i]=luma(encoded.data()+i*3);}});
 Plane base=negs_guided_base(lum,w,h);Prepared prepared(p);
 parallel_for(0,pixels,[&](int begin,int end){for(int i=begin;i<end;i++){float out[3];core(encoded.data()+i*3,base[i],p,prepared,out);for(float& v:out)v=decode(v);for(int c=0;c<3;c++){double v=out[c];if(prophoto){v=0;for(int k=0;k<3;k++)v+=negs_from709[c*3+k]*out[k];}if(!std::isfinite(v))throw std::runtime_error("Prep produced nonfinite pixels");rgb[i*3+c]=v;}}});
}
}
