# Nikon virtual-input color correction · 9.72

The 9.71 integration fed three-band virtual transmittance directly into a model
trained on Coolscan scanner-linear RGB. Its 48-feature per-channel gain estimator
was also trained on hardware captures. Neither virtual sensor channel scales
nor that learned estimator were calibrated for this input. Correct numerical
transcription of the source operators did not establish correct end-to-end color.

## Correction

The original Nikonlook-v2 matrix, curves and numeric bundle remain unchanged.
A Spektrafilm input adapter now solves the original matrix/curves for 18% linear
neutral output, using the original reference RGB gains. It also solves neutral
±0.15 log-exposure references. The virtual film receiver is aligned in log
transmittance to this neutral point and local slope using the selected film's
own curves and spectral base. References use nominal gamma 1 so active film
contrast/development adjustments are not used as a moving calibration target.
This is a virtual-domain adaptation, not a measured Coolscan sensor calibration.

The hardware-trained RGB gain estimator is no longer called by the virtual
receiver. Automatic exposure instead uses one bounded scalar log-exposure shift
from sampled virtual-film exposure medians. It never estimates three independent
per-frame gains. Manual EV/CMY, tone, optics and output-space conversion retain
the existing processing path. A fixed source gain vector is used in both modes.
The source estimator remains available to its independent numeric tests.

Existing Nikon recipes use the corrected adapter. Other receivers and the
film-first defaults remain unchanged. Nikon is still an experimental learned
model; calibration against a physical Coolscan is not established.

## Actual checks

`nikon_color_probe` tests three stocks (Portra 400, Gold 200, Experimental Portra):

- 15 neutral-density references over ±0.6 log exposure. Middle-gray linear RGB
  is within 0.001 of 0.18 in every channel; ramp channel spread is below 0.05.
- R/G/B directions remain correct with auto exposure on and off: colors are not
  simply desaturated to hide a cast (18 color checks).
- A real constant-gray input image goes through Arctic, exposure/development,
  Nikon and sRGB output on all three stocks; encoded channel spread stays below
  0.04. This check is separate from feeding calibrated density buffers.

Other existing checks cover the complete default chain (10 renders), scanner
controls and resets (62 renders), and equal-resolution preview/export (224
combinations). These checks do not replace visual evaluation of the user's
specific source image or physical Android testing. Small residual tonal color
biases remain possible in this beta learned model.
