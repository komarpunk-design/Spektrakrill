/* GPLv3. Inverse scan model from spektrafilm experimental/model/convert.py,
 * Andrea Volpato @28bf883. See docs/EXPERIMENTAL_PARITY.md. */
#pragma once
#include "profiles/profile.h"
#include "model/color_output.h"
#include "kernels/lut3d.h"
#include "spektra.h"
#include <memory>
namespace spk {
struct NegativeSettings {
 std::string workflow="normal",illuminant="D55",calibration;
 double exposure=0; bool use_lut=false; int resolution=33;
 bool active() const {return workflow!="normal";}
};
NegativeSettings negative_settings(const char*);
class NegativeConverter {
 double weights[81][3]{},dye[81][3]{},base[81]{},hi[3]{},center[3]{},log0[3]{},seed_inverse[9]{},matrix[9]{},gain=1; bool decode=false;
 std::shared_ptr<const PreparedLut3D> prepared;
public:
 NegativeConverter(const Profile&,const NegativeSettings&,spk_color_space,bool inputCctf=false);
 void forward(const double*,double*,double* jac=nullptr) const;
 void invert(const double*,float*) const;
 void convert(const float*,const double*,double,int,float*) const;
};
// Owner keeps the profile's resolved viewing pointer alive through scan().
struct NegativeViewing {
 float spectrum[81]; ViewingIlluminant value;
 explicit NegativeViewing(const NegativeSettings&);
};
}
