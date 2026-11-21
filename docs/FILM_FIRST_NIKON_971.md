# Film-first defaults and Nikon Scan model · 9.71

New edits open the film catalogue. Choosing a different stock automatically
loads its profile settings and Arctic 2026 beta04. Existing edits and full
presets restore their own settings after fresh defaults; they are not migrated.
Tapping the already-selected stock does not reset manual adjustments. The
catalogue also offers «Вернуть профильные значения» for an explicit reset.

## Default processing

- Grain and DIR values come from the existing unified stock catalogue, including
  RMS and Langmuir where supplied. Native stock-character overrides are reset
  before a new stock's data is applied. No new measured data is invented.
- Layered Transport is selected for halation, retaining the engine's existing
  material construction lookup and its documented fallbacks/inferred records.
- Arctic is used for spectral reconstruction. Its upstream beta status is not
  changed by making it a default. Date stamps, camera diffusion, print masks,
  arbitrary push/pull and other creative effects are not enabled automatically.
- Color negatives initially use the experimental factory-reference Noritsu
  profile from 9.69 with all recovered stages enabled. A manually selected
  paperless receiver, including Nikon, is retained on a later stock change.
- Monochrome uses Digital Reference and disables interlayer DIR. Slides use the
  original direct spectral route. Color-negative profile stages are inactive
  in both cases. Model exclusivity and paper bypass remain unchanged.
- Camera exposure, crop and other global creative edits are not reset by choosing
  a stock. The explicit profile reset restores stock-character values.

More complex/newer does not establish higher physical accuracy. Some catalogue
values, construction records and transferred models are inferred/experimental;
these defaults are a coherent configuration, not proof of a calibrated camera,
film lab or physical scanner.

## Nikon source and exact scope

Source: https://github.com/rohanpandula/nikon-coolscan4-software-archaeology
Pinned commit: fa09658c0db01c5de63d1c4481c9fe0b6c0d2589, MIT (Rohan Pandula).
Unchanged source, model JSON, provenance, quality manifest, license and SHA-256
records are in `docs/upstream/nikon`.

The integration ports Nikonlook-v2 Layer B (3×3 DirectPF matrix and three
257-knot monotone curves) and the default Layer A blind estimator (48 logarithmic
raw distribution features and ridge coefficients, original sampling/rail rules
and gain bounds). Turning auto exposure off uses the upstream reference gains.
The hardware-exposure inverse is not exposed: virtual film has no measured
Coolscan exposure ticks. The separately recovered vendor builder is not used.

Location: **Скан → Скан без бумаги → Режим сканирования →
Nikon Scan · модель v2 (эксперимент)**. Nikon is an alternative to Noritsu,
not an additional layer applied on top. Exposure, CMY, contrast, endpoints,
optical softness and sharpening use the existing scanner controls. Parameters
are stored in recipes, scan variants and presets using the normal receiver mode.

The virtual input is integrated negative transmittance through the existing
three-band receiver. It is **not** a measured spectral response of a Coolscan
5000. The source model's Adobe-RGB-family output is decoded with gamma
2.19921875 and converted via the engine's Adobe RGB/D50 transform to the chosen
output space, rather than being treated as sRGB. The sensor adapter, grading
and output conversion are Spektrafilm integration code, not original Nikon code.

The upstream manifest explicitly labels v2 **beta**: evaluated color errors do
not meet the source project's Nikon Scan parity gates; hardware anchoring is
experimental. This integration does not claim physical LS-5000 equivalence,
Digital ICE/IR reconstruction or a USB scanner driver. No OEM executable,
firmware or Nikon ICC profile is included.

## Reproduction and validation

`python3 native-android/tools/nikon/generate_data.py --check` verifies the
unmodified source hashes and compiled numeric data. The generated header is
reproducible from the published JSON, not handwritten replacement curves.

`nikon_scan_probe` compares 18 Layer-B results at 1e-9 against upstream
independent oracle literals; the small and large Layer-A gain tests use 2e-6
float32-input tolerance. Both rail-mask branches are exercised.
`scan_workstation_probe` checks real processing controls, reset and preview/
export equality (62 renders with Nikon added). `preview_export_probe` covers
224 equal-resolution combinations across film classes, routes, LUT flags and
CPU/GPU requests; CPU host GPU requests do not prove physical GPU behavior.
`film_first_probe` renders Arctic + RMS + Langmuir + Layered Transport with both
Nikon and Noritsu on five profile classes and checks finite output and tonal
range. Android tests verify profile defaults, compatible film types, preservation
of manual receiver/exposure, old recipe restoration, UI selection and preset
round-tripping. Physical Android testing is not available in this environment.
