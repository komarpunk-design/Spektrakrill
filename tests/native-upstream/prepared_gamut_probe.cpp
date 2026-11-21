#include "model/gamut_compression.h"
#include <vector>
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace spk;
int main()try{
 for(int space:{0,1})for(int mode=2;mode<=6;mode++){
  constexpr int n=97;std::vector<double> values(n*3);for(int i=0;i<n*3;i++)values[i]=std::sin(i*.37)*.9+.35;
  auto expected=values;
  switch(mode){
   case 2:compress_rgb_aces_rgc(expected.data(),n,0,1,6);break;
   case 3:compress_rgb_oklch_chroma(expected.data(),n,space,0,1,6);break;
   case 4:compress_rgb_oklrab_chroma(expected.data(),n,space,0,1,6);break;
   case 5:compress_rgb_jzazbz_chroma(expected.data(),n,space,0,1,6);break;
   case 6:compress_rgb_cam16ucs_chroma(expected.data(),n,space,0,1,6);break;
  }
  PreparedOutputGamut mapper(OutputGamutCompress(mode),space,0,1,6);
  for(int start=0;start<n;start+=13)mapper.apply(values.data()+start*3,std::min(13,n-start));
  for(int i=0;i<n*3;i++)if((std::isfinite(values[i])!=std::isfinite(expected[i]))||(std::isfinite(values[i])&&std::abs(values[i]-expected[i])>1e-12)){std::cerr<<"difference index="<<i<<" original="<<expected[i]<<" prepared="<<values[i]<<"\n";throw std::runtime_error("prepared/tiled mapping differs from original whole-image algorithm");}
  std::cout<<"PASS original/prepared/tiled mode="<<mode<<" space="<<space<<'\n';
 }
 return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
