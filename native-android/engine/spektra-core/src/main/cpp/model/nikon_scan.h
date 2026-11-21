/* Nikonlook-v2 numeric port from Rohan Pandula's MIT ScanStudio.
 * Virtual receiver adapter is Spektrafilm GPLv3; not a Coolscan hardware calibration. */
#pragma once
#include "model/nikon_data.h"
#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace spk::nikon {
using RGB=std::array<double,3>;
inline double percentile(const std::vector<double>& x,double p){double f=p*.01*(x.size()-1);size_t lo=size_t(std::floor(f)),hi=size_t(std::ceil(f));return x[lo]*(1-(f-lo))+x[hi]*(f-lo);}
inline RGB gains(const float* raw,int w,int h,bool automatic){
 RGB result={data::reference_gain[0],data::reference_gain[1],data::reference_gain[2]};
 if(!automatic)return result;
 if(w<=0||h<=0)throw std::invalid_argument("Nikon: empty raster");
 constexpr double q[]={1,2,5,10,20,35,50,65,80,90,95,98,99};
 double features[48];int n=0;
 for(int c=0;c<3;c++){
  std::vector<double> all,masked;
  for(int y=0;y<h;y+=data::stride)for(int x=0;x<w;x+=data::stride){double v=raw[(size_t(y)*w+x)*3+c];if(std::isfinite(v)){all.push_back(v);if(v>data::railLow&&v<data::railHigh)masked.push_back(v);}}
  auto& population=masked.size()>=1000?masked:all;
  if(population.empty())throw std::invalid_argument("Nikon: channel has no finite samples");
  std::sort(population.begin(),population.end());double values[13];
  for(int i=0;i<13;i++){values[i]=percentile(population,q[i]);features[n++]=std::log(std::max(values[i],1e-9));}
  for(int i=0;i<3;i++)features[n++]=std::log(std::max(values[12-i]-values[i],1e-9));
 }
 for(int c=0;c<3;c++){double value=data::log_gain_intercept[c];for(int i=0;i<48;i++)value+=((features[i]-data::feature_mean[i])/data::feature_scale[i])*data::coefficients[i][c];result[c]=std::clamp(std::exp(value),data::gain_bounds[0],data::gain_bounds[1]);}
 return result;
}
inline double curve(double v,const double* x,const double* y){
 constexpr size_t n=257;if(v<=x[0])return y[0];if(v>=x[n-1])return y[n-1];
 auto k=std::upper_bound(x,x+n,v)-x;double t=(v-x[k-1])/(x[k]-x[k-1]);return y[k-1]*(1-t)+y[k]*t;
}
/** Faithful Layer B, encoded Adobe-RGB-family output (no invented ICC). */
inline RGB apply(RGB raw,RGB gain){
 RGB result;const double* xs[]={data::x0,data::x1,data::x2};const double* ys[]={data::y0,data::y1,data::y2};
 for(int c=0;c<3;c++){double u=0;for(int k=0;k<3;k++)u+=data::matrix[c][k]*raw[k]*gain[k];result[c]=std::clamp(curve(u,xs[c],ys[c]),0.,1.);}
 return result;
}
}
