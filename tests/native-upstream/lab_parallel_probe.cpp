#include "model/layered_transport.h"
#include "model/noritsu_advanced.h"
#include <chrono>
#include <iostream>
#include <cstring>
#include <stdexcept>
#include <cstdlib>
using Clock=std::chrono::steady_clock;
int main()try{
 const int w=512,h=384;double strengths[]={.1,.05,.025};spk::transport::Params p;p.model="layered";p.anti=.4;
 std::vector<double> source(w*h*3);for(size_t i=0;i<source.size();i++)source[i]=.01+((i*1709)%65521)/65521.;auto one=source,four=source;
 setenv("SPK_NUM_THREADS","1",1);auto warm=source;spk::transport::apply(warm.data(),w,h,"kodak_portra_400",p,strengths,.035,1,1);
 auto t=Clock::now();spk::transport::apply(one.data(),w,h,"kodak_portra_400",p,strengths,.035,1,1);auto a=Clock::now();
 setenv("SPK_NUM_THREADS","4",1);spk::transport::apply(four.data(),w,h,"kodak_portra_400",p,strengths,.035,1,1);auto b=Clock::now();
 if(one!=four)throw std::runtime_error("transport changed across worker counts");
 std::cout<<"Transport exact: 1 thread "<<std::chrono::duration<double,std::milli>(a-t).count()<<"ms, 4 threads "<<std::chrono::duration<double,std::milli>(b-a).count()<<"ms\n";
 auto job=spk::noritsu::advanced::builtin_job("ls600-g0t1-neutral-v1");
 for(auto dims:{std::pair<int,int>{512,384},{513,385}}){int w=dims.first,h=dims.second;std::vector<float> src(w*h*3);for(size_t i=0;i<src.size();i++)src[i]=float((i*1879)%60000+500);auto single=src,multi=src;
  setenv("SPK_NUM_THREADS","1",1);t=Clock::now();spk::noritsu::advanced::process(single.data(),w,h,*job,true,true,true);a=Clock::now();
  setenv("SPK_NUM_THREADS","4",1);spk::noritsu::advanced::process(multi.data(),w,h,*job,true,true,true);b=Clock::now();
  if(single!=multi)throw std::runtime_error("factory Noritsu changed across worker counts");
  std::cout<<"Noritsu exact "<<w<<"x"<<h<<": 1 thread "<<std::chrono::duration<double,std::milli>(a-t).count()<<"ms, 4 threads "<<std::chrono::duration<double,std::milli>(b-a).count()<<"ms\n";
 }
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
