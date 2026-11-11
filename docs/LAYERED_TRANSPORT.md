# Layered Transport · 9.51

Source: **Fotufilm / MUAStudio Inc.**, pinned [b9049f3e8897a51ab8f917edb39f023cb340d2e2](https://github.com/DhaliwalX/fotufilm-engine/tree/b9049f3e8897a51ab8f917edb39f023cb340d2e2). `LayeredTransport.swift`, `HalationModel.swift` and radial parts of `TransportKernelCompiler.swift`: Apache-2.0. The 45 inferred optical constructions retain **CC BY-SA 4.0**, attribution Fotufilm, https://fotufilm.com. Source, licences, optical documentation and original solver tests are retained under `docs/upstream/fotufilm-transport/`.

## What runs

C++ and TypeScript ports follow the original conditional-launch solver: Snell invariant, separately tracked Fresnel s/p power, oblique Beer attenuation, reflection/transmission branches and capture on repeated receiver-plane crossings. Paths with identical segment traversal counts merge before further propagation. Equal-probability angular strata (512), event/branch ceilings and residual tolerance 1e-7 follow upstream. Optical power is accounted for as returned capture, unreturned capture, absorption, escape and unresolved power; a convergence failure reports an error rather than silently substituting Legacy.

The returned radial distributions are sorted/normalized, coarsened by upstream's 512-node equal-mass quadrature and split into positive radial bands at power-of-two strides. Cell-integrated stencils use the original adaptive angular quadrature and bilinear tent. CPU rendering reduces each plane by 2×2 averages, convolves each band and reconstructs by pixel-centred bilinear interpolation with clamped boundaries. The construction's compact Gaussian core replaces the old emulsion-scatter operator. Returned light is added to direct capture before log exposure and film development; it is not a glow pasted onto the finished image. Paper, direct scan and Outputs consume the resulting developed densities normally.

`antiHalation` scales non-support absorption, `baseThickness` scales support geometry, `pressurePlate` adds the original incoherent plate/surface reflection sum behind an open back. Return calibration uses upstream `adjustedReturn`, interpolating between stock calibration and the lossless construction's physical launch/capture. `hazeUm` blurs returned light only. Existing halation strength and size adjust the new operator's return amount and spatial scale. Legacy remains the default for old and new recipes; with Legacy selected the old pixel path is unchanged.

For an absorber-free construction such as CineStill 800T the UI shows Anti-Halation disabled and explains why. An opaque rear backing similarly disables Pressure Plate. The disabled slider cannot be changed by mouse or keyboard. All four optical controls are labelled and described beside their values.

## Integration scope

This is a **three-record adapter to Spektrafilm**, not a full Fotufilm renderer. Each already integrated film-exposure record uses its construction sampled at **630 / 545 / 465 nm**, and transports its own irradiance plane. Fotufilm's original implementation instead decomposes wavelength-dependent scene exposure into several spectral/spatial basis components and can include a donor fourth record. That basis compiler, full 81-band transport coupling and fourth-record development are not imported here. Core optics, power accounting and radial stencil algorithms are ported; full image parity with Fotufilm is not claimed.

65 bundled profile IDs map to the matching transferred construction (mapping is explicit, not an approximate match at render time). Other stocks use the original named **illustrative generic stack**, with their existing return strengths and an illustrative 5 µm compact core (not a measured per-stock diffusion). Both inferred and generic constructions are labelled in the UI; neither is described as a measured optical construction of commercial film. `scripts/sync-layered-transport.py --source <pinned Fotufilm checkout>` regenerates the data/header without changing any existing film curve or replacing a profile.

Native transport runs on the CPU; Legacy GPU paths are retained. Prepared kernels are bounded and keyed by stock, optical controls, scale, pitch and fallback strengths. The original JSON parameter tree already participates in the film cache key. Browser negative caches explicitly include `params.transport`. Haze and amount can reuse optical preparation. Imported true-negative workflows keep their existing calibrated conversion, without this virtual-film transport pass.

## Checks

- `npm run test:transport`: upstream analytic mirror encircled energy, Fresnel/total reflection, black backing and matched boundary, real construction response, positive/constant stencils, sanitization and recipe roundtrip; reset ownership tests.
- `transport_probe <native assets>`: 36 optical power/kernel checks, 18 native film/print/direct renders, exact Legacy identity, optical parameter effect and stable repeated memoization.
- `node --experimental-strip-types scripts/test-transport-parity.mjs`: 12 native/browser optical solves and complete energy/radius summaries; maximum absolute difference 2.3e-16. This is solver parity between the two ports, not full rendered parity with Fotufilm.
- `node scripts/test-simple-editor-ui.mjs`: five primary buttons, one searchable tools list, light panels, no nested control accordions, actual image-pixel changes from model and base thickness, absorber-free control availability, saved settings and desktop/360/390/844 layouts.
