/* GPLv3. Andrea Volpato's fit_base_params / fit_blind_calibration objectives,
 * ported to bounded finite-difference Levenberg-Marquardt for Android. */
#include "model/negative_calibration.h"
#include "model/negative.h"
#include "model/experimental.h"
#include "profiles/json_min.h"
#include <functional>
#include <algorithm>
#include <cmath>
#include <sstream>
#include <iomanip>
#include <stdexcept>
namespace spk {
namespace {
using Vec=std::vector<double>;
double squared(const Vec& v){double s=0;for(double x:v)s+=x*x;return s;}
bool solve(std::vector<Vec> a,Vec b,Vec& result){
 const int n=b.size();for(int k=0;k<n;k++){int p=k;for(int i=k+1;i<n;i++)if(std::abs(a[i][k])>std::abs(a[p][k]))p=i;
 if(std::abs(a[p][k])<1e-15)return false;std::swap(a[k],a[p]);std::swap(b[k],b[p]);double d=a[k][k];for(int j=k;j<n;j++)a[k][j]/=d;b[k]/=d;
 for(int i=0;i<n;i++)if(i!=k){double s=a[i][k];for(int j=k;j<n;j++)a[i][j]-=s*a[k][j];b[i]-=s*b[k];}}
 result=std::move(b);return true;
}
Vec fit(Vec x,const std::function<Vec(const Vec&)>& residual,double low,double high){
 double lambda=.001;Vec r=residual(x);double cost=squared(r);
 for(int iteration=0;iteration<30;iteration++){
  int n=x.size();std::vector<Vec> jac(n);for(int c=0;c<n;c++){Vec probe=x;double delta=1e-4*(1+std::abs(x[c]));probe[c]+=delta;auto rp=residual(probe);jac[c].resize(r.size());for(size_t i=0;i<r.size();i++)jac[c][i]=(rp[i]-r[i])/delta;}
  std::vector<Vec> a(n,Vec(n));Vec b(n),dx;for(int c=0;c<n;c++){for(size_t i=0;i<r.size();i++)b[c]+=jac[c][i]*r[i];for(int k=0;k<n;k++){for(size_t i=0;i<r.size();i++)a[c][k]+=jac[c][i]*jac[k][i];if(c==k)a[c][k]+=lambda*(1+a[c][k]);}}
  if(!solve(a,b,dx))break;Vec trial=x;for(int c=0;c<n;c++)trial[c]=std::clamp(x[c]-dx[c],low,high);auto next=residual(trial);double value=squared(next);
  if(std::isfinite(value)&&value<cost){double improvement=cost-value;x=std::move(trial);r=std::move(next);cost=value;lambda=std::max(1e-9,lambda*.3);if(improvement<1e-12)break;}else lambda=std::min(1e9,lambda*10);
 }
 return x;
}
Vec bright(const std::vector<Vec>& pixels,const Vec& weights,double percentile){
 Vec lum;for(const auto& p:pixels){double l=0;for(int c=0;c<3;c++)l+=p[c]*weights[c];lum.push_back(l);}auto sorted=lum;std::sort(sorted.begin(),sorted.end());double pos=percentile/100*(sorted.size()-1);int lo=pos,hi=std::min(lo+1,int(sorted.size()-1));double threshold=sorted[lo]+(pos-lo)*(sorted[hi]-sorted[lo]);
 Vec mean(3);int n=0;for(size_t i=0;i<pixels.size();i++)if(lum[i]>=threshold){for(int c=0;c<3;c++)mean[c]+=pixels[i][c];n++;}for(double& v:mean)v/=n;return mean;
}
}
std::string calibrate_negative(const std::string& profile_json,const std::string& params_json,const std::vector<float>& samples,bool detect_base){
 if(samples.size()<9||samples.size()%3||samples.size()>1500*3)throw std::runtime_error("Calibration needs 3–1500 RGB samples");
 std::vector<Vec> pixels;for(size_t i=0;i<samples.size();i+=3){Vec p(3);bool valid=true;for(int c=0;c<3;c++){valid=valid&&std::isfinite(samples[i+c]);p[c]=std::max(0.,double(samples[i+c]));}if(valid)pixels.push_back(p);}if(pixels.size()<3)throw std::runtime_error("No finite calibration samples");
 auto original=load_profile_string(profile_json),profile=original;prepare_experimental_profile(profile,params_json.c_str(),true,1);
 auto settings=negative_settings(params_json.c_str());settings.use_lut=false;NegativeConverter converter(profile,settings,SPK_CS_PROPHOTO);
 auto json=json::parse(params_json);auto number=[&](const char* key,double fallback){if(!json->has(key))return fallback;return json->at(key).as_number();};
 std::ostringstream out;out<<std::setprecision(10);
 if(detect_base){
  Vec target=bright(pixels,{.2126,.7152,.0722},std::clamp(number("scanBasePercentile",99),0.,100.));double denom=squared(target);if(denom<1e-12)throw std::runtime_error("Scan is too dark to detect film base");
  auto forward=[&](const Vec& x){Profile p=original;std::ostringstream tune;tune<<std::setprecision(17)<<"{\"filmBaseActive\":true,\"filmBaseScale\":"<<number("filmBaseScale",1)<<",\"filmBaseTilt\":"<<number("filmBaseTilt",0)<<",\"filmBaseCyan\":"<<x[0]<<",\"filmBaseMagenta\":"<<x[1]<<",\"filmBaseYellow\":"<<x[2]<<"}";prepare_experimental_profile(p,tune.str().c_str(),true,1);auto s=settings;s.exposure=0;s.calibration="";NegativeConverter model(p,s,SPK_CS_PROPHOTO);double zero[3]{},f[3];model.forward(zero,f);return Vec(f,f+3);};
  auto gain=[&](const Vec& f){double n=0;for(int c=0;c<3;c++)n+=f[c]*target[c];return n/denom;};
  auto residual=[&](const Vec& x){auto f=forward(x);double g=gain(f);Vec r;for(int c=0;c<3;c++)r.push_back(f[c]-g*target[c]);for(int c=0;c<3;c++)r.push_back(.02*(x[c]-1));return r;};
  Vec x=fit({number("filmBaseCyan",1),number("filmBaseMagenta",1),number("filmBaseYellow",1)},residual,0,4);double ev=std::clamp(std::log2(std::max(gain(forward(x)),1e-9)),-12.,12.);
  out<<"{\"base\":["<<x[0]<<','<<x[1]<<','<<x[2]<<"],\"exposure\":"<<ev<<'}';
 }else{
  Vec observed=bright(pixels,{.2,.7,.1},99);double zero[3]{},truth[3];converter.forward(zero,truth);double gain=std::exp2(settings.exposure);
  auto residual=[&](const Vec& matrix){Vec r;r.reserve(pixels.size()*3+12);for(const auto& p:pixels){double y[3]{},target[3],f[3];float density[3];for(int c=0;c<3;c++){for(int k=0;k<3;k++)y[c]+=p[k]*matrix[k*3+c]*gain;target[c]=std::max(0.,y[c]);}converter.invert(target,density);double d[3]={density[0],density[1],density[2]};converter.forward(d,f);for(int c=0;c<3;c++)r.push_back(y[c]-f[c]);}
   for(int c=0;c<3;c++){double y=0;for(int k=0;k<3;k++)y+=observed[k]*matrix[k*3+c]*gain;r.push_back(5*(y-truth[c]));}for(int i=0;i<9;i++)r.push_back(.03*(matrix[i]-(i%4==0?1:0)));return r;};
  Vec x=fit({1,0,0,0,1,0,0,0,1},residual,-4,4);out<<"{\"matrix\":[";for(int i=0;i<9;i++){if(i)out<<',';out<<x[i];}out<<"]}";
 }
 return out.str();
}
}
