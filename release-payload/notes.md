Spektrafilm 9.44 (114), Android ARM64.

Only the original spektra-zh film edges remain: no frame, 135, 120, minimal white edge. Removed custom white/black/instant-photo renderers, duplicate 35mm option and custom-width slider. Old custom styles reset to no frame. Russian frame number/date controls and optional 135 DX stripe remain.

Android delegates exclusively to original FilmEdge.kt from hwx959/Spektrafilm-android, spektra-zh at 80e420ece960c8d7b742ba7d7c15ee033d051b88. Browser preview/export uses its Canvas port.

Build/Lint/signature, TypeScript, migration/geometry tests, downloaded PNG dimensions and DX toggle pixel checks passed. Actual APK labels were checked to exclude removed options. Physical-device rendering is not verified. Same signing key as 9.39–9.43. Source: feature/original-frames-only.

GPLv3. Film-edge source: https://github.com/hwx959/Spektrafilm-android/tree/spektra-zh
Spektrafilm for Android by Akshay Sharma: https://github.com/thetechgeekko/Spektrafilm-android
Film modeling powered by spektrafilm by Andrea Volpato: https://github.com/andreavolpato/spektrafilm
