#include "kernels/parallel.h"
#include <atomic>
#include <chrono>
#include <thread>
#include <vector>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
int main()try{
 setenv("SPK_NUM_THREADS","8",1);spk::parallel_set_pool(1);
 for(int cap:{0,1,2,4}){
  spk::parallel_set_thermal_limit(cap);const int expected=cap?cap:8;
  if(spk::parallel_num_threads()!=expected)throw std::runtime_error("worker policy ignored");
  std::atomic<int> active{0},peak{0};std::vector<int> output(1<<18);
  spk::parallel_for(0,int(output.size()),[&](int first,int last){
   int n=++active,old=peak.load();while(old<n&&!peak.compare_exchange_weak(old,n)){}
   std::this_thread::sleep_for(std::chrono::milliseconds(2));
   for(int i=first;i<last;i++)output[i]=i;
   --active;
  });
  if(peak>expected||active!=0)throw std::runtime_error("pool exceeded the active worker limit");
  for(size_t i=0;i<output.size();i++)if(output[i]!=int(i))throw std::runtime_error("lost work");
  std::cout<<"PASS configured "<<expected<<" workers, active peak "<<peak<<'\n';
 }
 spk::parallel_set_thermal_limit(0);
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
