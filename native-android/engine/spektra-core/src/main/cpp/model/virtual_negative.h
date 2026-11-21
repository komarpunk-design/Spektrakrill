/* Lossless, app-private post-development density storage. GPLv3. */
#pragma once
#include "profiles/json_min.h"
#include "kernels/float_buffer.h"
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <limits>
#include <mutex>
#include <string>
#include <unistd.h>

namespace spk {
// Version the namespace whenever film-density semantics or profile assets change.
// Scanner algorithms deliberately do not enter this key: all variants share the negative.
class VirtualNegative {
    std::string file_;
    int width_ = 0, height_ = 0;
    static constexpr uint64_t max_bytes = 512ULL * 1024 * 1024;
    struct Header {
        char magic[8];
        uint32_t width, height;
        uint64_t checksum;
    };
    static uint64_t checksum(const float* data, size_t count) {
        const auto* bytes = reinterpret_cast<const unsigned char*>(data);
        uint64_t hash = 1469598103934665603ULL;
        for(size_t i = 0; i < count * sizeof(float); ++i) { hash ^= bytes[i]; hash *= 1099511628211ULL; }
        return hash;
    }
public:
    VirtualNegative(const char* json, const std::string& directory, int width, int height,
                    float format_mm, bool grain, bool halation, bool eligible, uint64_t input_stamp = 0) : width_(width), height_(height) {
        if(!eligible || directory.empty() || !json || !*json || width <= 0 || height <= 0) return;
        if(uint64_t(width) * height * 3 * sizeof(float) > max_bytes) return;
        auto root = json::parse(json);
        if(!root->has("virtualNegative")) return;
        auto key = root->at("virtualNegative").as_string();
        if(key.size() != 64 || key.find_first_not_of("0123456789abcdef") != std::string::npos)
            throw std::invalid_argument("Invalid virtual negative identity");
        uint32_t format_bits; static_assert(sizeof(format_bits) == sizeof(format_mm));
        std::memcpy(&format_bits, &format_mm, sizeof(format_bits));
        file_ = directory + "/negatives/v968_" + key + "_" + std::to_string(width) + "x" +
            std::to_string(height) + "_" + std::to_string(format_bits) + (grain ? "g" : "n") +
            (halation ? "h" : "n") + "_" + std::to_string(input_stamp) + ".spkneg";
    }
    bool load(FloatBuffer& density) const {
        if(file_.empty()) return false;
        std::ifstream stream(file_, std::ios::binary | std::ios::ate);
        const size_t count = size_t(width_) * height_ * 3;
        if(!stream || stream.tellg() != std::streamoff(sizeof(Header) + count * sizeof(float))) return false;
        stream.seekg(0);
        Header header{}; stream.read(reinterpret_cast<char*>(&header), sizeof(header));
        if(!stream || std::memcmp(header.magic, "SPKNEG1", 8) || header.width != uint32_t(width_) || header.height != uint32_t(height_)) return false;
        density.resize(count);
        stream.read(reinterpret_cast<char*>(density.data()), count * sizeof(float));
        if(!stream || checksum(density.data(), count) != header.checksum) return false;
        for(size_t i = 0; i < count; ++i) if(!std::isfinite(density[i])) return false;
        return true;
    }
    // Storage failure must not turn a valid photo into a failed render. Source + recipe remain
    // authoritative and reconstruct this derived buffer after a missing/corrupt file.
    bool store(const FloatBuffer& density) const {
        if(file_.empty() || density.size() != size_t(width_) * height_ * 3) return false;
        static std::atomic<uint64_t> serial{0};
        const std::string temporary = file_ + "." + std::to_string(getpid()) + "." + std::to_string(++serial) + ".tmp";
        FILE* stream = std::fopen(temporary.c_str(), "wb");
        if(!stream) return false;
        Header header{}; std::memcpy(header.magic, "SPKNEG1", 8);
        header.width = width_; header.height = height_; header.checksum = checksum(density.data(), density.size());
        bool ok = std::fwrite(&header, 1, sizeof(header), stream) == sizeof(header) &&
            std::fwrite(density.data(), sizeof(float), density.size(), stream) == density.size();
        if(ok) ok = std::fflush(stream) == 0 && fsync(fileno(stream)) == 0;
        if(std::fclose(stream) != 0) ok = false;
        if(ok) ok = std::rename(temporary.c_str(), file_.c_str()) == 0;
        if(!ok) std::remove(temporary.c_str());
        return ok;
    }
};
} // namespace spk
