# Spektrafilm experimental integration — 9.48 / build 118

Reference: [andreavolpato/spektrafilm, experimental](https://github.com/andreavolpato/spektrafilm/tree/28bf883e1672e884307edc75852549376e13644e), pinned to **28bf883e1672e884307edc75852549376e13644e**. This document records implementation coverage, rather than claiming that the Android application is an identical copy of the Python desktop application.

## Implemented

| Reference capability | Android implementation / controls |
| --- | --- |
| Experimental profile collection | 39 separate `exp_` profiles; source hashes in `upstream/experimental/manifest.json`. Existing profiles retained. 121 bundled profiles in total. |
| Development-time families | Measured Double-X times 4 / 5 / 6.5 / 9 / 12 minutes; print-film 2302 times 2 / 3.5 / 5 / 7 / 9 minutes; Tri-X reversal profile. No invented intermediate measurements. |
| Film chemistry | Coupled curve and sublayer morph: overall, fast, mid/slow, RGB coefficients, Gumbel developer exhaustion. Handles norm-CDF and sept-normal-CDF fitted models. Chemistry gamma is applied once. |
| Print chemistry | The same fitted-model preparation for paper/print film, retaining original curves for scanner black/white references. Existing print controls remain in the Print menu. |
| Film and paper base tuning | Spectral CMY mask/base scaling, film spectral tilt, reference Gaussian smoothing. |
| Camera colour filters | Hoya X0, X1, Y2, YA3, R1 spectral transmissions, applied before exposure. |
| Spectral reconstruction | Hanatos 2025, Mallett & Yuksel 2019, Otsu 2018, Jakob & Hanika 2019, Arctic 2026 beta04, Gauss lasers. Original basis arrays, CAT16 projection, correct neutral reconstruction normalization and tungsten reference. Full computation in APK. |
| Raw exposure metering | Experimental methods meter raw film exposure, before manual exposure adjustment. Legacy profiles retain previous defaults. |
| RMS grain model | 48 µm aperture granularity; particle sizing from actual sublayer variance peaks; density floors, layer sizes, uniformity, multiplicative density USM with channel-mass normalization. Explicit stock-preset button. |
| Nonlinear DIR | Langmuir donor saturation for negatives, receiver saturation for reversal; consistent inverse-curve precorrection, spatial exponential tail. Explicit stock-preset button. |
| Negative-scan conversion | Beer–Lambert inverse scan model with log-linear seed and eight damped Gauss–Newton steps. Negative → print, negative → scan, negative → scan without mask. Colour-negative profiles required. Exposure gain and editable device matrix act before inversion. |
| Scan capture illuminants | 119 reference-library spectra, including CIE daylight, fluorescent/LED, measured sources, T, K75P, TH-KG3 and TH-KG3-L. CAT02 output adaptation for each illuminant. |
| Negative conversion acceleration | Prepared monotone PCHIP 33³ table for preview, bounded one-entry immutable cache keyed by spectral model. Device matrix/exposure do not invalidate that table. Export uses direct inverse computation. |
| Detect film base | Bright-percentile sampling and reference mask/exposure fitting objective. Bounded native LM optimizer; default brightest 1%, adjustable percentile. |
| Blind scanner calibration | Reference dye-gamut residual, clear-base anchor and identity ridge, fitted to at most 1,500 pixels. Bounded native LM optimizer; explicit action with one-step Undo. This remains experimental and needs a sufficiently varied image, as in the reference. |
| Neutral print filters | Experimental database for experimental film/paper; legacy database retained for old combinations. |
| Output colour compression | Android's existing ACES RGC, OkLch, Jzazbz and CAM16-UCS paths exposed. |
| Presets and history | Experimental scalar settings persist and roundtrip; nested Python `film_render` / `print_render` chemistry, base, grain, DIR, convert, workflow and reconstruction import. Measured development-time selection maps to bundled profiles. |

The **Эмульсия** menu is a primary navigation item. UI text is Russian. Original upstream film-edge frames remain unchanged.

## Differences still requiring a separate port

- Input-xy compression still uses the existing native spectral-locus boundary and fixed knee. The experimental smooth inscribed hull, its detail parameter, and the newer gamut/lightness parameter schema are not ported. Output Jzazbz/CAM16 modes use the Android engine's existing implementations and fixed parameters; they are not claimed numerically identical to this newer Python branch.
- Arbitrary `BB<temperature>` capture spectra are not accepted yet; the 119 named spectra are supported.
- Source calibration uses SciPy LM without our bounds. Android bounds mask CMY to 0…4 and matrix elements to −4…4, uses finite differences and 30 iterations. Reference objectives are retained; exact coefficients need not match for the underdetermined blind fit. Calibration samples the linear preview rather than loading a second full-resolution image.
- Grain uses the existing native samplers and random generator, not NumPy's random realization. RMS sizing and finishing formulas are transferred; identical random pixels are not promised. Browser grain/spatial operations remain approximations.
- Browser rendering is the existing reduced RGB model. Chemistry/base/DIR/filter controls have a reduced preview; the six full spectral reconstructions, negative conversion and calibration are APK features. Unsupported negative conversion explicitly reports this in the browser.
- The Python desktop GUI, notebooks, profiling/plotting tools, profile creator, standalone LUT-generation CLI, desktop image codecs and desktop 16-bit TIFF/EXR export are not copied into the Android UI. Android retains its existing import/export and RAW-decoding paths.
- Arbitrary external single-channel/time-family profile import is not broadened by this change. Bundled BW families are converted by the pinned synchronization script to the native three-channel representation with one physical dye density (not three times the optical density).

## Validation

- TypeScript typecheck; 30 focused frontend/regression tests.
- 32 C++/Python comparisons for chemistry, base, Hoya filters, RMS sizing and pointwise/spatial Langmuir: maximum curve error 2.47e−7.
- 18 complete spectral-table comparisons (six bases × daylight/tungsten/BW profiles): maximum raw error 1.8e−7.
- 48 inverse-scan comparisons across two stocks, four illuminants, three input spaces and tuned/untuned mask: maximum density error 1.3e−7.
- Mask detection compared with the reference fit. Blind fit checked against the reference anchored/ridged objective on synthetic scanner distortion: 0.0333149 → 0.00000686245.
- 14 full native pipeline cases; deterministic memo checks; negative density recovery; three conversion routes; finite grain output; all 121 profiles load.
- Chromium desktop and 390×844 phone: effects change actual pixels, Undo, persistence, stock presets, measured development times, monochrome control visibility, native-only guards, no horizontal overflow.
- Signed arm64 release APK build. No physical-device image-quality/performance test was available in this workspace.

### Reproduce native comparisons

```sh
cmake -S tests/native -B /tmp/spektrafilm-native -G Ninja
cmake --build /tmp/spektrafilm-native -j3
/tmp/spektrafilm-native/experimental_probe --all-profiles android/engine/spektra-core/src/main/assets/spektra/profiles
/tmp/spektrafilm-native/experimental_probe --render android/engine/spektra-core/src/main/assets/spektra
python scripts/test-experimental-native.py --source /path/to/pinned-spektrafilm --probe /tmp/spektrafilm-native/experimental_probe
python scripts/test-experimental-spectral.py --source /path/to/pinned-spektrafilm --probe /tmp/spektrafilm-native/experimental_probe
python scripts/test-experimental-negative.py --source /path/to/pinned-spektrafilm --probe /tmp/spektrafilm-native/experimental_probe
```

Python oracle dependencies: numpy, scipy, colour-science, numba, opt_einsum, dotmap. Computational modules/functions from the pinned checkout are used; desktop GUI, RAW and Exiv2 imports are avoided. Shipping C++ is tested, not a separate reimplementation in the test harness.
