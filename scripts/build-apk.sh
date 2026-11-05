#!/bin/bash
set -eu
cd /workspace
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-/tmp/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/26.1.10909125}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmake/3.22.1/bin:$PATH"

if [ ! -d "$ANDROID_HOME/platforms/android-34" ]; then
  echo "Android SDK 34 is missing at $ANDROID_HOME" >&2
  exit 1
fi
if [ ! -d "$ANDROID_NDK_HOME" ]; then
  echo "Android NDK is missing at $ANDROID_NDK_HOME" >&2
  exit 1
fi

npm run build:apk-web
npx cap sync android

# cap sync may rewrite settings.gradle — keep the GitHub engine modules
python3 - <<'PY'
from pathlib import Path
p = Path("android/settings.gradle")
text = p.read_text()
need = [
    "include ':engine:spektra-core'",
    "include ':lib:libraw'",
]
changed = False
for line in need:
    if line not in text:
        text += "\n" + line + "\n"
        changed = True
if changed:
    p.write_text(text)
    print("restored settings.gradle includes")
print(p.read_text())
PY

python3 - <<'PY'
import json
from pathlib import Path
p = Path("android/app/src/main/assets/capacitor.plugins.json")
try:
    data = json.loads(p.read_text() or "[]")
except Exception:
    data = []
if not isinstance(data, list):
    data = []
if not any(isinstance(d, dict) and d.get("classpath") == "app.spektrafilm.lab.RawDecoderPlugin" for d in data):
    data.append({"pkg": "spektra-raw", "classpath": "app.spektrafilm.lab.RawDecoderPlugin"})
p.write_text(json.dumps(data, indent=2) + "\n")
print("plugins", p.read_text())
PY

cat > android/local.properties <<EOF
sdk.dir=$ANDROID_HOME
ndk.dir=$ANDROID_NDK_HOME
cmake.dir=$ANDROID_HOME/cmake/3.22.1
EOF

cd android
chmod +x gradlew
./gradlew :app:assembleRelease --no-daemon --max-workers=1

mkdir -p /workspace/artifacts
cp app/build/outputs/apk/release/app-release.apk /workspace/artifacts/SpektrafilmLab.apk
cp app/build/outputs/apk/release/app-release.apk /workspace/artifacts/spektrafilm-lab.apk
cp app/build/outputs/apk/release/app-release.apk /workspace/public/spektrafilm-lab.apk
cp app/build/outputs/apk/release/app-release.apk /workspace/public/SpektrafilmLab.apk

README=/tmp/SpektrafilmLab-README.txt
cat > "$README" <<'EOF'
Spektrafilm Lab for Android
===========================

1. Unzip this archive.
2. Open SpektrafilmLab.apk on the phone.
3. Allow install from this source (Files / Chrome / Telegram).
4. In the app tap Open and pick a camera RAW:
   CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF.
5. The gear in the header opens app settings (labels, GPU, reset-on-open).
   Export tab sets JPEG/PNG, quality, and color space.
   The file is always written at the original frame size.
   Save uses GPU export (Vulkan) when the device self-check passes.
6. Save writes the processed file to Pictures/Spektrafilm.
   RAW is re-demosaiced at the export size.
7. Journal is in Settings → Журнал (or pin Lab + Journal in the dock).
   Copy it and send it if export is slow, fails, or the picture has artifacts.

The APK compiles Spektrafilm-android v0.10.0 (libspektra + libsfraw):
LibRaw demosaic to linear ProPhoto, then the spectral film pipeline.
Preview uses simulatePreview (GPU scan stage where the device self-check
passes, CPU fallback otherwise). Save runs full simulate with gpuExport
on — no film-look LUT. Turn GPU export off in Lab if needed.
Camera UV (410 nm) and IR (675 nm) stay on. Grain runs on negatives and slides.
Diffusion uses the v0.10 FFT convolution (Black Pro-Mist no longer hangs).

Film modeling powered by spektrafilm (GPLv3).

This is a Release sideload build (same -O3 engine flags as Spektrafilm-v0.8.0),
not from Play Store.
If Android refuses to update, uninstall the old Spektrafilm Lab first.
EOF

python3 - <<'PY'
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
apk = Path("/workspace/artifacts/SpektrafilmLab.apk")
readme = Path("/tmp/SpektrafilmLab-README.txt")
out = Path("/workspace/artifacts/SpektrafilmLab-android.zip")
with ZipFile(out, "w", ZIP_DEFLATED) as z:
    z.write(apk, "SpektrafilmLab.apk")
    z.write(readme, "README.txt")
Path("/workspace/public/spektrafilm-lab.zip").write_bytes(out.read_bytes())
print("zip", out.stat().st_size)
PY
ls -lh /workspace/artifacts/SpektrafilmLab.apk /workspace/artifacts/SpektrafilmLab-android.zip
