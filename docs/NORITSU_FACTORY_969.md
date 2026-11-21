# Noritsu factory-reference profile — 9.69

The app includes an **experimental factory-calculated neutral-reference profile**.
Open **Скан → Скан без бумаги → Noritsu LS-600 → Профильные стадии Noritsu**,
then **Включить заводской профиль · эксперимент**. This enables the native job
color path, input normalization, Local Auto Contrast, Film Sharp and Hue/Saturation.
Each stage can be disabled independently. Reset disables profile stages without
losing the installed data. The pre-existing receiver stays available.

## What was recovered

Original LS600/EZ Controller 6.5 `SpecialPcb.dll` computes the RGB/YCC matrices,
YCC correction, fused output gamma, Film Sharp and Local Auto Contrast blocks.
The recovered original hue lattice supplies Hue/Saturation S0.
No OEM executable is shipped or run on Android. The app runs the existing open
reconstruction of those pixel operators with these functional parameter blocks.
The pinned upstream decoder/operator files remain unchanged.

Two integration faults prevented the previous research job from being useful:

* Film Sharp changed intermediate YCC, but the following factory YCC tone curve
  erased the visible difference. Virtual FilmLUT codes and the job's expected
  receiver domain did not agree. An opt-in virtual-input adapter fits 18% neutral
  gray and a local ±0.15 log-exposure slope against the native color path. It
  preserves film-curve/development changes. It rejects unusable/flat profiles.
  This adapter is Spektrafilm code, not a recovered Noritsu calibration.
* Original Auto Contrast additionally depends on `CALC_INPUT+0x28` and a source
  anchor context. Empty scene data produces degenerate curves. A declared
  **synthetic** neutral reference (nominal linear 3%, 18%, 90%) provides source
  codes `[48700,52584,62464]` to `SCN_ORD_OUT+0x53de`, with middle 52584 at
  `+0x53f8`. Auto control is 5. The original calculator now emits monotonic curves
  and an enabled block. Its effective source/destination geometry is 6391×4042.

The unaltered factory 7×7 kernel has total weight 258, beyond the old generic
256 bound. Validation accepts it only with strength ≤128 and a proved S1 luma
bound keeping every nonnegative integer float32 accumulation ≤2^24. Unsafe
full-range jobs are still rejected. The factory kernel is not rescaled.

## Reproducibility and provenance

Original `SpecialPcb.dll` SHA-256:
`0241ff71b6da05dbccd65221d1f93e037a45d2ca8c142b500cb14b66ff303936`.
Original CRT SHA-256:
`9382aaed2db19cd75a70e38964f06c63f19f63c9dfb5a33b0c2d445bb41b6e46`.
The source installation contains 808 CorrectServ parameter files; the prior
12 independently checked factory-bank hashes matched the public research data.

With your own local extracted installation and Python pefile/unicorn:

```sh
python native-android/tools/noritsu/factory_native.py \
  --source-root /path/to/extracted-installation \
  --reference-codes 48700 52584 62464 --output /tmp/reference.pcb
```

The directory must contain `engine/ImageDataProc` and `runtime-crt`. The harness
pins the DLL/CRT hashes, supplies file/memory/diagnostic services and executes
original numerical code, including CRT math. Unknown services fail closed.
The resulting full PCB SHA-256 is:
`bb4e029c1d6fb94470c5c26f1a8a60d70752a832ff84356f8db62dd91edfdf81`.
A clean rerun reproduced the entire block byte for byte. All six exported
numeric sections matched the packaged profile. `pack_job.py` decodes the block;
use `--origin factory-calculated --context 'synthetic neutral reference ...'`
with the original recovered hue lattice, explicit `--encoding srgb` and
`--output-bits 16`. No missing lattice is generated or guessed by this tool.
The shipped asset records source and lattice hashes and its declared context.

The compact preset key `ls600-g0t1-neutral-v1` resolves immutable native data.
It avoids carrying 170 KB through every slider/history update. Export profile
still exports the full JSON. Unknown IDs and ambiguous ID+embedded profiles are
rejected. Regenerate/check the native copy after any asset update:

```sh
python3 native-android/tools/noritsu/generate_factory_data.py --check
```

## Validation and limits

The new host probe checks all blocks, bounded-kernel rejection, neutral input,
unusable-profile rejection, Portra/Gold, low/high spatial tonal regions, all
three stage effects on final RGB, old-route bypass, film development, equal-size
preview/export and exact full-profile/compact-ID equivalence (38 renders).
Auto Contrast can correctly do nothing to a texture with constant local tone;
the stage check therefore includes large dark/light spatial regions.
Android JVM/Compose tests exercise activation without external files, switches,
reset, preset round trips and whole-dataset preset-amount transitions.

**Not a calibrated physical LS600 clone.** This fixed reference does not reproduce
EZ Controller's original per-frame scene judge, hardware CCD/LED spectral
measurement or a captured job for your specific negative. Scanner fidelity has
not been measured against hardware. Small-screen UI checks use Robolectric;
CPU host checks with a GPU request are not physical Android GPU tests.
