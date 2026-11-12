/* GPLv3. Adapted from noahhaasis/negs @26c903b, model/grain.rs.
 * Retains all four fitted BW sublayers; uses the existing native stochastic
 * sampler (statistical parity, not identical Rust random realizations). */
#include "model/negs_grain.h"
#include <algorithm>
#include <cmath>
#include <vector>
namespace spk {
bool apply_negs_grain(const Profile& p,const float* normalized,float* density,int width,int height,double pixel_um,const GrainParams& grain){
 const int n=p.n_density_pts, layers=p.density_curves_layers.size()/(n*3),pixels=width*height;
 if(!p.monochrome||layers<=3||!grain.rms_mode)return false;
 std::vector<double> maximum(layers);double total=0;for(int l=0;l<layers;l++){for(int i=0;i<n;i++)maximum[l]=std::max(maximum[l],double(p.density_curves_layers[(i*layers+l)*3]));total+=maximum[l];}
 if(!(total>0))return false;
 std::vector<float> absolute(pixels*3),input(pixels),sample(pixels);
 for(int l=0;l<layers;l++){
  const double fraction=maximum[l]/total;if(!(fraction>0))continue;
  const double floor=fraction*grain.density_min[0],top=maximum[l]+floor;
  const double area=grain.agx_particle_scale[0]*grain.agx_particle_area_um2*grain.agx_particle_scale_layers[std::min(l,2)]/fraction;
  const double particles=pixel_um*pixel_um/std::max(area,1e-12);
  for(int i=0;i<pixels;i++){
   double target=density[i*3];int lo=0,hi=n-1;
   auto point=[&](int j){return normalized[(p.is_positive()?n-1-j:j)*3];};
   while(hi-lo>1){int mid=(lo+hi)/2;if(point(mid)<=target)lo=mid;else hi=mid;}
   const int a=p.is_positive()?n-1-lo:lo,b=p.is_positive()?n-1-hi:hi;
   const double delta=point(hi)-point(lo),t=delta>0?std::clamp((target-point(lo))/delta,0.,1.):0;
   input[i]=floor+(1-t)*p.density_curves_layers[(a*layers+l)*3]+t*p.density_curves_layers[(b*layers+l)*3];
  }
  layer_particle_model(input.data(),pixels,width,height,top,particles,grain.uniformity[0],grain.seed_offset+l*10,grain.blur_dye_clouds_um/std::max(pixel_um,1e-6),sample.data(),grain.fast_sampler?StatsRng::Generator::Fast:StatsRng::Generator::Exact);
  for(int i=0;i<pixels;i++)for(int c=0;c<3;c++)absolute[i*3+c]+=sample[i];
 }
 add_micro_structure(absolute.data(),pixels,width,height,grain.micro_structure,pixel_um,grain.seed_offset);
 for(int i=0;i<pixels;i++)for(int c=0;c<3;c++)density[i*3+c]=absolute[i*3]-grain.density_min[c];
 return true;
}
}
