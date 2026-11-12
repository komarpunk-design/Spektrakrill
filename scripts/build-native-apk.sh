#!/usr/bin/env bash
set -euo pipefail
process_project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${JAVA_HOME:?Set JAVA_HOME to a full JDK 21 installation}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK (37/36, NDK 28.2.13676358)}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
cd "$process_project_root/native-android"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
if [[ -n "${GRADLE_BIN:-}" ]];then
  "$GRADLE_BIN" :app:assembleRelease --no-daemon --max-workers="${GRADLE_WORKERS:-3}" "$@"
else
  bash ./gradlew :app:assembleRelease --no-daemon --max-workers="${GRADLE_WORKERS:-3}" "$@"
fi
mkdir -p "$process_project_root/artifacts"
process_apk_path=app/build/outputs/apk/release/app-release.apk
if [[ ! -f "$process_apk_path" ]];then process_apk_path=app/build/outputs/apk/release/app-release-unsigned.apk;fi
cp "$process_apk_path" "$process_project_root/artifacts/SpektrafilmLab.apk"
echo "APK: $process_project_root/artifacts/SpektrafilmLab.apk"
