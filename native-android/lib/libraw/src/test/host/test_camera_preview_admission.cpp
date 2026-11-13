/* Real-camera regression for a 24 MiPixel preview rejection. GPLv3.
 * Optional external fixture: raw.pixls.us #2783, Fujifilm X-T3 lossless RAF.
 */
#include "raw_decoder.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <fcntl.h>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <unistd.h>
#include <vector>

namespace {
constexpr uint64_t MiB = 1024ULL * 1024ULL;
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
    std::cout << "ok   " << message << '\n';
}
spectrafilm::DecodeResult readFd(const char* path, const spectrafilm::DecodeOptions& options) {
    const int fd = ::open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) throw std::runtime_error("cannot open camera RAW");
    auto result = spectrafilm::decodeFromFd(fd, options);
    ::close(fd);
    return result;
}
void checkImage(const spectrafilm::DecodeResult& result) {
    if (!result.ok) std::cerr << result.status << ": " << result.error << '\n';
    require(result.ok && result.status == spectrafilm::SFRAW_OK, "native RAW decode succeeds");
    require(result.descriptor.processedBitsPerSample == 16, "16-bit native processing retained");
    require(result.rgb.size() == uint64_t(result.width) * result.height * 3U, "complete float RGB image");
    const float* data = result.rgb.data();
    float low = data[0], high = data[0];
    for (size_t i = 0; i < result.rgb.size(); ++i) {
        if (!std::isfinite(data[i])) throw std::runtime_error("non-finite RAW output");
        low = std::min(low, data[i]); high = std::max(high, data[i]);
    }
    require(low < high, "finite, non-constant sensor image");
}
}
int main(int argc, char** argv) try {
    if (argc != 2) throw std::runtime_error("usage: sfraw_camera_preview_memory_test X-T3.RAF");
    std::ifstream input(argv[1], std::ios::binary | std::ios::ate);
    if (!input) throw std::runtime_error("cannot read camera RAW");
    const auto size = input.tellg();
    if (size <= 0 || size > 64LL * MiB) throw std::runtime_error("fixture exceeds encoded test bound");
    std::vector<uint8_t> bytes(static_cast<size_t>(size)); input.seekg(0);
    if (!input.read(reinterpret_cast<char*>(bytes.data()), size)) throw std::runtime_error("truncated RAW");
    spectrafilm::DecodeOptions options;
    options.halfSize = true; options.maxLongEdge = 2048;
    // 24 MiPixels * production's measured 28 B/pixel reproduces the exact old tier.
    options.admittedBytes = 24ULL * MiB * 28ULL;
    {
        const auto refused = readFd(argv[1], options);
        require(!refused.ok && refused.status == spectrafilm::SFRAW_ERR_NO_MEMORY &&
                refused.error.find("RAW geometry exceeds 24 MiPixel") != std::string::npos,
                "original 24 MiPixel rejection reproduced");
    }
    // The app retry must reserve these bytes first; this is not a global limit increase.
    options.admittedBytes = 768ULL * MiB;
    {
        const auto fd = readFd(argv[1], options); checkImage(fd);
        require(std::max(fd.width, fd.height) == 2048, "26MP RAW preview fills the requested 2048px edge without integer-step undersizing");
        const auto buffer = spectrafilm::decodeFromBuffer(bytes.data(), bytes.size(), options);
        checkImage(buffer);
        require(fd.width == buffer.width && fd.height == buffer.height &&
                fd.rgb.size() == buffer.rgb.size() &&
                std::memcmp(fd.rgb.data(), buffer.rgb.data(), fd.rgb.size() * sizeof(float)) == 0,
                "fd and buffer produce byte-identical native proxies");
    }
    options.halfSize = false; options.maxLongEdge = 0;
    const auto full = readFd(argv[1], options); checkImage(full);
    require(uint64_t(full.width) * full.height > 24ULL * MiB,
            "full-resolution RAW exceeds old 24 MiPixel cap without preview substitution");
    std::cout << "full RAW: " << full.width << 'x' << full.height << '\n';
    return 0;
} catch (const std::exception& failure) {
    std::cerr << "FAIL: " << failure.what() << '\n'; return 1;
}
