# Qualification status: desktop.1

This is an experimental original-desktop runtime, not a completed native Android
port or a certification of every desktop feature on Android.

## Executed checks

- Original official ARM64 darktable 5.6.2 `--version` executed under Linux
  PRoot+QEMU. OpenMP, OpenCL, Lua, G'MIC, camera/map integration and the official
  listed codecs are compiled in. This does not establish hardware availability.
- All **1705 original regular files and 34 symbolic links** are unchanged after
  packaging and extraction. All six original desktop views and 167 module shared
  objects are retained. No pixelpipe or GTK control was reimplemented.
- **546 original ELF files** checked for named dependencies; none remain missing.
  Actual ARM64 loader checks passed for LUT 3D, gamepad and print dependencies.
  Earlier missing GLX/DRM/USB dependencies were installed before final packaging.
- Real JPEG and Nikon NEF CPU exports passed under PRoot+QEMU. The NEF was
  exported again with final dependencies and independently decoded as PNG.
  These were fixture tests, not a camera-format compatibility suite.
- The exact Java USTAR extractor used by Android successfully extracted the
  entire final **1,089,905,239-byte** runtime on Linux. Integrity and original-file
  identities were checked. All **7 launcher unit tests** passed in Debug and
  Release. These test extraction, cancellation, path boundaries, cookie matching
  and executable arguments, not every original desktop module.
- Gradle APK assembly passed. Android lint: **0 errors, 2 warnings** (required
  local JavaScript client; conservative free-space check). APK v2 signature,
  16-KiB ZIP alignment, CRC and embedded payload SHA-256 checks passed.
- Actual APK contract validation catches AAPT's automatic `.gz` unpacking. The
  verified GZIP payload now uses `.payload` and is stored byte-for-byte unchanged.
  `tools/verify-apk.py` verifies the real APK, not just the staging directory.
- Original GTK was displayed on Linux with the official x86-64 desktop build.
  ARM64 PRoot/QEMU displayed its real splash and continued GUI initialization;
  full ARM64 editor interaction remains unqualified in this environment.

## Unverified and incomplete platform integration

No Android device/emulator execution was possible. Installation, PRoot/SELinux
compatibility on specific phones, Android IME, rotation, foreground lifetime,
thermal behavior and a complete phone import/edit/export scenario are unverified.

GPU/OpenCL, direct USB cameras, CUPS printers, MIDI/gamepads, display ICC profiles,
external editors and desktop services need compatible drivers or Android bridges.
Their original UI/code is included; functioning Android integration is not claimed.
The GTK Broadway canvas also does not provide Android-native accessibility for
every desktop widget. Touch discoverability and all keyboard shortcuts were not
user tested.

The package intentionally uses target API 28 to execute its private Linux ELF
runtime. It is a sideload experiment with a development signing certificate.
It does not overwrite the existing mobile app or migrate its newer databases.
Stable 5.6.2 cannot be assumed compatible with development-5.8 version-7 masks.

Further device work is required before calling this a full, verified Android port.
