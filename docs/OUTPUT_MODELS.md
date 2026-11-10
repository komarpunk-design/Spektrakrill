# Outputs and Lab Scan (9.50)

Source: [Fotufilm, MUAStudio Inc.](https://github.com/DhaliwalX/fotufilm-engine/tree/b9049f3e8897a51ab8f917edb39f023cb340d2e2), pinned `b9049f3e8897a51ab8f917edb39f023cb340d2e2`. Code/receiver definitions Apache-2.0. Unmodified reference files, licence and upstream tests are retained in `docs/upstream/fotufilm-outputs/`. Existing film spectra retain their original licences and notices (Spektrafilm / Negs / Fotufilm, CC BY-SA 4.0 where applicable).

The last linked repository, Negs, mentions Lab Scan in `research/fotufilm/README.md` as a Fotufilm feature without a Negs equivalent. The executable implementation is from Fotufilm, not that research description.

## Shipped routes

- **Paper / print film**: existing Spektrafilm physical print route. Default for old sessions and recipes; unchanged pixel path.
- **Digital Reference**: fixed three-band receiver, inverted to positive through the soft scan curve; independent of frame content.
- **Auto Levels**: the same receiver with per-frame median/highlight timing.
- **Lab Scan**: receiver plus optional frame timing, and the ported `LabScanFinish` gradation, near-neutral shadow crossover and hue corrections. Operator controls: exposure, Cyan/Magenta/Yellow, finish strength.
- **Negative**: existing transmission scan, preserving negative colours/mask. Reversal materials bypass negative inversion and are viewed directly.

The receiver integrates **the developed CMY density planes**, the selected film's base and dye spectra through Fotufilm's 630/545/465 nm Gaussian LED bands (sigma 8.5/14/9.5 nm). It does not invert a rendered JPEG. The same fitted softplus receiver curve uses dMin 0, gamma 3, toe -1, shoulder .2, widths .3. Fixed mid-grey is calibrated to .18; individual channel slopes are calibrated against the chosen Spektrafilm profile at log exposure ±.15. This normalization is the adaptation layer. Frame timing uses a deterministic sample of up to approximately 16K density readings, a median and .995 highlight, bounded stretch [1, 1.5] and downward density placement. Flat scenes do not divide by zero. Native operation uses the already prepared film profile, retaining its chemistry/base changes.

`LabScanFinish` is ported to TypeScript and C++ with upstream coefficients, Oklab hue windows, dark-neutral cyan/blue crossover and luminance gradation. Colour conversion wraps upstream linear Display P3 with linear sRGB; native delivery then uses the existing engine's output-space matrices and transfer functions. Lens blur and unsharp remain after the receiver; frames remain after rendering. Models are saved in recipes, queues, Undo and persistent sessions as `params.output`.

## Limits of this adaptation

This is **not a full Fotufilm engine port or a numerical match to its Lab Scan**. Fotufilm's reference-Portra cast characterization, per-record two-anchor timing, scene-region dodging and fourth-layer engine are not imported. Timing and receiver normalization are explicitly adapted to Spektrafilm's calibrated density model. Digital Reference uses this receiver, not Fotufilm's complete RA-4-shaped configurable receiver or its Graded Print style. Telecine, Cineon Log, HDR, TIFF/16-bit delivery and additional physical print stocks are not part of this change. JPEG/PNG delivery remains as supported by the app; do not claim a 16-bit scan master. Separate imported-negative workflows keep their own inversion/printing route.

The native receiver calibrates at raw log exposure 0, matching spectral autoexposure's raw grey=1. The browser adapter calibrates at log10(.184), matching the existing RGB film exposure's grey value. Browser film exposure remains the app's approximate RGB film model; the native Android exposure stage is spectral. Browser bundled receiver spectra are copied exactly from the existing Android assets by `scripts/sync-output-spectra.py`; custom profiles without spectra use their existing three-channel density matrix. Legacy base tuning in the browser is approximate; native uses the prepared full base spectrum. The experimental output receiver does not apply the legacy paper/scanner black-white XYZ correction or output gamut compression: it has its own tone curve and clips at delivery. Its scan page exposes supported blur/unsharp controls and directs density/colour corrections to Outputs.

## Verification

- `npm run test:outputs`: old defaults, hostile/nonfinite controls, recipe roundtrip, upstream-inspired finish invariants, zero-strength exact bypass, neutral monotonicity, shadow hue, monochrome and tool-reset isolation.
- `node --experimental-strip-types scripts/test-output-parity.mjs`: 100 C++/TypeScript finish colours, max tolerance 1e-10. This checks the two ports, not full engine parity with Swift.
- `output_probe <native-assets>`: 35 actual native output renders covering legacy identity, three receivers, operator effect, repeated cache, BW, slide bypass and five colour spaces.
- `node scripts/test-workflow-ui.mjs`: browser image/render effect, routes, help, responsive geometry, compact catalogue, reset/Undo/persistence.
