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
