## Spektrafilm 9.48 · experimental tools

ARM64 Android APK, Android 7.0+ (API 24). Updates the same application/signing identity as 9.47.

- New primary menu **Эмульсия**: layer chemistry, developer exhaustion, spectral masks/bases and Hoya filters.
- Six spectral reconstruction methods and 39 profiles from the pinned upstream experimental branch; measured development-time families.
- RMS grain, density sharpening, nonlinear Langmuir DIR and stock presets.
- Negative-scan conversion: print, scan, or scan without mask; 119 named capture spectra, device matrix, exposure, base detection and experimental scanner calibration.
- Experimental preset import, Undo and persistence. Original film-edge frames preserved. Russian interface.

Numerical comparison and integration tests passed; signed ARM64 APK built. No physical-device testing was available.

This release does **not** claim complete parity with the Python desktop application: the newer smooth input-gamut hull/expanded gamut settings and arbitrary BB-temperature spectra remain unported. Browser preview is a reduced RGB model. Full coverage and limits: [EXPERIMENTAL_PARITY.md](https://github.com/komarpunk-design/Spektrakrill/blob/feature/upstream-experimental-integration/docs/EXPERIMENTAL_PARITY.md).

Upstream: Andrea Volpato, Spektrafilm experimental 28bf883e1672e884307edc75852549376e13644e. GPLv3 code; profile data CC BY-SA 4.0.

APK size: 37103830 bytes.

SHA-256: `1c8f6ac67bd50dc3991c9e59cd6ee0e6ca278668cf4f8bbd8e29d8f303ee75a9`

Source commit: `59547fc832db579378d5901b53472b82c0c1b872`.
