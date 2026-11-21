#include "model/nikon_scan.h"
#include <iostream>
#include <stdexcept>
#include <limits>
using namespace spk::nikon;
void check(bool b,const char* m){if(!b)throw std::runtime_error(m);std::cout<<"PASS "<<m<<'\n';}
int main()try{
 const auto nan=std::numeric_limits<double>::quiet_NaN();
 for(auto v:apply({nan,.2,.3},{1,1,1}))check(std::isfinite(v),"NaN follows upstream curve endpoint policy without invalid indexing");
 const Matrix j={RGB{2,.4,0},RGB{.2,1,.1},RGB{0,.3,.7}};const auto basis=virtual_color_basis(j);
 for(int r=0;r<3;r++){
  double white=0;for(int c=0;c<3;c++)white+=basis[r][c];check(std::abs(white-1)<1e-12,"virtual basis preserves common exposure");
  for(int c=0;c<3;c++)if(c!=r){double cross=0;for(int k=0;k<3;k++)cross+=j[r][k]*basis[k][c];check(std::abs(cross)<1e-12,"full-channel basis cancels local crosstalk");}
 }
 const RGB raw[]={{.01,.012,.009},{.1,.08,.06},{.3,.25,.2},{.455,.462,.364},{.7,.65,.6},{.95,.93,.9}};
 const RGB expected[]={{.8745168478139992,.8756997585296631,.897667407989502},{.8745168180192864,.8571021416704295,.8712481287405098},{.5952691635855909,.43141306059503676,.5400840883143807},{.31321822693219087,.16022528207334077,.2557434375355004},{.13062594216570117,.05440001030661233,.10826353557346319},{.061124366591036455,.01729307368782625,.04543075730736556}};
 for(int i=0;i<6;i++){auto out=apply(raw[i],{.7,.35,.28});for(int c=0;c<3;c++)check(std::abs(out[c]-expected[i][c])<1e-9,"Layer B matches upstream independent oracle");}
 for(auto dims:{std::pair<int,int>{48,64},{528,640}}){
  int w=dims.first,h=dims.second;std::vector<float> a(size_t(w)*h*3);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++)for(int c=0;c<3;c++)a[(y*w+x)*3+c]=float(.001+(((y*31+x*17+c*7)%997)/996.0)*.979);
  auto k=gains(a.data(),w,h,true);const RGB golden=w==48?RGB{.759056869674804,.4991515696181712,.25250512923880397}:RGB{.702656406701031,.43156628045481704,.21943355626290767};for(int c=0;c<3;c++)check(std::abs(k[c]-golden[c])<2e-6,"Layer A matches upstream gain oracle (float32 input tolerance)");for(auto v:k)check(std::isfinite(v)&&v>=.02&&v<=100,"gain estimator remains finite within original bounds");
 }
 return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
