#include "spektra_raw.h"

#include <jni.h>

#include <cstdint>
#include <cstring>

namespace {

jbyteArray pack(JNIEnv* env, const SpektraRawImage& img) {
  if (!img.rgb || img.width <= 0 || img.height <= 0) return nullptr;
  const size_t pixels = static_cast<size_t>(img.width) * static_cast<size_t>(img.height) * 3;
  const size_t nbytes = pixels * sizeof(uint16_t);
  jbyteArray arr = env->NewByteArray(static_cast<jsize>(8 + nbytes));
  if (!arr) return nullptr;
  uint8_t hdr[8];
  const uint32_t w = static_cast<uint32_t>(img.width);
  const uint32_t h = static_cast<uint32_t>(img.height);
  hdr[0] = static_cast<uint8_t>(w);
  hdr[1] = static_cast<uint8_t>(w >> 8);
  hdr[2] = static_cast<uint8_t>(w >> 16);
  hdr[3] = static_cast<uint8_t>(w >> 24);
  hdr[4] = static_cast<uint8_t>(h);
  hdr[5] = static_cast<uint8_t>(h >> 8);
  hdr[6] = static_cast<uint8_t>(h >> 16);
  hdr[7] = static_cast<uint8_t>(h >> 24);
  env->SetByteArrayRegion(arr, 0, 8, reinterpret_cast<const jbyte*>(hdr));
  env->SetByteArrayRegion(arr, 8, static_cast<jsize>(nbytes), reinterpret_cast<const jbyte*>(img.rgb));
  return arr;
}

} // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_app_spektrafilm_lab_SpektraRaw_decodeFile(
    JNIEnv* env,
    jclass,
    jstring path,
    jint maxEdge,
    jboolean cameraWb) {
  if (!path) return nullptr;
  const char* cpath = env->GetStringUTFChars(path, nullptr);
  SpektraRawImage img{};
  spektra_decode_file(cpath, maxEdge, cameraWb ? 1 : 0, &img);
  env->ReleaseStringUTFChars(path, cpath);
  jbyteArray out = nullptr;
  if (img.error == 0) out = pack(env, img);
  spektra_free(&img);
  return out;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_app_spektrafilm_lab_SpektraRaw_decodeBuffer(
    JNIEnv* env,
    jclass,
    jbyteArray data,
    jint maxEdge,
    jboolean cameraWb) {
  if (!data) return nullptr;
  const jsize len = env->GetArrayLength(data);
  jboolean isCopy = JNI_FALSE;
  jbyte* bytes = static_cast<jbyte*>(env->GetPrimitiveArrayCritical(data, &isCopy));
  if (!bytes) return nullptr;
  SpektraRawImage img{};
  spektra_decode_buffer(
      reinterpret_cast<const uint8_t*>(bytes),
      static_cast<size_t>(len),
      maxEdge,
      cameraWb ? 1 : 0,
      &img);
  env->ReleasePrimitiveArrayCritical(data, bytes, JNI_ABORT);
  jbyteArray out = nullptr;
  if (img.error == 0) out = pack(env, img);
  spektra_free(&img);
  return out;
}

extern "C" JNIEXPORT jintArray JNICALL
Java_app_spektrafilm_lab_SpektraRaw_decodeFileToPath(
    JNIEnv* env,
    jclass,
    jstring inPath,
    jstring outPath,
    jint maxEdge,
    jboolean cameraWb) {
  jintArray arr = env->NewIntArray(3);
  if (!arr) return nullptr;
  jint v[3] = {0, 0, -4};
  if (!inPath || !outPath) {
    env->SetIntArrayRegion(arr, 0, 3, v);
    return arr;
  }
  const char* cin = env->GetStringUTFChars(inPath, nullptr);
  const char* cout = env->GetStringUTFChars(outPath, nullptr);
  SpektraRawImage img{};
  spektra_decode_file_to_path(cin, cout, maxEdge, cameraWb ? 1 : 0, &img);
  env->ReleaseStringUTFChars(inPath, cin);
  env->ReleaseStringUTFChars(outPath, cout);
  v[0] = img.width;
  v[1] = img.height;
  v[2] = img.error;
  env->SetIntArrayRegion(arr, 0, 3, v);
  return arr;
}
