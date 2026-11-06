# Exposure and negative development (9.47)

The 9.46 process-comparison workspace, its hardcoded profile family catalogue, batch renderer, and native `processTrials` endpoint have been removed. There are no automatically substituted film stocks or falsely calibrated Push/Pull stops.

The new primary Push / Pull tab keeps the photo viewer and edits the active film's existing Spektrafilm parameters live:

- Camera exposure EV (`exposureCompensationEv`), shared with Camera. Negative EV underexposes; positive EV overexposes. The displayed relative EI is `2^-EV` times nominal ISO, NOT a measured sensitivity gain. Auto-metering, if enabled, precedes this offset.
- Negative characteristic-curve factor (`filmGamma` → `film_render.density_curve_gamma`). Values above 1 increase the curve slope (push-like development); values below 1 decrease it (pull-like development). The control was moved from the film shelf to this tab; neutral is 1. No automatic EV-to-gamma mapping is invented.
- Existing auto-metering and automatic printing compensation controls are exposed with their effects explained. Printing compensation may normalize mean brightness, so compare shadow detail/contrast or disable it. It does not apply when scanning the negative directly.

For a paired push workflow, underexpose and increase gamma. For pull, overexpose and decrease gamma. These are independent controls: intentional over/underdevelopment without a shooting exposure change also works. “Normal development” resets gamma only, keeping exposure. Toolbar Reset uses the tool parameter registry and undo; normal history, presets, persistence, export, browser preview and native Android all use the same existing fields. The graph shows the reduced profile's density response and a gamma=1 reference at identical exposure. Positive/reversal stocks and film bypass do not offer these negative-development controls.

## What the reference actually implements

Read online on 2026-11-06:

1. [Kodak: Push / Pull Film Processing](https://www.kodak.com/en/motion/page/push-pull-processing/). Overdevelopment and underdevelopment change characteristic response; pushing does not necessarily recover sensitivity lost through underexposure. Colour crossover and grain effects are stock/process dependent.
2. [Push processing](https://en.wikipedia.org/wiki/Push_processing): push combines underexposure with extended development; pull combines overexposure with reduced development.
3. [Spektrafilm reference](https://github.com/andreavolpato/spektrafilm), inspected at commit `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`:
   - [`param_manifest.py`](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm_gui/param_manifest.py): Film gamma factor changes negative density-curve contrast.
   - [`filming.py`](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/runtime/stages/filming.py): passes density_curve_gamma to development before couplers/grain and printing/scanning.
   - [`density_curves.py`](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/model/density_curves.py): interpolates density on `log_exposure / gamma` axes. Equivalently, the browser samples the original curve at `gamma * logH`.

The existing Android ParamsBuilder already maps camera EV and filmGamma to the native camera/FilmRenderingParams. C++ filming applies the same axis transform on CPU and GPU. This change exposes that real supported mechanism; it does not claim to add a full time/temperature/developer kinetics simulation. The stock grain model operates on developed density; no fabricated “grain multiplier per push stop” is added. Gamma is not calibrated in EV or minutes. Measured push/pull profiles can remain available as ordinary film stocks, but this tool does not substitute them.

## Validation

Tests cover EI sign, the reference interpolation transform, independent push/pull renders on the same stock, and invalid imported values. Browser checks cover discoverable navigation, live changes in both directions, unchanged film stock, undo, neutral gamma preserving exposure, persistence, digital/bypass/positive guards, printing controls and phone layout. Android release build, signature and archive checks verify the package. Physical Android behavior remains untested.
