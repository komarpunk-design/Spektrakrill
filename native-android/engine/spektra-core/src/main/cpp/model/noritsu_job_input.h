/* Spektrafilm virtual-receiver calibration, not an OEM scanner calibration. GPLv3. */
#pragma once
#include "model/noritsu_advanced.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>

namespace spk::noritsu::input {
using Vector = std::array<double,3>;
struct Reference { Vector middle{}, slope{}; };
inline Vector evaluate(const advanced::Job& job, const Vector& code) {
    float value[3]; for(int c=0;c<3;++c)value[c]=float(std::clamp(code[c],0.,65535.));
    advanced::process(value,1,1,job,false,false,false);
    return {value[0],value[1],value[2]};
}
inline double error(const Vector& rgb,double target) {
    double result=0;for(auto v:rgb)result+=(v-target)*(v-target);return result;
}
inline bool solve(double a[3][4],Vector& result) {
    for(int k=0;k<3;++k) {
        int p=k;for(int r=k+1;r<3;++r)if(std::abs(a[r][k])>std::abs(a[p][k]))p=r;
        if(std::abs(a[p][k])<1e-24)return false;
        for(int c=k;c<4;++c)std::swap(a[p][c],a[k][c]);
        double divisor=a[k][k];for(int c=k;c<4;++c)a[k][c]/=divisor;
        for(int r=0;r<3;++r)if(r!=k){double factor=a[r][k];for(int c=k;c<4;++c)a[r][c]-=factor*a[k][c];}
    }
    for(int c=0;c<3;++c)result[c]=a[c][3];return true;
}
inline Vector neutral(const advanced::Job& job,double target) {
    Vector x{};double best=1e100;
    // Locate the valid tonal interval first; starting at code zero can be on a flat toe.
    for(int i=0;i<=128;++i) {
        Vector probe;probe.fill(i*65535./128);double cost=error(evaluate(job,probe),target);
        if(cost<best){best=cost;x=probe;}
    }
    for(int iteration=0;iteration<30;++iteration) {
        auto rgb=evaluate(job,x);double jac[3][3];
        for(int c=0;c<3;++c) {
            auto lo=x,hi=x;lo[c]=std::max(0.,x[c]-128);hi[c]=std::min(65535.,x[c]+128);
            auto a=evaluate(job,lo),b=evaluate(job,hi);
            for(int r=0;r<3;++r)jac[r][c]=(b[r]-a[r])/(hi[c]-lo[c]);
        }
        double system[3][4]{};
        for(int c=0;c<3;++c){for(int r=0;r<3;++r)system[c][3]+=jac[r][c]*(target-rgb[r]);
            for(int k=0;k<3;++k){for(int r=0;r<3;++r)system[c][k]+=jac[r][c]*jac[r][k];if(c==k)system[c][k]+=1e-14;}}
        Vector delta;if(!solve(system,delta))break;bool improved=false;
        for(int step=0;step<8;++step) {
            auto probe=x;for(int c=0;c<3;++c)probe[c]=std::clamp(x[c]+std::clamp(delta[c],-16000.,16000.)*std::exp2(-step),0.,65535.);
            double cost=error(evaluate(job,probe),target);
            if(cost<best){x=probe;best=cost;improved=true;break;}
        }
        if(!improved || best<1e-8)break;
    }
    // Byte-output jobs cannot represent arbitrary linear reference values exactly.
    if(best>3*.008*.008)throw std::runtime_error("Noritsu: profile cannot reproduce a neutral reference; input calibration rejected");
    return x;
}
inline Reference calibrate(const advanced::Job& job) {
    Reference result;result.middle=neutral(job,.18);
    auto low=neutral(job,.18*std::pow(10.,-.15)),high=neutral(job,.18*std::pow(10.,.15));
    for(int c=0;c<3;++c) {
        result.slope[c]=(high[c]-low[c])/.3;
        if(!std::isfinite(result.slope[c])||result.slope[c]<=0)throw std::runtime_error("Noritsu: nonmonotonic profile reference");
    }
    return result;
}
}
