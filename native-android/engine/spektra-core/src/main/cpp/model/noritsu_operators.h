/* MIT-derived noritsu-tool operators; adapter GPLv3. See docs/SCAN_CONTROLS_966.md. */
#pragma once
#include <array>
#include <cstdint>
#include <cmath>
#include <vector>
namespace spk::noritsu {
using Curve=std::array<int64_t,20>;
using RGB=std::array<double,3>;
struct Controls {
 int low=100,mid=100,high=100,uo=0;
 double gamma=1,saturation=1;
 RGB gains={1,1,1};
 bool gradation() const {return low!=100||mid!=100||high!=100||uo!=0;}
 bool active() const {return gradation()||gamma!=1||std::abs(saturation-1)>1e-4||std::abs(gains[0]-1)>1e-4||std::abs(gains[1]-1)>1e-4||std::abs(gains[2]-1)>1e-4;}
};
// Direct ports of vendor.py; accept arbitrary valid 20-point job curves.
Curve make_gamma_curve2(const Curve& y,const Curve& x,int low,int mid,int high);
Curve make_nega_tone2(const Curve& y,const Curve& x,int target,int uoAnchor,int mode,int low,int mid,int high);
uint16_t interpolate_u16(const Curve& y,const Curve& x,uint16_t code);
class Operator {
 Controls c;
 std::vector<uint16_t> lut;
 public:
 explicit Operator(const Controls& controls);
 RGB apply(RGB value) const;
};
}
