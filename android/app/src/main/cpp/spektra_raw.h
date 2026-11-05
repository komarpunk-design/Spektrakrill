#pragma once

#include <cstddef>
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SpektraRawImage {
  int width;
  int height;
  int error;
  char message[256];
  uint16_t* rgb; // interleaved RGB, 16-bit linear, malloc'd
} SpektraRawImage;

int spektra_decode_file(const char* path, int max_edge, int camera_wb, SpektraRawImage* out);
int spektra_decode_buffer(
    const uint8_t* data,
    size_t len,
    int max_edge,
    int camera_wb,
    SpektraRawImage* out);
/* Decode then write packed RGB16 to out_path. rgb is freed; width/height stay set. */
int spektra_decode_file_to_path(
    const char* path,
    const char* out_path,
    int max_edge,
    int camera_wb,
    SpektraRawImage* out);
void spektra_free(SpektraRawImage* img);

#ifdef __cplusplus
}
#endif
