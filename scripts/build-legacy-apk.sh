#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PROJECT_ROOT
cd "$PROJECT_ROOT"
: "${JAVA_HOME:?Set JAVA_HOME to a JDK 17 installation}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/26.1.10909125}"
CMAKE_DIR="${CMAKE_DIR:-$ANDROID_HOME/cmake/3.22.1}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
for required in "$ANDROID_HOME/platforms/android-34/android.jar" "$ANDROID_NDK_HOME/source.properties" "$CMAKE_DIR/bin/cmake"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing Android toolchain component: $required" >&2
    exit 1
  fi
done
npm run build:apk-web
npx --no-install cap sync android
python3 - <<'PY'
import json, os
from pathlib import Path
root = Path(os.environ['PROJECT_ROOT'])
settings = root / 'android/settings.gradle'
text = settings.read_text()
for line in ["include ':engine:spektra-core'", "include ':lib:libraw'"]:
    if line not in text:
        text += '\n' + line + '\n'
settings.write_text(text)
p = root / 'android/app/src/main/assets/capacitor.plugins.json'
plugins = json.loads(p.read_text())
if not any(x.get('classpath') == 'app.spektrafilm.lab.RawDecoderPlugin' for x in plugins):
    plugins.append({'pkg': 'spektra-raw', 'classpath': 'app.spektrafilm.lab.RawDecoderPlugin'})
p.write_text(json.dumps(plugins, indent=2) + '\n')
sdk = os.environ['ANDROID_HOME']
(root / 'android/local.properties').write_text('sdk.dir=' + sdk + '\n')
PY
cd android
if [[ -n "${GRADLE_BIN:-}" ]]; then
  "$GRADLE_BIN" :app:assembleRelease --no-daemon --max-workers="${GRADLE_WORKERS:-2}"
else
  bash ./gradlew :app:assembleRelease --no-daemon --max-workers="${GRADLE_WORKERS:-2}"
fi
mkdir -p "$PROJECT_ROOT/artifacts"
cp app/build/outputs/apk/release/app-release.apk "$PROJECT_ROOT/artifacts/SpektrafilmLab.apk"
echo "APK: $PROJECT_ROOT/artifacts/SpektrafilmLab.apk"
