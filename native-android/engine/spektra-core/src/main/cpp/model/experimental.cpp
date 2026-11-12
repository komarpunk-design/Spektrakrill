/* GPLv3. Port of spektrafilm experimental by Andrea Volpato, 28bf883.
 * This operates on local profile copies; the immutable asset cache is unchanged. */
#include "model/experimental.h"
#include "profiles/json_min.h"
#include "model/experimental_filters.h"
#include "kernels/gaussian.h"
#include "model/experimental_projection.h"
#include "model/negs_projection.h"
#include "runtime/params.h"
#include "runtime/stages/filming.h"
#include "kernels/spectral_upsampling.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <numeric>
#include <stdexcept>
#include <vector>

namespace spk {
namespace {
using J=json::Value;
json::ValuePtr tree(const char* text) {
    if(!text||!*text)return {};
    if(std::strlen(text)>16384)throw std::runtime_error("experimental parameters too large");
    auto p=json::parse(text);if(!p->is_object())throw std::runtime_error("experimental parameters must be an object");return p;
}
bool flag(const J& j,const char* key) {return j.has(key)&&j.at(key).type==json::Type::Bool&&j.at(key).boolean;}
double number(const J& j,const char* key,double fallback,double low,double high) {
    if(!j.has(key))return fallback;
    const auto& x=j.at(key);if(!x.is_number()||!std::isfinite(x.number)||x.number<low||x.number>high)throw std::runtime_error(std::string("invalid experimental parameter: ")+key);return x.number;
}
double cdf(double z,const std::string& type,double alpha) {
    if(type!="sept_norm_cdfs")return .5*std::erfc(-z/std::sqrt(2.));
    const double u=std::clamp(z/5.8013+.5,0.,1.);
    const double v=std::clamp(u+alpha*u*(1-u)*(2*u-1)*(2*u-1),0.,1.);
    return v*v*v*v*(35+v*(-84+v*(70-20*v)));
}
double layer(double z,bool positive,const std::string& type,double alpha,double exhaustion) {
    if(positive)z=-z;
    const double normal=cdf(z,type,alpha);
    if(exhaustion==0)return normal;
    const double location=-std::log(std::log(2.));
    const double width=.5*std::log(2.)*std::sqrt(2*M_PI);
    return (1-exhaustion)*normal+exhaustion*std::exp(-std::exp(-(z/width+location)));
}
void method(Profile& p,const J* j){
    std::string id=j&&j->has("spectralMethod")?j->at("spectralMethod").as_string():"legacy";
    if(id=="legacy"){if(!p.experimental_source)return;id="hanatos2025";}
    if(id!="hanatos2025"&&id!="mallett2019"&&id!="otsu2018"&&id!="jakob2019"&&id!="arctic2026beta04"&&id!="gauss-lasers")throw std::runtime_error("Unknown spectral reconstruction method");
    p.experimental_method=id;p.experimental_key+="|spectral-method:"+id;
    const bool reflectance=id!="hanatos2025",tungsten=p.reference_illuminant=="T";
    const double* matrix=reflectance?experimental_prophoto_D65:tungsten?experimental_prophoto_T:p.reference_illuminant=="BB3200"?negs_prophoto_BB3200:experimental_prophoto_D55;
    const double* srgb=reflectance?experimental_srgb_D65:tungsten?experimental_srgb_T:p.reference_illuminant=="BB3200"?negs_srgb_BB3200:experimental_srgb_D55;
    std::copy(matrix,matrix+9,p.experimental_projection);std::copy(srgb,srgb+9,p.experimental_srgb_projection);
}

void chemistry(Profile& p,const J& j,bool film,double global) {
    const std::string prefix=film?"film":"print";
    if(!flag(j,(prefix+"Chemistry").c_str()))return;
    const int n=p.dc_model_n_layers;
    if(n<1)throw std::runtime_error("This profile has no fitted density model for chemistry");
    const double g=number(j,(prefix+"Gamma").c_str(),film?global:1,.05,10);
    const double fast=number(j,(prefix+"Fast").c_str(),1,.05,10);
    const double slow=number(j,(prefix+"Slow").c_str(),1,.05,10);
    const double exhaustion=number(j,(prefix+"Exhaustion").c_str(),0,0,1);
    p.density_curves.assign(p.n_density_pts*3,0);
    if(n>1)p.density_curves_layers.assign(p.n_density_pts*n*3,0);
    else p.density_curves_layers.clear();
    for(int c=0;c<3;c++) {
        const char* suffix=p.monochrome?"Red":c==0?"Red":c==1?"Green":"Blue";
        const double channel=number(j,(prefix+suffix).c_str(),1,.05,10);
        std::vector<double> centers(n),sigmas(n),amps(n),alphas(n,0);
        for(int i=0;i<n;i++){
            centers[i]=p.dc_model_centers[c*n+i];sigmas[i]=p.dc_model_sigmas[c*n+i];amps[i]=p.dc_model_amplitudes[c*n+i];
            if(!p.dc_model_alphas.empty())alphas[i]=p.dc_model_alphas[c*n+i];
        }
        std::vector<int> order(n);std::iota(order.begin(),order.end(),0);
        std::stable_sort(order.begin(),order.end(),[&](int a,int b){return centers[a]<centers[b];});
        const int indices[]={order.front(),order[n/2],order.back()};
        const double factors[]={g*channel*fast,g*channel*slow,g*channel*slow};
        for(int k=0;k<3;k++){const int i=indices[k];centers[i]/=factors[k];sigmas[i]=std::max(.05,sigmas[i]/factors[k]);}
        auto evaluate=[&](double offset,double mix){double d=0;for(int i=0;i<n;i++)d+=amps[i]*layer((-centers[i]-offset)/sigmas[i],p.is_positive(),p.dc_model_type,alphas[i],mix);return d;};
        double offset=0;
        if(exhaustion>0) {
            const double target=evaluate(0,0);
            auto residual=[&](double x){return evaluate(x,exhaustion)-target;};
            if(std::abs(residual(0))>1e-12){
                double lo=-.25,hi=.25,a=residual(lo),b=residual(hi);bool found=false;
                for(int attempt=0;attempt<12;attempt++){
                    if(a==0){offset=lo;found=true;break;}if(b==0){offset=hi;found=true;break;}
                    if(a*b<0){for(int k=0;k<80;k++){const double mid=(lo+hi)/2,r=residual(mid);if(a*r<=0){hi=mid;b=r;}else{lo=mid;a=r;}}offset=(lo+hi)/2;found=true;break;}
                    lo*=2;hi*=2;a=residual(lo);b=residual(hi);
                }
                if(!found)offset=0; // same exhausted bracket fallback as the reference.
            }
        }
        for(int x=0;x<p.n_density_pts;x++)for(int i=0;i<n;i++){
            const double d=amps[i]*layer((p.log_exposure[x]-centers[i]-offset)/sigmas[i],p.is_positive(),p.dc_model_type,alphas[i],exhaustion);
            p.density_curves[x*3+c]+=static_cast<float>(d);
            if(n>1)p.density_curves_layers[x*n*3+i*3+c]=static_cast<float>(d);
        }
    }
}
int reflected(int x,int n){while(x<0||x>=n){if(x<0)x=-x-1;else x=2*n-x-1;}return x;}
std::vector<double> smooth(const std::vector<double>& input,double sigma){
    const int radius=static_cast<int>(4*sigma+.5),n=input.size();std::vector<double> weights(2*radius+1),out(n);double norm=0;
    for(int k=-radius;k<=radius;k++){const double w=std::exp(-.5*k*k/(sigma*sigma));weights[k+radius]=w;norm+=w;}
    for(int i=0;i<n;i++)for(int k=-radius;k<=radius;k++)out[i]+=input[reflected(i+k,n)]*weights[k+radius]/norm;
    return out;
}
double interpolate(double x,const double* xp,const double* yp,int n){
    if(x<=xp[0])return yp[0];if(x>=xp[n-1])return yp[n-1];int i=0;while(x>xp[i+1])i++;const double t=(x-xp[i])/(xp[i+1]-xp[i]);return yp[i]*(1-t)+yp[i+1]*t;
}
void base(Profile& p,const J& j,bool film){
    const std::string prefix=film?"filmBase":"printBase";
    if(!flag(j,(prefix+"Active").c_str()))return;
    const double scale=number(j,(prefix+"Scale").c_str(),1,0,4);
    const double c=number(j,(prefix+"Cyan").c_str(),1,0,4),m=number(j,(prefix+"Magenta").c_str(),1,0,4),y=number(j,(prefix+"Yellow").c_str(),1,0,4);
    const double tilt=film?number(j,"filmBaseTilt",0,-2,2):0;
    if(c==1&&m==1&&y==1&&tilt==0){for(auto& v:p.base_density)v*=scale;return;}
    const int n=p.n_samples;std::vector<double> values(n),tilts(n);
    const double peaksFilm[]={460,555,650},peaksPrint[]={445,530,610};double channels[]={y,m,c};
    if(!film)for(int k=0;k<3;k++){
        std::vector<double> wl(p.wavelengths.begin(),p.wavelengths.end()),b(p.base_density.begin(),p.base_density.end());
        channels[k]*=interpolate(peaksPrint[k],wl.data(),b.data(),n);
    }
    for(int i=0;i<n;i++){
        values[i]=interpolate(p.wavelengths[i],film?peaksFilm:peaksPrint,channels,3);
        tilts[i]=std::max(0.,1+tilt/(650-555)*(p.wavelengths[i]-555));
    }
    const double spacing=(p.wavelengths.back()-p.wavelengths.front())/(n-1);
    values=smooth(values,(film?35.:20.)/spacing);if(film)tilts=smooth(tilts,35./spacing);
    for(int i=0;i<n;i++)p.base_density[i]=static_cast<float>(film?p.base_density[i]*scale*values[i]*tilts[i]*scale:values[i]*scale);
}
}
void select_experimental_spectral_method(Profile& p,const std::string& id){
    auto j=tree(("{\"spectralMethod\":\""+id+"\"}").c_str());method(p,j.get());
}

void configure_experimental_projection(FilmingParams& p,const Profile& profile){
    if(profile.experimental_method.empty())return;
    p.experimental_projection_active=true;std::copy(profile.experimental_projection,profile.experimental_projection+9,p.experimental_projection);
}
NdArray build_experimental_tc_lut(const Profile& p,const NdArray& spectra,const double* illuminant,float blur,bool window,bool surface,const float* uv,const float* ir){
    if(p.experimental_method=="hanatos2025")return build_filming_tc_lut(p,spectra,illuminant,blur,window,surface,uv,ir);
    NdArray relit=spectra;
    for(size_t i=0;i<relit.data.size();i++)relit.data[i]*=illuminant[i%81];
    auto raw=build_filming_tc_lut(p,relit,illuminant,0,false,false,uv,ir);
    const Vec2 tc=tri2quad({experimental_xy_D65[0],experimental_xy_D65[1]});
    double neutral[3];cubic_interp_lut_at_2d(raw,tc.x*(raw.shape[0]-1),tc.y*(raw.shape[1]-1),neutral);
    for(int c=0;c<3;c++)if(!std::isfinite(neutral[c])||std::abs(neutral[c])<1e-20)throw std::runtime_error("Spectral method has no finite neutral response");
    for(size_t i=0;i<raw.data.size();i++)raw.data[i]/=neutral[i%3];
    return raw;
}

void configure_experimental_couplers(DirCouplersParams& p,const char* text,const Profile* profile){
    auto j=tree(text);if(!j||!flag(*j,"dirLangmuir"))return;
    if(profile&&profile->monochrome){
        for(int c=1;c<3;c++)p.gamma_samelayer_rgb[c]=p.gamma_samelayer_rgb[0];
        for(int i=0;i<2;i++)p.gamma_interlayer_r_to_gb[i]=p.gamma_interlayer_g_to_rb[i]=p.gamma_interlayer_b_to_rg[i]=0;
    }
    p.langmuir=true;
    p.high_exposure_couplers_shift=0;
    p.diffusion_tail_um=number(*j,"dirTailUm",200,0,1000);
    p.diffusion_tail_weight=number(*j,"dirTailWeight",.03,0,1);
    for(int c=0;c<3;c++){
        const std::string suffix=profile&&profile->monochrome?"Red":c==0?"Red":c==1?"Green":"Blue";
        p.langmuir_donor_k[c]=number(*j,("dirDonor"+suffix).c_str(),1,.01,100);
        p.langmuir_receiver_k[c]=number(*j,("dirReceiver"+suffix).c_str(),1,.01,100);
    }
}

void configure_experimental_grain(GrainParams& grain,const Profile& film,const char* text){
    auto j=tree(text);if(!j||!flag(*j,"grainRms"))return;
    grain.rms_mode=true;grain.sublayers_active=true;grain.allow_gpu_sampler=false;
    grain.mult_usm_sigma=number(*j,"grainUsmSigma",.7,0,3);
    grain.mult_usm_amount=number(*j,"grainUsmAmount",1.5,0,4);
    const double scales[]={number(*j,"grainScaleFast",1,.05,4),number(*j,"grainScaleMid",.5,.05,4),number(*j,"grainScaleSlow",.25,.05,4)};
    for(int l=0;l<3;l++)grain.agx_particle_scale_layers[l]=scales[l];
    grain.agx_particle_area_um2=1;
    const int layer_count=film.density_curves_layers.empty()?0:film.density_curves_layers.size()/(film.n_density_pts*3);
    const bool layers=layer_count>0;
    for(int c=0;c<3;c++){
        const std::string suffix=film.monochrome?"Red":c==0?"Red":c==1?"Green":"Blue";
        const double rms=number(*j,("grainRms"+suffix).c_str(),c==0?6:c==1?8:10,.01,100);
        grain.rms_granularity[c]=rms;
        grain.density_min[c]=number(*j,("grainFloor"+suffix).c_str(),.03,0,.5);
        grain.uniformity[c]=number(*j,("grainUniformity"+suffix).c_str(),.97,0,1);
        double total=0;
        const int nlayer=layers?layer_count:1;
        std::vector<double> maximum(nlayer,0);
        for(int x=0;x<film.n_density_pts;x++)for(int l=0;l<nlayer;l++){
            const double d=layers?film.density_curves_layers[x*nlayer*3+l*3+c]:film.density_curves[x*3+c];
            if(std::isfinite(d))maximum[l]=std::max(maximum[l],d);
        }
        for(int l=0;l<nlayer;l++)total+=maximum[l];
        if(!(total>0))throw std::runtime_error("RMS grain requires nonzero characteristic curves");
        double peak=0;
        for(int x=0;x<film.n_density_pts;x++){
            double shape=0;
            for(int l=0;l<nlayer;l++){
                const double frac=maximum[l]/total;if(frac<=0)continue;
                const double floor=frac*grain.density_min[c];
                double d=layers?film.density_curves_layers[x*nlayer*3+l*3+c]:film.density_curves[x*3+c];if(!std::isfinite(d))d=0;d+=floor;
                shape+=scales[std::min(l,2)]/frac*d*(maximum[l]+floor-grain.uniformity[c]*d);
            }
            peak=std::max(peak,shape);
        }
        grain.agx_particle_scale[c]=(rms/1000)*(rms/1000)*(M_PI*24*24)/std::max(peak,1e-9);
        if(film.monochrome)grain.seed_base[c]=0;
    }
}
void finish_experimental_grain(float* image,int width,int height,const GrainParams& grain,double blur){
    const int n=width*height;std::vector<float> absolute(n*3);
    for(int i=0;i<n;i++)for(int c=0;c<3;c++)absolute[i*3+c]=image[i*3+c]+grain.density_min[c];
    if(blur>0)gaussian_blur(absolute.data(),width,height,3,static_cast<float>(blur));
    if(grain.mult_usm_amount>0&&grain.mult_usm_sigma>0){
        std::vector<float> low=absolute;gaussian_blur(low.data(),width,height,3,static_cast<float>(grain.mult_usm_sigma));
        double before[3]={0,0,0},after[3]={0,0,0};
        for(int i=0;i<n;i++)for(int c=0;c<3;c++){
            const double d=std::max(0.,static_cast<double>(absolute[i*3+c]));before[c]+=d;
            const double out=d<=0?0:std::pow(std::max(d,1e-6),1+grain.mult_usm_amount)/std::pow(std::max(static_cast<double>(low[i*3+c]),1e-6),grain.mult_usm_amount);
            absolute[i*3+c]=static_cast<float>(out);after[c]+=out;
        }
        for(int i=0;i<n;i++)for(int c=0;c<3;c++)if(after[c]>0)absolute[i*3+c]=static_cast<float>(absolute[i*3+c]*before[c]/after[c]);
    }
    for(int i=0;i<n;i++)for(int c=0;c<3;c++)image[i*3+c]=static_cast<float>(absolute[i*3+c]-grain.density_min[c]);
}

bool experimental_film_chemistry(const char* text){auto j=tree(text);return j&&flag(*j,"filmChemistry");}
bool experimental_print_chemistry(const char* text){auto j=tree(text);return j&&flag(*j,"printChemistry");}
void prepare_experimental_profile(Profile& p,const char* text,bool film,double gamma){
    auto j=tree(text);if(film)method(p,j.get());if(!j)return;
    chemistry(p,*j,film,gamma);base(p,*j,film);
    if(film&&j->has("colorFilter")){
        const std::string id=j->at("colorFilter").as_string();if(id=="none")return;
        const double* transmission=experimental_filter(id);
        if(!transmission)throw std::runtime_error("Unknown spectral taking filter");
        if(p.n_samples!=81)throw std::runtime_error("Taking filters require the 81-band working grid");
        for(int i=0;i<81;i++)for(int c=0;c<3;c++)p.log_sensitivity[i*3+c]+=static_cast<float>(std::log10(std::max(1e-20,transmission[i])));
        p.experimental_key+="|taking-filter:"+id;
    }
}
}
