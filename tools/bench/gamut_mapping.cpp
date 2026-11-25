/* GPLv3. Host precision/timing probe; compare separate builds against their own headers. */
#include "model/gamut_compression.h"
#include <vector>
#include <cmath>
#include <fstream>
#include <iostream>
#include <chrono>
int main(int argc,char**argv){
 if(argc!=2)return 2;std::ofstream output(argv[1],std::ios::binary);
 for(int mode=2;mode<=6;mode++)for(int space=0;space<6;space++){
  const int n=65536;std::vector<double> source(n*3);for(int i=0;i<n*3;i++)source[i]=std::sin(i*.37)*2.9+.35;
  spk::PreparedOutputGamut map(spk::OutputGamutCompress(mode),space,.15,1.05,3.7);
  std::vector<double> values;double total=0;
  for(int r=0;r<3;r++){
   values=source;auto start=std::chrono::steady_clock::now();map.apply(values.data(),n);
   total+=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
  }
  output.write(reinterpret_cast<const char*>(values.data()),values.size()*sizeof(double));
  std::cout<<mode<<" "<<space<<" "<<total/3<<'\n';
 }
 return output?0:1;
}
