/* GPL-3.0. Real projected exposure dispatch, both CPU entry points and placements. */
#include "gpu/vulkan_compute.h"
#include "model/experimental_projection.h"
#include "model/negs_projection.h"
#include "runtime/stages/filming.h"
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <vector>

int main() try {
    if (!spk::gpu::available()) throw std::runtime_error("real Vulkan required");
    constexpr int w = 96, h = 80, count = w * h;
    spk::NdArray lut; lut.shape = {33, 33, 3}; lut.data.resize(33 * 33 * 3);
    for (int x = 0; x < 33; ++x) for (int y = 0; y < 33; ++y) for (int c = 0; c < 3; ++c)
        lut.data[(x * 33 + y) * 3 + c] = .2 + .01 * x + .007 * y + .1 * c + .00003 * x * y;
    std::vector<double> source(count * 3);
    std::vector<float> source32(source.size()), reference(source.size()), fast(source.size());
    for (size_t i = 0; i < source.size(); ++i) {
        source[i] = .00001 + 2. * std::pow(double((i * 1879) % 65521) / 65521, 3);
        source32[i] = source[i];
    }
    int comparisons = 0;
    for (const double* matrix : {spk::experimental_prophoto_D65, spk::experimental_prophoto_T, spk::negs_prophoto_BB3200})
    for (bool f32 : {false, true}) for (bool materialized : {false, true})
    for (bool automatic : {false, true}) for (double ev : {-3., 0., 3.}) {
        spk::FilmingParams p;
        p.halation.active = p.grain.active = p.diffusion_filter.active = false;
        p.experimental_projection_active = true;
        std::copy(matrix, matrix + 9, p.experimental_projection);
        p.exposure_compensation_ev = ev;
        p.raw_auto_exposure = automatic;
        p.bw_exposure_correction = materialized ? 1.07 : 1.;
        const double gain = f32 ? .371 : 1.;
        auto render = [&](float* out) {
            if (f32) spk::expose_f32_gain(source32.data(), gain, w, h, p, lut, out);
            else spk::expose(source.data(), w, h, p, lut, out);
        };
        render(reference.data());
        const auto before = spk::gpu_projected_expose_frames_rendered();
        p.allow_gpu_filming = true; render(fast.data());
        if (spk::gpu_projected_expose_frames_rendered() <= before)
            throw std::runtime_error("projected shader refused valid input");
        double maximum = 0, rms = 0;
        for (size_t i = 0; i < fast.size(); ++i) {
            const double d = std::abs(double(fast[i]) - reference[i]);
            if (!std::isfinite(d)) throw std::runtime_error("nonfinite exposure");
            maximum = std::max(maximum, d); rms += d * d;
        }
        rms = std::sqrt(rms / fast.size());
        if (maximum > 5e-5 || rms > 5e-6) throw std::runtime_error("exposure differs beyond tolerance");
        std::cout << "PASS projected expose f32=" << f32 << " materialized=" << materialized << " automatic=" << automatic
                  << " EV=" << ev << " max=" << maximum << " rms=" << rms << '\n';
        // The diagnostic CPU override must preserve the exact reference.
        setenv("SPK_PROJECTED_GPU", "0", 1); render(fast.data()); unsetenv("SPK_PROJECTED_GPU");
        if (fast != reference) throw std::runtime_error("projected CPU fallback is not exact");
        ++comparisons;
    }
    // Invalid matrix is refused before it can write the destination.
    double bad[9] = {}; bad[0] = std::nan("");
    std::fill(fast.begin(), fast.end(), 17.f); spk::gpu::FilmingStageDiagnostics d;
    if (spk::gpu::filming_expose(source.data(), nullptr, 1., count, w, h, lut.data.data(), 33, 1., nullptr, fast.data(), &d, bad))
        throw std::runtime_error("invalid projection accepted");
    for (float x : fast) if (x != 17.f) throw std::runtime_error("refusal wrote destination");
    std::cout << "PASS " << comparisons << " actual Vulkan projections and exact CPU fallbacks\n";
} catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
