/* GPLv3. Objectives from experimental/model/convert.py @28bf883. */
#pragma once
#include <string>
#include <vector>
namespace spk {
std::string calibrate_negative(const std::string& profile_json,const std::string& params_json,const std::vector<float>& samples,bool base);
}
