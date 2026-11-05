/*
 * Guards the diffusion FFT against circular wrap-around.
 *
 * A tall frame with a unique top marker (1) and bottom marker (0), convolved
 * with a large odd kernel, must NOT copy the bottom onto the top. That is the
 * artifact in the 26 MP Black Pro-Mist export (ks ≈ height).
 *
 * Build from cpp root:
 *   g++ -std=c++17 -O2 -pthread -I. \
 *     tests/test_fft_wrap.cpp kernels/fft_convolve.cpp kernels/fft.cpp \
 *     kernels/parallel.cpp -o /tmp/test_fft_wrap && /tmp/test_fft_wrap
 */
#include <cmath>
#include <cstdio>
#include <vector>

#include "kernels/fft_convolve.h"

namespace {

int reflect(int p, int n) {
    if (n <= 1) return 0;
    int period = 2 * (n - 1);
    int m = p % period;
    if (m < 0) m += period;
    return m < n ? m : period - m;
}

bool run_case(int w, int h, int radius) {
    const int ks = 2 * radius + 1;
    const int pw = w + ks - 1;
    const int ph = h + ks - 1;
    std::vector<double> src(static_cast<size_t>(w) * h, 0.0);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x)
            src[static_cast<size_t>(y) * w + x] = (y < h / 8) ? 1.0 : (y >= h - h / 8 ? 0.0 : 0.5);

    std::vector<double> padded(static_cast<size_t>(pw) * ph);
    for (int y = 0; y < ph; ++y) {
        int sy = reflect(y - radius, h);
        for (int x = 0; x < pw; ++x) {
            int sx = reflect(x - radius, w);
            padded[static_cast<size_t>(y) * pw + x] = src[static_cast<size_t>(sy) * w + sx];
        }
    }

    std::vector<double> kern(static_cast<size_t>(ks) * ks, 0.0);
    double sum = 0.0;
    const int cx = radius, cy = radius;
    for (int y = 0; y < ks; ++y)
        for (int x = 0; x < ks; ++x) {
            const double dx = x - cx, dy = y - cy;
            const double v = std::exp(-(dx * dx + dy * dy) / (2.0 * (radius / 3.0) * (radius / 3.0) + 1e-6));
            kern[static_cast<size_t>(y) * ks + x] = v;
            sum += v;
        }
    for (double& v : kern) v /= sum;

    std::vector<double> out(static_cast<size_t>(w) * h, 0.0);
    if (!spk::fft_convolve_same(padded.data(), pw, ph, kern.data(), ks, w, h,
                                out.data(), 1, 0, 8192)) {
        std::fprintf(stderr, "FAIL fft_convolve_same w=%d h=%d ks=%d\n", w, h, ks);
        return false;
    }

    double top = 0, bot = 0, mid = 0;
    int nt = 0, nb = 0, nm = 0;
    const int band = std::max(2, h / 16);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) {
            const double v = out[static_cast<size_t>(y) * w + x];
            if (y < band) {
                top += v;
                nt++;
            } else if (y >= h - band) {
                bot += v;
                nb++;
            } else if (y > h / 3 && y < 2 * h / 3) {
                mid += v;
                nm++;
            }
        }
    top /= nt;
    bot /= nb;
    mid /= nm;
    // Reflect pad + low-pass: top stays brighter than bottom. Wrap-around
    // would pull bottom (0) onto the top and collapse the gap.
    const double gap = top - bot;
    std::printf("w=%d h=%d ks=%d top=%.4f mid=%.4f bot=%.4f gap=%.4f\n", w, h, ks, top,
                mid, bot, gap);
    if (!(top > 0.55 && bot < 0.45 && gap > 0.20)) {
        std::fprintf(stderr, "FAIL wrap-around suspected (top collapsed toward bottom)\n");
        return false;
    }
    return true;
}

}  // namespace

int main() {
    int fails = 0;
    // Small, then a kernel almost as tall as the frame (the 26 MP Pro-Mist case).
    if (!run_case(64, 48, 5)) fails++;
    if (!run_case(96, 80, 21)) fails++;
    if (!run_case(128, 96, 47)) fails++;
    if (fails) {
        std::fprintf(stderr, "test_fft_wrap: %d failed\n", fails);
        return 1;
    }
    std::printf("test_fft_wrap: PASS\n");
    return 0;
}
