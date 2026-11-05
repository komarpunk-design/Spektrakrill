#include "spektra_raw.h"

#include "libraw/libraw.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

void set_err(SpektraRawImage* out, int code, const char* msg) {
  out->width = 0;
  out->height = 0;
  out->error = code;
  out->rgb = nullptr;
  std::snprintf(out->message, sizeof(out->message), "%s", msg ? msg : "raw");
}

void downsample_u16(
    const uint16_t* src,
    int sw,
    int sh,
    int colors,
    int dw,
    int dh,
    uint16_t* dst) {
  for (int y = 0; y < dh; y++) {
    const float fy = (y + 0.5f) * static_cast<float>(sh) / static_cast<float>(dh) - 0.5f;
    const int y0 = std::clamp(static_cast<int>(std::floor(fy)), 0, sh - 1);
    const int y1 = std::min(y0 + 1, sh - 1);
    const float ty = fy - static_cast<float>(y0);
    for (int x = 0; x < dw; x++) {
      const float fx = (x + 0.5f) * static_cast<float>(sw) / static_cast<float>(dw) - 0.5f;
      const int x0 = std::clamp(static_cast<int>(std::floor(fx)), 0, sw - 1);
      const int x1 = std::min(x0 + 1, sw - 1);
      const float tx = fx - static_cast<float>(x0);
      for (int c = 0; c < 3; c++) {
        const int cc = c < colors ? c : 0;
        const auto sample = [&](int xx, int yy) -> float {
          return src[(yy * sw + xx) * colors + cc];
        };
        const float v = (1 - tx) * (1 - ty) * sample(x0, y0) + tx * (1 - ty) * sample(x1, y0) +
            (1 - tx) * ty * sample(x0, y1) + tx * ty * sample(x1, y1);
        dst[(y * dw + x) * 3 + c] =
            static_cast<uint16_t>(std::clamp(v + 0.5f, 0.f, 65535.f));
      }
    }
  }
}

int run_libraw(LibRaw& raw, int max_edge, int camera_wb, SpektraRawImage* out) {
  // Match Spektrafilm / rawpy: linear 16-bit, no auto-bright, gamma 1,1.
  // output_color=1 (sRGB primaries) because baked film matrices are sRGB, not ACES.
  // user_qual=3 is LibRaw's default AHD demosaic (rawpy does not override it).
  raw.imgdata.params.output_bps = 16;
  raw.imgdata.params.output_color = 1;
  raw.imgdata.params.no_auto_bright = 1;
  raw.imgdata.params.gamm[0] = 1;
  raw.imgdata.params.gamm[1] = 1;
  raw.imgdata.params.use_camera_wb = camera_wb ? 1 : 0;
  raw.imgdata.params.use_auto_wb = 0;
  raw.imgdata.params.user_qual = 3;
  raw.imgdata.params.bright = 1;
  raw.imgdata.params.highlight = 0;

  const int iw = raw.imgdata.sizes.iwidth;
  const int ih = raw.imgdata.sizes.iheight;
  if (max_edge > 0 && std::max(iw, ih) > max_edge * 2) {
    raw.imgdata.params.half_size = 1;
  }

  int ret = raw.unpack();
  if (ret) {
    set_err(out, ret, raw.strerror(ret));
    return ret;
  }
  ret = raw.dcraw_process();
  if (ret) {
    set_err(out, ret, raw.strerror(ret));
    return ret;
  }

  libraw_processed_image_t* img = raw.dcraw_make_mem_image(&ret);
  if (!img || ret) {
    set_err(out, ret ? ret : -1, ret ? raw.strerror(ret) : "mem image");
    return ret ? ret : -1;
  }
  if (img->type != LIBRAW_IMAGE_BITMAP || img->bits != 16 || img->width < 8 || img->height < 8) {
    LibRaw::dcraw_clear_mem(img);
    set_err(out, -2, "unsupported bitmap");
    return -2;
  }

  const int sw = img->width;
  const int sh = img->height;
  int dw = sw;
  int dh = sh;
  if (max_edge > 0) {
    const int long_edge = std::max(sw, sh);
    if (long_edge > max_edge) {
      const float s = static_cast<float>(max_edge) / static_cast<float>(long_edge);
      dw = std::max(1, static_cast<int>(std::round(sw * s)));
      dh = std::max(1, static_cast<int>(std::round(sh * s)));
    }
  }

  auto* dst = static_cast<uint16_t*>(
      std::malloc(static_cast<size_t>(dw) * static_cast<size_t>(dh) * 3 * sizeof(uint16_t)));
  if (!dst) {
    LibRaw::dcraw_clear_mem(img);
    set_err(out, -3, "oom");
    return -3;
  }

  const auto* src = reinterpret_cast<const uint16_t*>(img->data);
  if (dw == sw && dh == sh && img->colors == 3) {
    std::memcpy(dst, src, static_cast<size_t>(dw) * static_cast<size_t>(dh) * 3 * sizeof(uint16_t));
  } else {
    downsample_u16(src, sw, sh, img->colors, dw, dh, dst);
  }
  LibRaw::dcraw_clear_mem(img);

  out->width = dw;
  out->height = dh;
  out->error = 0;
  out->rgb = dst;
  out->message[0] = 0;
  return 0;
}

int write_rgb16(const SpektraRawImage& img, const char* out_path) {
  if (!out_path || !out_path[0] || !img.rgb || img.width <= 0 || img.height <= 0) return -5;
  FILE* f = std::fopen(out_path, "wb");
  if (!f) return -5;
  const size_t nbytes =
      static_cast<size_t>(img.width) * static_cast<size_t>(img.height) * 3 * sizeof(uint16_t);
  const size_t n = std::fwrite(img.rgb, 1, nbytes, f);
  std::fclose(f);
  return n == nbytes ? 0 : -5;
}

} // namespace

int spektra_decode_file(const char* path, int max_edge, int camera_wb, SpektraRawImage* out) {
  std::memset(out, 0, sizeof(*out));
  if (!path || !path[0]) {
    set_err(out, -4, "path");
    return -4;
  }
  LibRaw raw;
  const int ret = raw.open_file(path);
  if (ret) {
    set_err(out, ret, raw.strerror(ret));
    return ret;
  }
  return run_libraw(raw, max_edge, camera_wb, out);
}

int spektra_decode_buffer(
    const uint8_t* data,
    size_t len,
    int max_edge,
    int camera_wb,
    SpektraRawImage* out) {
  std::memset(out, 0, sizeof(*out));
  if (!data || len < 32) {
    set_err(out, -4, "buffer");
    return -4;
  }
  LibRaw raw;
  const int ret = raw.open_buffer(data, len);
  if (ret) {
    set_err(out, ret, raw.strerror(ret));
    return ret;
  }
  return run_libraw(raw, max_edge, camera_wb, out);
}

int spektra_decode_file_to_path(
    const char* path,
    const char* out_path,
    int max_edge,
    int camera_wb,
    SpektraRawImage* out) {
  const int ret = spektra_decode_file(path, max_edge, camera_wb, out);
  if (ret || out->error || !out->rgb) return ret ? ret : out->error;
  const int w = out->width;
  const int h = out->height;
  const int wr = write_rgb16(*out, out_path);
  spektra_free(out);
  out->width = w;
  out->height = h;
  if (wr) {
    set_err(out, wr, "write");
    return wr;
  }
  out->error = 0;
  out->message[0] = 0;
  return 0;
}

void spektra_free(SpektraRawImage* img) {
  if (!img) return;
  std::free(img->rgb);
  img->rgb = nullptr;
  img->width = 0;
  img->height = 0;
}
