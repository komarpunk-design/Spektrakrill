#include "model/noritsu_advanced.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <stdexcept>
#include <cmath>
using namespace spk::noritsu::advanced;
template<class T>void read(std::ifstream& f,T* v,size_t n){f.read(reinterpret_cast<char*>(v),n*sizeof(T));if(!f)throw std::runtime_error("truncated oracle");}
int main(int argc,char**argv)try{
 if(argc!=2)return 2;
 for(int c=0;c<5;c++){
  std::ifstream jf(std::string(argv[1])+"/job"+std::to_string(c)+".json");std::stringstream text;text<<jf.rdbuf();auto root=spk::json::parse(text.str());auto job=read_job(*root);
  for(int s=0;s<6;s++){
   std::ifstream f(std::string(argv[1])+"/case"+std::to_string(c)+"-stage"+std::to_string(s)+".bin",std::ios::binary);uint32_t w,h;read(f,&w,1);read(f,&h,1);std::vector<uint16_t> input(size_t(w)*h*3),expected(input.size());read(f,input.data(),input.size());read(f,expected.data(),expected.size());stage(input.data(),w,h,*job,s);
   size_t errors=0;for(size_t i=0;i<input.size();i++)if(input[i]!=expected[i]){if(errors++<3)std::cerr<<"case="<<c<<" stage="<<s<<" index="<<i<<" expected="<<expected[i]<<" actual="<<input[i]<<'\n';}
   if(errors)throw std::runtime_error("oracle mismatches: "+std::to_string(errors));std::cout<<"PASS case "<<c<<" stage "<<s<<'\n';
  }
  std::ifstream f(std::string(argv[1])+"/case"+std::to_string(c)+"-full.bin",std::ios::binary);uint32_t w,h;read(f,&w,1);read(f,&h,1);std::vector<uint16_t> codes(size_t(w)*h*3);std::vector<float> pixels(codes.size()),expected(codes.size());read(f,codes.data(),codes.size());read(f,expected.data(),expected.size());for(size_t i=0;i<codes.size();i++)pixels[i]=codes[i];process(pixels.data(),w,h,*job,true,true,true);for(size_t i=0;i<pixels.size();i++)if(std::abs(pixels[i]-expected[i])>1e-7)throw std::runtime_error("in-place full pipeline mismatch");std::cout<<"PASS full pipeline "<<c<<'\n';
 }
 return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
