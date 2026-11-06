# Spektrafilm Android integration — version 9.41

Reviewed source: [hwx959/Spektrafilm-android](https://github.com/hwx959/Spektrafilm-android),
revision `15fb120996f03fc1e58a9a9d819e335f65d7a092`, GPLv3. This is a related native
Kotlin/Compose editor, not a drop-in replacement for our React/Capacitor shell.
Attribution is preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md),
the original notice and the app's About page.

## Integrated

| Upstream capability | Our integration |
| --- | --- |
| Film picker retains stock metadata | Russian descriptions for 28 stock/paper entries, lighting balance, ISO and categories. Search also uses descriptions. Custom profiles still work without upstream metadata. Existing measured profiles are unchanged. |
| Category chips indicate edited groups | Tool dots and accessible descriptions reflect parameter differences from neutral defaults. They use the same parameter registry as Reset so undo/reset removes the indication. |
| Pixel-for-pixel viewer | Actual 1:1 uses the displayed preview's pixel dimensions and browser display density. The percentage is pixel magnification rather than a multiplier relative to Fit. Large images are not capped below 1:1, and high-density screens can shrink below Fit to avoid upscaling. This does not synthesize a full-resolution RAW crop. |
| Verified document publication | All three native gallery-export paths write, flush, close, reopen and verify SHA-256 plus byte count. Android 10+ publishes a pending MediaStore row only after verification and attempts deletion after failure. Android 7–9 verifies a staging file before renaming; destinations are reserved so an existing photo is not overwritten. No full-image readback allocation is needed. |

The catalog data and publication/pixel-coordinate contracts are selectively
adapted. Upstream Compose UI, Chinese localization, application identity,
signing keys and prebuilt libraries were not copied.

## Evaluated, deferred

- TIFF16/32F, PNG16 and ICC/EXIF controls need new writer libraries and a matching
  output descriptor throughout our bridge and worker. Advertising them before
  that exists would give misleading export controls.
- Local masks, curves and source sidecars are coupled to the native app's session,
  grading and Compose models. They need their own design for our web/native paths.
- Replacing the native kernel, LibRaw adapter or Vulkan runtime changes ABI,
  precision, memory ownership and GPU validation contracts. Those require their
  full parity/device tests; the simulation engines were deliberately not swapped.
- The EXIF/GPS change needs a metadata privacy policy and permission flow. No new
  location permission was added and no claim of GPS preservation is made.

## Verification

- TypeScript and production web builds passed.
- Ten selected JS/TS test files passed, including ten new cases for zoom,
  edited-tool state and translated metadata.
- Seven `VerifiedStreamsTest` JVM tests passed with no skips: chunked round-trip,
  empty output, truncation, same-size corruption, extra bytes, zero-progress
  streams and preservation of an existing destination.
- Chromium verified 1 source pixel per physical screen pixel at display densities
  1, 2 and 3; film metadata, edited indicator/reset, Russian UI and phone/desktop
  layouts passed without JavaScript errors.
- Android release build and required Android Lint checks passed.

Physical-device MediaStore/provider failures have not been exercised here.
Deleting an incomplete row remains subject to the provider's cleanup response;
cleanup failures are retained as suppressed exceptions rather than hidden.
