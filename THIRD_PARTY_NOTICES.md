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
