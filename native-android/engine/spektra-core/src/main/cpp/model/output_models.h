/* Fotufilm LabScanFinish / PrintPaperTables @b9049f3 (Apache-2.0, MUAStudio Inc.).
 * Modified: C++ port, Spektrafilm receiver calibration and frame timing adapter.
 * Source notices and scope: docs/OUTPUT_MODELS.md. */
#pragma once
#include "profiles/profile.h"
#include "profiles/json_min.h"
#include "model/color_output.h"
#include "kernels/gaussian.h"
#include "kernels/parallel.h"
#include <array>
#include <algorithm>
#include <cmath>
#include <vector>
namespace spk { namespace outputs {
using RGB=std::array<double,3>;
inline double clamp(double x,double a=0,double b=1){return std::clamp(x,a,b);}
inline double curve(double x){auto soft=[](double v){return std::max(v,0.)+std::log1p(std::exp(-std::abs(v)));};return 3*clamp(.3*soft((x+1)/.3)-.3*soft((x-.2)/.3),0,1.2);}
inline double inverse(double y){double lo=-8,hi=8;for(int i=0;i<50;i++){double mid=(lo+hi)/2;if(curve(mid)<y)lo=mid;else hi=mid;}return (lo+hi)/2;}
inline RGB finish(RGB rgb,double strength=1,bool chromatic=true,double floor=0){
 strength=std::isfinite(strength)?clamp(strength):1;if(!strength)return rgb;
 RGB p={.822461969*rgb[0]+.177538031*rgb[1],.033194199*rgb[0]+.966805801*rgb[1],.017082631*rgb[0]+.072397441*rgb[1]+.910519929*rgb[2]};
 double Y=.2289746*p[0]+.6917385*p[1]+.0792869*p[2];if(Y<=1e-6)return rgb;
 double level=std::cbrt(Y),upper=clamp((level-.55)/.45),target=std::max(0.,level+strength*(.006*std::sin(M_PI*upper)-.019*clamp(1-level/.35))),gain=target*target*target/Y;
 for(double& v:p)v*=gain;double r=1.22494018*p[0]-.224940176*p[1],g=-.042056955*p[0]+1.04205695*p[1],b=-.019637555*p[0]-.078636046*p[1]+1.09827360*p[2];
 if(!chromatic)return {r,g,b};
 double l=std::cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=std::cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=std::cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 double L=.2104542553*l+.793617785*m-.0040720468*s,a=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
 double onset=floor>0?clamp(std::log2(std::max(Y,1e-12)/floor)-.5):1,shadow=clamp((.70-L)/.40)*clamp((L-.04)/.16)*onset,neutral=L*std::exp(-std::hypot(a,B)/std::max(L,1e-3)/.1);
 a+=strength*neutral*shadow*-.045;B+=strength*neutral*shadow*-.033;
 double chroma=std::hypot(a,B),hue=std::atan2(B,a)*180/M_PI,hueGain=1,turn=0;
 const double corrections[][4]={{45,35,.97,2.3},{135,35,.89,5.5},{240,35,1.05,-6.4}};
 for(auto& c:corrections){double d=std::fmod(hue-c[0],360);if(d>180)d-=360;if(d< -180)d+=360;double weight=std::exp(-.5*std::pow(d/c[1],2));hueGain*=1+strength*(c[2]-1)*weight;turn+=strength*c[3]*weight;}
 double saturated=clamp((chroma-.08)/.12),fade=clamp(L/.25)*clamp((1-L)/.08)*(1-saturated*saturated*(3-2*saturated));chroma*=1+(hueGain-1)*fade;hue+=turn*fade;a=chroma*std::cos(hue*M_PI/180);B=chroma*std::sin(hue*M_PI/180);
 double ll=std::pow(L+.3963377774*a+.2158037573*B,3),mm=std::pow(L-.1055613458*a-.0638541728*B,3),ss=std::pow(L-.0894841775*a-1.291485548*B,3);
 return {4.0767416621*ll-3.3077115913*mm+.2309699292*ss,-1.2684380046*ll+2.6097574011*mm-.3413193965*ss,-.0041960863*ll-.7034186147*mm+1.707614701*ss};
}
struct Params {std::string mode="paper";bool automatic=true;double exposure=0,look=1;RGB keys={0,0,0};double contrast=1,black=0,white=1;};
inline Params read_params(const char* text){Params p;if(!text||!*text)return p;auto j=json::parse(text);if(!j->has("outputModel"))return p;auto& o=j->at("outputModel");if(!o.is_object())return p;
 if(o.has("mode")){auto s=o.at("mode").as_string();if(s!="paper"&&s!="negative"&&s!="digital"&&s!="auto-levels"&&s!="lab-scan")throw std::runtime_error("Unknown output model");p.mode=s;}
 auto num=[&](const char* key,double fallback,double low,double high){if(!o.has(key))return fallback;double v=o.at(key).as_number();if(!std::isfinite(v))throw std::runtime_error("Nonfinite output control");return clamp(v,low,high);};
 p.exposure=num("exposure",0,-6,6);p.look=num("look",1,0,1);p.keys={num("cyan",0,-1,1),num("magenta",0,-1,1),num("yellow",0,-1,1)};if(o.has("autoSetup")&&o.at("autoSetup").type==json::Type::Bool)p.automatic=o.at("autoSetup").boolean;
 p.contrast=num("contrast",1,.5,2);p.black=num("blackPoint",0,-.05,.1);p.white=num("whitePoint",1,.5,1.5);return p;}

/** Operator tone AFTER receiver inversion/finish and BEFORE scanner optics/output
 * conversion. A monotonic S-curve pivots at 18% linear luminance and retains
 * neutral black/white endpoints, scaling all channels together. Endpoint
 * controls have disjoint bounds, so white never crosses black.
 * Defaults are an exact bypass, retaining all existing recipe pixels. */
inline RGB operator_tone(RGB value,const Params& p) {
 if(p.contrast==1 && p.black==0 && p.white==1)return value;
 if(p.contrast!=1) {
  const double Y=.2126*value[0]+.7152*value[1]+.0722*value[2];
  if(Y>1e-12 && Y<1-1e-12) {
   const double pivot=std::log(.18/.82);
   const double logit=p.contrast*std::log(Y/(1-Y))+(1-p.contrast)*pivot;
   const double target=1/(1+std::exp(-logit));
   const double gain=target/Y;
   for(double& c:value)c*=gain;
  }
 }
 if(p.black!=0 || p.white!=1)for(double& c:value)c=(c-p.black)/(p.white-p.black);
 return value;
}
inline double density_at(const Profile& f,double x,int c,double gamma){x*=gamma;auto& axis=f.log_exposure;if(axis.empty())throw std::runtime_error("No receiver calibration curve");auto it=std::upper_bound(axis.begin(),axis.end(),x);if(it==axis.begin())return f.density_curves[c];if(it==axis.end())return f.density_curves[(axis.size()-1)*3+c];int hi=it-axis.begin(),lo=hi-1;double a=(x-axis[lo])/(axis[hi]-axis[lo]);return f.density_curves[lo*3+c]*(1-a)+f.density_curves[hi*3+c]*a;}
/** Read CMY densities through Fotufilm's 630/545/465 nm LED receiver, then invert
 * using its softplus scan curve. Calibration/timing is adapted to Spektrafilm. */
inline bool scan(const Profile& f,const Params& p,const float* density,int w,int h,float* result,double gamma,spk_color_space cs,bool encoded,double blur,double usmSigma,double usmAmount){
 if(p.mode=="paper"||p.mode=="negative"||f.is_positive())return false;
 int count=w*h,n=f.n_samples;if(n<1)return false;
 std::vector<RGB> bands(n);double centers[]={630,545,465},widths[]={8.5,14,9.5};RGB sums={0,0,0};
 for(int i=0;i<n;i++)for(int c=0;c<3;c++){double value=std::exp(-.5*std::pow((f.wavelengths[i]-centers[c])/widths[c],2));if(!std::isfinite(f.base_density[i])||!std::isfinite(f.channel_density[i*3])||!std::isfinite(f.channel_density[i*3+1])||!std::isfinite(f.channel_density[i*3+2]))value=0;bands[i][c]=value;sums[c]+=value;}
 auto read=[&](RGB d){RGB energy={0,0,0};for(int i=0;i<n;i++){if(bands[i][0]+bands[i][1]+bands[i][2]==0)continue;double od=f.base_density[i];for(int k=0;k<3;k++)od+=d[k]*f.channel_density[i*3+k];double light=std::pow(10.,-od);for(int c=0;c<3;c++)energy[c]+=bands[i][c]*light;}for(int c=0;c<3;c++)energy[c]=std::log10(std::max(energy[c]/std::max(sums[c],1e-12),1e-12));return energy;};
 RGB mid,lo,hi;for(int c=0;c<3;c++){mid[c]=density_at(f,0,c,gamma);lo[c]=density_at(f,-.15,c,gamma);hi[c]=density_at(f,.15,c,gamma);}auto ref=read(mid),low=read(lo),high=read(hi);RGB slopes;for(int c=0;c<3;c++)slopes[c]=std::max(.05,std::abs((high[c]-low[c])/.3));
 parallel_for(0,count,[&](int begin,int end){for(int i=begin;i<end;i++){auto value=read({density[i*3],density[i*3+1],density[i*3+2]});for(int c=0;c<3;c++)result[i*3+c]=(ref[c]-value[c])/slopes[c];}});
 std::vector<double> stats;int stride=std::max(1,count/16384);for(int i=0;i<count;i+=stride)stats.push_back((result[i*3]+result[i*3+1]+result[i*3+2])/3.);std::sort(stats.begin(),stats.end());
 double median=stats[stats.size()/2],highValue=stats[std::min(stats.size()-1,size_t(stats.size()*.995))],middle=inverse(-std::log10(.18));bool automatic=p.mode=="auto-levels"||(p.mode=="lab-scan"&&p.automatic);
 double scale=automatic?clamp(1.2/std::max(.8,highValue-median),1,1.5):1,shift=automatic?std::min({0.,-median*.5,(middle-inverse(.08))-highValue*scale}):0;
 parallel_for(0,count,[&](int begin,int end){for(int i=begin;i<end;i++){RGB value;for(int c=0;c<3;c++)value[c]=std::pow(10.,-curve(middle-(result[i*3+c]*scale+shift+p.exposure*std::log10(2.)-p.keys[c]*.5)));if(p.mode=="lab-scan")value=finish(value,p.look,!f.monochrome);value=operator_tone(value,p);double gray=(value[0]+value[1]+value[2])/3;for(int c=0;c<3;c++)result[i*3+c]=f.monochrome?gray:value[c];}});
 if(blur>0)gaussian_blur(result,w,h,3,blur);if(usmSigma>0&&usmAmount>0){std::vector<float> blurred(result,result+count*3);gaussian_blur(blurred.data(),w,h,3,usmSigma);for(int i=0;i<count*3;i++)result[i]+=usmAmount*(result[i]-blurred[i]);}
 // sRGB D65 -> XYZ D50, then the engine's own output-space matrix and transfer.
 const double toXYZ[]={.4360657428,.3851514688,.1430784544,.2224931918,.7168870538,.0606197905,.0139239045,.0970812857,.7140993584};
 parallel_for(0,count,[&](int begin,int end){for(int i=begin;i<end;i++){RGB xyz={0,0,0},v={0,0,0};for(int c=0;c<3;c++)for(int k=0;k<3;k++)xyz[c]+=toXYZ[c*3+k]*result[i*3+k];for(int c=0;c<3;c++)for(int k=0;k<3;k++)v[c]+=kXYZ_to_RGB[cs][c*3+k]*xyz[k];for(int c=0;c<3;c++)result[i*3+c]=clamp(encoded&&cs!=SPK_CS_LINEAR_SRGB?output_cctf_encode(cs,v[c]):v[c]);}});
 return true;
}
}}
