# Negs integration — 9.49 / build 119

Source: [noahhaasis/negs](https://github.com/noahhaasis/negs/tree/26c903be9064b4fbfd46a8396620ba7e1e9bc1df), pinned to `26c903be9064b4fbfd46a8396620ba7e1e9bc1df` (0.14.0 tree). Original source and licences are retained in `docs/upstream/negs/`. This adds selected photographic tools and stock data to our existing Android engine; it does not substitute the Rust/WebGPU engine or clone the entire Negs desktop application.

## Added materials

31 source materials, represented by 41 profiles after development-time selection: 30 film models and one paper. The 29 Fotufilm stock ports include CineStill 800T/400D, Pro 160NS, Superia 200/Reala 100, Aerocolor IV 2460, Kodacolor 100, Phoenix 200, Lomo Color/Metropolis/Turquoise, Astia, Velvia 50, Kodachrome 25/200, Agfachrome 50/100/200, Eterna/Vivid/F-64D/Reala 500D, Aerochrome, Infrared Color and five BW materials. Negs' Tri-X D-76 preparation and Multigrade RC Deluxe Grade 2 are also included.

The source curves, spectral dye/sensitivity tables, base density, fitted model, adaptation window, grain and DIR presets are used. `negs_` IDs preserve all prior stock files and IDs. Native grain keeps all four components of the new BW models; none are merged into three. The three working BW dye channels each carry one third of the single original dye OD, so total spectral density is unchanged. Colour stocks with BB3200 reference use that Planck spectrum and corresponding CAT16 projection, not the measured T lamp.

Profiles are grouped as **Negs · Fotufilm**. Approximate and creative models are labelled in Russian. Estimated development times are distinguished from datasheet times. The manifest records the source SHA-256, stock ID, selected development time, approximation and estimation flags. Selecting a Negs film applies its own transferred grain and DIR defaults in one Undo step, preserving exposure, Prep, gamma, paper and framing. Switching a legacy film retains the existing slider-preservation behaviour.

## Added tools

- **Подготовка / Prep** is a primary menu: independent exposure (−3…+3 EV), highlights (−180…100), shadows, contrast, lift, gain, Color Boost, saturation and midtone detail. The recovered Rec.709 control math and self-guided luminance base come from Negs `core/prep.rs` / `prep/guided.rs`, originally integrated by yosoyelchris. The stage operates on signed linear input, after camera exposure and before spectral film exposure. ProPhoto↔Rec.709 uses Bradford adaptation. Neutral settings are an exact bypass; exposure alone avoids the colour/guided roundtrip. Prep is excluded from print-exposure compensation and look-LUT generation. It is applied to previews and exports, including the existing digital bypass. In the negative-scan conversion route it is bypassed to protect density recovery, as stated in the UI.
- **Favourites:** star the current film or paper; favourites appear first, persist separately from editing history and do not create Undo entries.
- **Search:** every word is matched across stock name, identifier and Russian category/description. Enter selects the first result; Escape clears the search.
- **Film format:** 110 (17 mm), half frame (24), 135 (35), 6×4.5 / 6×6 (56), 6×7 (70), 6×9 (84) and 4×5 (120), using the source's long-edge conventions. The manual slider remains available; old 35 mm edits retain their value.
- **Preset compatibility:** new stock IDs and measured development times from Negs resolve to our namespaced assets; Prep snake_case controls and explicit grain overrides import. Applying a film look keeps the photograph's existing Prep, matching Negs' separation of photo preparation from film looks.

## Validation

- All 162 native profiles load.
- 35 focused frontend/regression tests, including stock inventory/provenance, actual Prep pixel changes, neutral/exposure bit identity, signed HDR, guided edge preservation, stock-specific grain/DIR, old-session defaults and preset mapping.
- 16 original Negs Prep core goldens: maximum absolute error 5e−9.
- Seven independent guided-filter reference shapes, including 1-D, portrait, width subsampling and pixel-centred resizing; source equations and border replication preserved.
- 82 native/source profile cases (41 profiles × neutral/morphed), covering every fitted layer, source base/dye tables, BW OD conservation, chemistry and generalized RMS sizing: maximum density error 3.66e−7.
- 18 full spectral-table comparisons for the three BB3200 stocks × six reconstruction methods: maximum raw error 1.3e−7.
- 80 full film/print pipeline cases, deterministic memo checks, Prep effect, four-layer BW grain, new BW-paper pairing, legacy neutral identity and independent Prep exposure. Existing experimental chemistry/DIR/grain regression comparisons also run.
- Chromium desktop and phone: multiword search, real stock defaults, favourites without Undo, model-quality labels, development families, Prep pixel changes, Undo/reset, persistence and no horizontal overflow.
- Signed arm64 release APK. No physical-device performance or image-quality test was available.

## Differences / scope

The existing native random generator is retained: grain distribution and RMS sizing are transferred, not the exact Rust random pixels. Browser rendering remains reduced RGB; full 81-band spectral processing is in the APK. Prep's recovered controls use f32 as in the source; JavaScript follows the same equations with normal browser rounding.

This integration does not include Negs' automatic camera-preview brightness matching, native desktop sidecars, Apple RAW decoder, scopes UI, GPU memory/cache architecture, desktop codecs/16-bit TIFF pipeline or its separate border compositor. Existing upstream photo-frame compositors are preserved. It does not claim whole-application or GPU performance parity with Negs.

## Reproduce

Use the existing Android build script. For native checks:

```sh
cmake -S tests/native -B /tmp/spektrafilm-native -G Ninja
cmake --build /tmp/spektrafilm-native -j3
/tmp/spektrafilm-native/experimental_probe --all-profiles android/engine/spektra-core/src/main/assets/spektra/profiles
/tmp/spektrafilm-native/negs_probe --pipelines android/engine/spektra-core/src/main/assets/spektra
python scripts/test-negs-native.py --source /path/to/pinned-negs --probe /tmp/spektrafilm-native/negs_probe
python scripts/test-negs-profiles.py --source /path/to/pinned-negs --spectral-source /path/to/pinned-spektrafilm-experimental --probe /tmp/spektrafilm-native/experimental_probe
```

Profile sync: `scripts/sync-negs-profiles.py`, with the same two checkout arguments. Numerical Python dependencies are the existing oracle environment's numpy, scipy, colour-science, numba and opt_einsum. Browser checks: `APP_URL=http://127.0.0.1:8082/ node scripts/test-negs-ui.mjs` against a clean development server.
