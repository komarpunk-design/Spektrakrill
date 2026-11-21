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
 constexpr size_t n=257;if(std::isnan(v))return y[0];if(v<=x[0])return y[0];if(v>=x[n-1])return y[n-1];
 auto k=std::upper_bound(x,x+n,v)-x;double t=(v-x[k-1])/(x[k]-x[k-1]);return y[k-1]*(1-t)+y[k]*t;
}
/** Faithful Layer B, encoded Adobe-RGB-family output (no invented ICC). */
inline RGB apply(RGB raw,RGB gain){
 RGB result;const double* xs[]={data::x0,data::x1,data::x2};const double* ys[]={data::y0,data::y1,data::y2};
 for(int c=0;c<3;c++){double u=0;for(int k=0;k<3;k++)u+=data::matrix[c][k]*raw[k]*gain[k];result[c]=std::clamp(curve(u,xs[c],ys[c]),0.,1.);}
 return result;
}
}

namespace spk::nikon {
/** Virtual-input calibration only; not a measured Coolscan sensor profile. */
inline RGB neutral_raw(double linear) {
 const double* xs[]={data::x0,data::x1,data::x2};const double* ys[]={data::y0,data::y1,data::y2};
 double a[3][4];double target=std::pow(linear,1./2.19921875);
 for(int c=0;c<3;c++){
  double lo=xs[c][0],hi=xs[c][256];
  for(int i=0;i<60;i++){double mid=(lo+hi)*.5;if(curve(mid,xs[c],ys[c])>target)lo=mid;else hi=mid;}
  for(int k=0;k<3;k++)a[c][k]=data::matrix[c][k]*data::reference_gain[k];a[c][3]=(lo+hi)*.5;
 }
 for(int k=0;k<3;k++){
  int row=k;for(int r=k+1;r<3;r++)if(std::abs(a[r][k])>std::abs(a[row][k]))row=r;
  for(int c=k;c<4;c++)std::swap(a[k][c],a[row][c]);double d=a[k][k];if(std::abs(d)<1e-12)throw std::runtime_error("Nikon: singular calibration");
  for(int c=k;c<4;c++)a[k][c]/=d;
  for(int r=0;r<3;r++)if(r!=k){double v=a[r][k];for(int c=k;c<4;c++)a[r][c]-=v*a[k][c];}
 }
 RGB result;for(int c=0;c<3;c++){result[c]=a[c][3];if(!std::isfinite(result[c])||result[c]<=0)throw std::runtime_error("Nikon: unusable neutral calibration");}return result;
}
}

namespace spk::nikon {
// Profile-derived neutral-axis calibration for virtual negatives. Does not
// change the learned bundle or its hardware gain estimator; reference neutral
// luminance is retained while balancing its channels.
// The source model has different channel floors/shoulders, so a single gray
// anchor cannot balance its whole usable tonal range.
class NeutralAxisBalance {
 struct Entry {double score;RGB gain;};
 std::vector<Entry> table;
 public:
 void add(double score,RGB neutral){
  // Y coefficients of the same Adobe RGB -> XYZ D50 matrix as the receiver.
  const double Y=.31010729610234972*neutral[0]+.63117128488427909*neutral[1]+.05871454523345384*neutral[2];
  RGB gain;for(int c=0;c<3;c++)gain[c]=Y/std::max(neutral[c],1e-12);
  table.push_back({score,gain});
 }
 void prepare(){std::stable_sort(table.begin(),table.end(),[](auto&a,auto&b){return a.score<b.score;});}
 RGB apply(RGB value,double score)const{
  if(!std::isfinite(score))return value;
  const RGB* gain;RGB interpolated;
  if(score<=table.front().score)gain=&table.front().gain;
  else if(score>=table.back().score)gain=&table.back().gain;
  else{
   auto hi=std::upper_bound(table.begin(),table.end(),score,[](double v,const Entry&e){return v<e.score;});auto lo=hi-1;
   double t=(score-lo->score)/std::max(hi->score-lo->score,1e-12);
   for(int c=0;c<3;c++)interpolated[c]=lo->gain[c]*(1-t)+hi->gain[c]*t;gain=&interpolated;
  }
  for(int c=0;c<3;c++)value[c]*=(*gain)[c];return value;
 }
};
}

namespace spk::nikon {
using Matrix=std::array<RGB,3>;
// A source-derived change of virtual sensor basis. Normalize on the neutral
// axis so scalar exposure is not turned into a three-channel white balance.
inline Matrix virtual_color_basis(const Matrix& jacobian){
 double a[3][6];RGB neutralSlope{};
 for(int r=0;r<3;r++){for(int c=0;c<3;c++){a[r][c]=jacobian[r][c];a[r][c+3]=r==c?1:0;neutralSlope[r]+=jacobian[r][c];}}
 for(int k=0;k<3;k++){
  int row=k;for(int r=k+1;r<3;r++)if(std::abs(a[r][k])>std::abs(a[row][k]))row=r;
  for(int c=0;c<6;c++)std::swap(a[k][c],a[row][c]);double d=a[k][k];
  if(!std::isfinite(d)||std::abs(d)<1e-8)throw std::runtime_error("Nikon: singular virtual color basis");
  for(int c=0;c<6;c++)a[k][c]/=d;
  for(int r=0;r<3;r++)if(r!=k){double v=a[r][k];for(int c=0;c<6;c++)a[r][c]-=v*a[k][c];}
 }
 Matrix result;for(int r=0;r<3;r++)for(int c=0;c<3;c++)result[r][c]=a[r][c+3]*neutralSlope[c];return result;
}
}
