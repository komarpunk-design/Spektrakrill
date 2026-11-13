/* Bounded RAW preview reduction, in linear light. GPLv3. */
#pragma once
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace spectrafilm::preview {
struct Size { int width; int height; };

inline Size boundedSize(int width, int height, int maxEdge) {
    const int longest = std::max(width, height);
    if (maxEdge <= 0 || longest <= maxEdge) return {width, height};
    return {
        std::max(1, static_cast<int>(int64_t(width) * maxEdge / longest)),
        std::max(1, static_cast<int>(int64_t(height) * maxEdge / longest)),
    };
}

// Read the processed bitmap directly into the bounded float output. Area weights
// include EVERY source pixel (including cropped/odd edges), avoiding nearest-step
// aliasing without an additional full-size float image or scanline cache.
template<class Sample>
bool reduce(const Sample* source, int stridePixels, int cropX, int cropY,
            int width, int height, Size output, float scale, float* target,
            const std::atomic<bool>* cancel = nullptr) {
    const bool copy = width == output.width && height == output.height;
    const double sx = double(width) / output.width;
    const double sy = double(height) / output.height;
    for (int y = 0; y < output.height; ++y) {
        if (cancel && cancel->load(std::memory_order_relaxed)) return false;
        for (int x = 0; x < output.width; ++x) {
            const size_t dst = (size_t(y) * output.width + x) * 3;
            if (copy) {
                const size_t src = (size_t(cropY + y) * stridePixels + cropX + x) * 3;
                // Keep the full-resolution export conversion bit-for-bit unchanged.
                for (int c = 0; c < 3; ++c) target[dst+c] = float(source[src+c]) * scale;
                continue;
            }
            const double left = x*sx, right = (x+1)*sx;
            const double top = y*sy, bottom = (y+1)*sy;
            double sum[3] = {}, weight = 0;
            for (int iy = int(top); iy < std::min(height, int(std::ceil(bottom))); ++iy) {
                const double wy = std::min(bottom, double(iy+1)) - std::max(top, double(iy));
                const size_t row = (size_t(cropY+iy) * stridePixels + cropX) * 3;
                for (int ix = int(left); ix < std::min(width, int(std::ceil(right))); ++ix) {
                    const double w = wy * (std::min(right, double(ix+1)) - std::max(left, double(ix)));
                    const size_t src = row + size_t(ix)*3;
                    for (int c = 0; c < 3; ++c) sum[c] += double(source[src+c]) * w;
                    weight += w;
                }
            }
            for (int c = 0; c < 3; ++c) target[dst+c] = float(sum[c] / weight) * scale;
        }
    }
    return true;
}
} // namespace spectrafilm::preview
