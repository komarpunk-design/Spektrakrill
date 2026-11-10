# Third-party notices

This project includes GPLv3 Spektrafilm Android code and data. See [LICENSE](LICENSE)
and the preserved [upstream notices](docs/upstream/SPEKTRAFILM_ANDROID_NOTICE.md).

**Spektrafilm for Android** by **Akshay Sharma** —
https://github.com/thetechgeekko/Spektrafilm-android

**Film modeling powered by spektrafilm** by **Andrea Volpato** —
https://github.com/andreavolpato/spektrafilm

The improvements in version 9.41 were reviewed against the fork:
https://github.com/hwx959/Spektrafilm-android
at revision `15fb120996f03fc1e58a9a9d819e335f65d7a092`.

- Stock metadata is adapted from `engine/spektra-core/src/main/assets/spektra/catalog.json`.
  Descriptions were translated/reworded in Russian. These are selection guidance,
  not additional measurements or new simulation profiles.
- Edited-group indicators adapt the category-change presentation used by the native editor.
  The implementation uses our existing parameter/reset registry.
- Pixel-for-pixel viewing adapts the coordinate contract in `app/.../Viewer.kt`
  to browser CSS pixels and display pixel density.
- Verified export publication adapts the write/close/reopen/SHA-256 contract in
  `app/.../VerifiedDocumentWriter.kt` for our MediaStore and legacy file routes.

No upstream Chinese localization resources, app identity, signing keys or prebuilt
binaries were imported. Native simulation kernels and profile measurements were
not replaced. Existing LibRaw and other third-party notices remain applicable.

## Original film-edge implementation (version 9.43)

`android/app/src/main/java/app/spektrafilm/lab/FilmEdge.kt` is adapted from
[FilmEdge.kt in hwx959's spektra-zh branch](https://github.com/hwx959/Spektrafilm-android/blob/80e420ece960c8d7b742ba7d7c15ee033d051b88/app/src/main/java/com/spectrafilm/app/FilmEdge.kt),
GPLv3. Package/imports/comments are adapted and the Compose sheet is excluded;
the native compositor drawing commands are preserved. `src/lib/film/photo-frame.ts`
ports that compositor to browser Canvas. Russian controls are our integration.

The fork identifies this compositor as its own GPLv3 implementation, with a palette
matched to SpektraLab-CN. No Chinese translation resources, prebuilt native libraries
or signing keys are used. Upstream Android and spectral-engine attributions above
remain required and are displayed by our About page.

## Experimental spectral / emulsion integration (version 9.48)

New model code, controls and converted assets are adapted from Andrea Volpato's
[Spektrafilm experimental branch, commit 28bf883e1672e884307edc75852549376e13644e](https://github.com/andreavolpato/spektrafilm/tree/28bf883e1672e884307edc75852549376e13644e).
Code is GPLv3; the reference profile data are CC BY-SA 4.0. Profile conversion
retains attribution/metadata and source hashes. Original license and citation
are in `docs/upstream/experimental/`. Spectral-basis source hashes are recorded
in `docs/upstream/experimental/spectral-assets.json`; basis algorithms retain
their reference names. Named illuminant spectra/CIE observer data derive from
the reference's colour-science library.

The port includes chemistry, spectral base tuning, camera filters, RMS sizing,
Langmuir DIR, spectral reconstruction, negative scan inversion and calibration
objectives. Android calibration uses its own bounded LM optimizer. Exact scope,
numerical checks and remaining differences are documented in
`docs/EXPERIMENTAL_PARITY.md`. No upstream Chinese localization or binaries are
included. Original upstream photo-frame attribution above remains applicable.

## Negs / Fotufilm integration (version 9.49)

Film data, stock defaults and Prep algorithms are adapted from
[Negs by Noah Haasis, commit 26c903be9064b4fbfd46a8396620ba7e1e9bc1df](https://github.com/noahhaasis/negs/tree/26c903be9064b4fbfd46a8396620ba7e1e9bc1df).
Negs code is GPLv3. Prep originated in yosoyelchris's `prep-raw-scopes` fork,
commit d2a144d, as credited by Negs; its guide-base and recovered control math
are ported to C++/TypeScript here. This is not a complete Resolve RAW pipeline.

The 29 Fotufilm film profiles were converted for Negs from MUAStudio Inc.'s
[Fotufilm engine, commit 96623ba0831a52dbddcda35727a206d4123a8b5f](https://github.com/DhaliwalX/fotufilm-engine/tree/96623ba0831a52dbddcda35727a206d4123a8b5f).
They and Negs' additional datasheet-derived BW film/paper data are CC BY-SA 4.0.
Original per-profile attribution, licence, datasource and approximate flags
are retained. Full upstream notices, change log, BW sources and input hashes
are in `docs/upstream/negs/`.

Our changes: namespaces, evaluation of existing fitted curves, development-time
selection, three-channel BW working representation with one physical dye OD,
BB3200 adaptation, dynamic four-layer grain support, browser RGB approximations,
Russian controls/descriptions and application-state integration. No new stock
measurements or fitted profiles were invented. Film/brand names remain their
owners' trademarks and imply no endorsement. Integration scope and validation
are recorded in `docs/NEGS_INTEGRATION.md`.
