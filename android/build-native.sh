#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_HOME:?Set ANDROID_HOME}"
ndk="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/28.2.13676358}"
tools="$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$tools/aarch64-linux-android26-clang"
export CC_aarch64_linux_android="$tools/aarch64-linux-android26-clang"
export CXX_aarch64_linux_android="$tools/aarch64-linux-android26-clang++"
export AR_aarch64_linux_android="$tools/llvm-ar"

export RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384"
mkdir -p android/app/src/main/jniLibs/arm64-v8a
for mode in fast reference; do
 extra=(); defs=(); name=negs
 if [[ "$mode" == reference ]]; then extra=(--features android-reference); defs=(-DNEGS_REFERENCE); name=negs_reference; fi
 cargo build --release --target aarch64-linux-android -p spektrafilm-native --lib -j3 "${extra[@]}"
 "$tools/aarch64-linux-android26-clang" -shared -fPIC -O2 -Wl,-Bsymbolic -Wl,-z,max-page-size=16384 "${defs[@]}" \
  android/bridge.c target/aarch64-linux-android/release/libnegs_android.a \
  -L"$ndk/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android" \
  -lc++_static -lc++abi -ldl -lm -llog -landroid -o "android/app/src/main/jniLibs/arm64-v8a/lib${name}.so"
 "$tools/llvm-strip" "android/app/src/main/jniLibs/arm64-v8a/lib${name}.so"
done
