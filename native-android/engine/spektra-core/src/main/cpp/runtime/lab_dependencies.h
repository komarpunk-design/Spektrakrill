/* GPL-3.0. Conservative, canonical stage dependencies for the Lab envelope. */
#pragma once
#include "model/lab_json.h"
#include <algorithm>
#include <cstring>
#include <initializer_list>
#include <string>

namespace spk {
namespace lab_dependencies {
inline bool contains(const std::string& key, std::initializer_list<const char*> names) {
    return std::any_of(names.begin(), names.end(), [&](const char* name) { return key == name; });
}
inline bool downstream(const std::string& key, bool printing, bool before_grain) {
    if (contains(key, {"outputModel", "noritsuJob", "noritsuJobId"})) return true;
    if (!printing && contains(key, {"printChemistry", "printGamma", "printFast", "printSlow",
            "printExhaustion", "printRed", "printGreen", "printBlue", "printBaseActive",
            "printBaseScale", "printBaseCyan", "printBaseMagenta", "printBaseYellow"})) return true;
    if (before_grain && contains(key, {"grainRms", "grainUsmSigma", "grainUsmAmount",
            "grainScaleFast", "grainScaleMid", "grainScaleSlow", "grainRmsRed", "grainRmsGreen",
            "grainRmsBlue", "grainFloorRed", "grainFloorGreen", "grainFloorBlue",
            "grainUniformityRed", "grainUniformityGreen", "grainUniformityBlue"})) return true;
    // Unknown/future fields always remain dependencies. In particular the real
    // negative's scanExposure / scanCalibration affect density reconstruction.
    return false;
}
inline void length(std::string& out, size_t n) {
    const uint64_t v = n;
    out.append(reinterpret_cast<const char*>(&v), sizeof(v));
}
inline void value(std::string& out, const json::Value& v) {
    out.push_back(static_cast<char>(v.type));
    switch (v.type) {
    case json::Type::Bool: out.push_back(v.boolean); break;
    case json::Type::Number:
        out.append(reinterpret_cast<const char*>(&v.number), sizeof(v.number)); break;
    case json::Type::String: length(out, v.str.size()); out += v.str; break;
    case json::Type::Array:
        length(out, v.array.size()); for (const auto& x : v.array) value(out, *x); break;
    case json::Type::Object:
        length(out, v.object.size());
        for (const auto& x : v.object) { length(out, x.first.size()); out += x.first; value(out, *x.second); }
        break;
    default: break;
    }
}
inline std::string key(const char* text, bool printing, bool before_grain = false) {
    if (!text || !*text) return {};
    try {
        const auto root = parse_lab_json(text);
        if (!root->is_object()) return text;
        std::string out("lab-stage-v1");
        for (const auto& x : root->object) {
            if (downstream(x.first, printing, before_grain)) continue;
            length(out, x.first.size()); out += x.first; value(out, *x.second);
        }
        return out;
    } catch (...) {
        // compute_film_cache_key also fingerprints opaque virtual-negative IDs.
        // Keep those raw bytes; stage parameter validation still owns errors.
        return text;
    }
}
} // namespace lab_dependencies
} // namespace spk
