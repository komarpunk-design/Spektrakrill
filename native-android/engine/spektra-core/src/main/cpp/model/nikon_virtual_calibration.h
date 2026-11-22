/* GPL-3.0. Exact immutable preparation for the virtual Nikon input adapter. */
#pragma once
#include "model/nikon_scan.h"
#include "model/color_output.h"
#include "profiles/profile.h"
#include <map>
#include <memory>
#include <mutex>
#include <string>

namespace spk::outputs {
using RGB = std::array<double, 3>;
inline double density_at(const Profile& f,double x,int c,double gamma){x*=gamma;auto& axis=f.log_exposure;if(axis.empty())throw std::runtime_error("No receiver calibration curve");auto it=std::upper_bound(axis.begin(),axis.end(),x);if(it==axis.begin())return f.density_curves[c];if(it==axis.end())return f.density_curves[(axis.size()-1)*3+c];int hi=it-axis.begin(),lo=hi-1;double a=(x-axis[lo])/(axis[hi]-axis[lo]);return f.density_curves[lo*3+c]*(1-a)+f.density_curves[hi*3+c]*a;}

struct NikonVirtualCalibration {
    RGB ref{}, slope{}, target{}, target_slope{};
    nikon::Matrix basis{};
    std::vector<RGB> neutral_q;
    RGB source_linear(RGB q, double timing) const {
        nikon::RGB raw;
        for (int c = 0; c < 3; ++c)
            raw[c] = target[c] * std::pow(10., std::clamp((q[c] - timing) * target_slope[c], -12., 12.));
        const nikon::RGB gain = {nikon::data::reference_gain[0], nikon::data::reference_gain[1], nikon::data::reference_gain[2]};
        auto v = nikon::apply(raw, gain);
        for (double& c : v) c = std::pow(c, 2.19921875);
        return v;
    }
};
struct NikonVirtualCalibrationCache {
    std::mutex mutex;
    std::map<std::string, std::shared_ptr<const NikonVirtualCalibration>> entries;
    uint64_t builds = 0;
};
inline NikonVirtualCalibrationCache& nikon_virtual_calibration_cache() {
    static NikonVirtualCalibrationCache cache;
    return cache;
}
inline uint64_t nikon_virtual_calibration_builds() {
    auto& cache = nikon_virtual_calibration_cache();
    std::lock_guard<std::mutex> lock(cache.mutex); return cache.builds;
}
inline std::shared_ptr<const NikonVirtualCalibration> prepare_nikon_virtual_calibration(
        const Profile& anchor, const double centers[3], const double widths[3]) {
    std::string key;
    auto bytes = [&](const void* p, size_t n) { key.append(static_cast<const char*>(p), n); };
    auto vector = [&](const auto& v) {
        const uint64_t size = v.size(); bytes(&size, sizeof(size));
        if (!v.empty()) bytes(v.data(), v.size() * sizeof(v[0]));
    };
    bytes(&anchor.n_samples, sizeof(anchor.n_samples));
    bytes(centers, 3 * sizeof(double)); bytes(widths, 3 * sizeof(double));
    vector(anchor.wavelengths); vector(anchor.base_density); vector(anchor.channel_density);
    vector(anchor.log_exposure); vector(anchor.density_curves);
    auto& cache = nikon_virtual_calibration_cache();
    {
        std::lock_guard<std::mutex> lock(cache.mutex);
        const auto found = cache.entries.find(key);
        if (found != cache.entries.end()) return found->second;
    }
    auto p = std::make_shared<NikonVirtualCalibration>();
    std::vector<RGB> bands(anchor.n_samples); RGB sums{};
    for (int i = 0; i < anchor.n_samples; ++i) for (int c = 0; c < 3; ++c) {
        double value = std::exp(-.5 * std::pow((anchor.wavelengths[i] - centers[c]) / widths[c], 2));
        if (!std::isfinite(anchor.base_density[i]) || !std::isfinite(anchor.channel_density[i * 3]) ||
            !std::isfinite(anchor.channel_density[i * 3 + 1]) || !std::isfinite(anchor.channel_density[i * 3 + 2])) value = 0;
        bands[i][c] = value; sums[c] += value;
    }
    auto read = [&](RGB d) {
        RGB energy{};
        for (int i = 0; i < anchor.n_samples; ++i) {
            if (bands[i][0] + bands[i][1] + bands[i][2] == 0) continue;
            double od = anchor.base_density[i];
            for (int k = 0; k < 3; ++k) od += d[k] * anchor.channel_density[i * 3 + k];
            const double light = std::pow(10., -od);
            for (int c = 0; c < 3; ++c) energy[c] += bands[i][c] * light;
        }
        for (int c = 0; c < 3; ++c) energy[c] = std::log10(std::max(energy[c] / std::max(sums[c], 1e-12), 1e-12));
        return energy;
    };
    RGB mid, low, high;
    for (int c = 0; c < 3; ++c) {
        mid[c] = density_at(anchor, 0, c, 1); low[c] = density_at(anchor, -.15, c, 1); high[c] = density_at(anchor, .15, c, 1);
    }
    p->ref = read(mid); const auto lower = read(low), upper = read(high);
    p->target = nikon::neutral_raw(.18);
    const auto target_lo = nikon::neutral_raw(.18 * std::pow(10., -.15)), target_hi = nikon::neutral_raw(.18 * std::pow(10., .15));
    for (int c = 0; c < 3; ++c) {
        p->slope[c] = (upper[c] - lower[c]) / .3;
        p->target_slope[c] = std::log10(target_hi[c] / target_lo[c]) / .3;
        if (!std::isfinite(p->slope[c]) || std::abs(p->slope[c]) < 1e-8) throw std::runtime_error("Nikon: flat film reference");
    }
    const double adobe_xyz[] = {.60892798724451913,.20905353854062689,.14621373920552333,.31010729610234972,.63117128488427909,.05871454523345384,.018905541977057749,.05148877417082514,.75473305413748026};
    auto canonical = [&](RGB q) {
        const auto value = p->source_linear(q, 0); RGB xyz{}, rgb{};
        for (int c = 0; c < 3; ++c) for (int k = 0; k < 3; ++k) xyz[c] += adobe_xyz[c * 3 + k] * value[k];
        for (int c = 0; c < 3; ++c) for (int k = 0; k < 3; ++k) rgb[c] += kXYZ_to_RGB[SPK_CS_SRGB][c * 3 + k] * xyz[k];
        return rgb;
    };
    nikon::Matrix jacobian; constexpr double delta = 1e-4;
    for (int k = 0; k < 3; ++k) {
        RGB lo{}, hi{}; lo[k] = -delta; hi[k] = delta;
        const auto a = canonical(lo), b = canonical(hi);
        for (int c = 0; c < 3; ++c) jacobian[c][k] = std::log10(std::max(b[c], 1e-12) / std::max(a[c], 1e-12)) / (2 * delta);
    }
    p->basis = nikon::virtual_color_basis(jacobian);
    constexpr int samples = 1024; p->neutral_q.reserve(samples + 1);
    for (int i = 0; i <= samples; ++i) {
        const double e = anchor.log_exposure.front() + (anchor.log_exposure.back() - anchor.log_exposure.front()) * i / samples;
        RGB d; for (int c = 0; c < 3; ++c) d[c] = density_at(anchor, e, c, 1);
        auto q = read(d); for (int c = 0; c < 3; ++c) q[c] = (q[c] - p->ref[c]) / p->slope[c];
        p->neutral_q.push_back(q);
    }
    std::lock_guard<std::mutex> lock(cache.mutex);
    // Exact table bytes, bounded to four nominal profiles. No image statistics,
    // operator edits, or mutable pointers can become a calibration identity.
    if (cache.entries.size() >= 4) cache.entries.erase(cache.entries.begin());
    ++cache.builds; cache.entries[key] = p; return p;
}
} // namespace spk::outputs
