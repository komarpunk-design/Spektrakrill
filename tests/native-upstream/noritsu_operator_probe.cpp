#include "model/noritsu_operators.h"
#include "model/noritsu_tables.h"
#include <fstream>
#include <iostream>
#include <cmath>
#include <stdexcept>
#include <string>
using namespace spk::noritsu;
template<class T>void read(std::ifstream& f,T* p,size_t count){f.read(reinterpret_cast<char*>(p),sizeof(T)*count);if(!f)throw std::runtime_error("Truncated oracle fixture");}
int main(int argc,char**argv)try{
 if(argc!=2)return 2;std::ifstream f(std::string(argv[1])+"/operators.bin",std::ios::binary),in(std::string(argv[1])+"/input.bin",std::ios::binary);
 std::array<RGB,512> input;read(in,input[0].data(),512*3);uint32_t count;read(f,&count,1);Curve x;for(int i=0;i<20;i++)x[i]=tone_x[0][i];
 double maxError=0;
 for(uint32_t c=0;c<count;c++){
  double v[9];read(f,v,9);Controls controls;controls.low=v[0];controls.mid=v[1];controls.high=v[2];controls.uo=v[3];controls.gamma=v[4];controls.saturation=v[5];controls.gains={v[6],v[7],v[8]};
  for(int channel=-1;channel<3;channel++){
   Curve y=x;if(channel>=0)for(int i=0;i<20;i++)y[i]=tone_y[channel][i];Curve gamma,nega;read(f,gamma.data(),20);read(f,nega.data(),20);
   if(make_gamma_curve2(y,x,controls.low,controls.mid,controls.high)!=gamma)throw std::runtime_error("Gamma curve mismatch case "+std::to_string(c));
   if(make_nega_tone2(y,x,0x5f00,0x5f00,controls.uo,controls.low,controls.mid,controls.high)!=nega)throw std::runtime_error("Nega tone mismatch case "+std::to_string(c));
  }
  std::vector<uint16_t> lut(65536);read(f,lut.data(),lut.size());auto y=make_nega_tone2(x,x,0x5f00,0x5f00,controls.uo,controls.low,controls.mid,controls.high);
  for(unsigned i=0;i<65536;i++)if(interpolate_u16(y,x,i)!=lut[i])throw std::runtime_error("Interpolation mismatch case "+std::to_string(c)+" code "+std::to_string(i)+" actual "+std::to_string(interpolate_u16(y,x,i))+" expected "+std::to_string(lut[i]));
  Operator op(controls);std::vector<float> expected(512*3);read(f,expected.data(),expected.size());
  for(int i=0;i<512;i++){auto out=op.apply(input[i]);for(int k=0;k<3;k++){double err=std::abs(out[k]-expected[i*3+k]);maxError=std::max(err,maxError);if(!std::isfinite(out[k])||err>2e-6)throw std::runtime_error("RGB operator mismatch case "+std::to_string(c)+" error "+std::to_string(err));}}
 }
 std::cout<<"PASS "<<count<<" source cases; "<<count*65536<<" interpolation codes; max RGB error "<<maxError<<"\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
