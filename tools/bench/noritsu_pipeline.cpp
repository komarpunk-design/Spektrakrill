/* GPLv3. Optional host timing/precision probe; not an Android performance claim. */
#include "model/noritsu_advanced.h"
#include <vector>
#include <cmath>
#include <fstream>
#include <iostream>
#include <chrono>
int main(int argc,char**argv){
 if(argc!=2)return 2;std::ofstream output(argv[1],std::ios::binary);
 auto job=spk::noritsu::advanced::builtin_job("ls600-g0t1-neutral-v1");
 for(const auto shape:std::vector<std::pair<int,int>>{{512,389},{513,390}}){
  int w=shape.first,h=shape.second;std::vector<float> source(size_t(w)*h*3);
  for(size_t i=0;i<source.size();i++)source[i]=float((i*1879)%65521);
  std::vector<float> values;double total=0;
  for(int r=0;r<3;r++){
   values=source;auto start=std::chrono::steady_clock::now();
   spk::noritsu::advanced::process(values.data(),w,h,*job,true,true,true);
   total+=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
  }
  output.write(reinterpret_cast<const char*>(values.data()),values.size()*sizeof(float));
  std::cout<<w<<" "<<h<<" "<<total/3<<'\n';
 }
 return output?0:1;
}
