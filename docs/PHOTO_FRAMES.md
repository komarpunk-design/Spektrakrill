# Photo frames — version 9.42

Open **Кадр → Оформление фотографии**. Choose no border, white mat, black mat,
instant-photo border, or a 35mm-style border with perforations and markings.
Width is 1–20% of the shorter image edge. Borders are added outside the photo,
after rotation/crop; they do not crop or cover the photo's pixels. Output dimensions
therefore grow. No border is the default for existing edits.

The UI previews the composed image. JPEG/PNG export and the browser stock queue
compose the border with the same Canvas geometry. The native export worker
composes it on the final Bitmap before encoding, records the new dimensions and
then uses the verified gallery publisher. Browser-processed photos saved through
the native bridge already contain their border and are not framed twice.

## Correction: original implementation found in spektra-zh

The statement in the 9.42 documentation that the referenced fork had no ready
photographic-edge implementation was wrong: only main was checked. The feature
is in **spektra-zh**, revision `80e420ece960c8d7b742ba7d7c15ee033d051b88`,
`app/src/main/java/com/spectrafilm/app/FilmEdge.kt`.

Version 9.43 copies that Kotlin compositor into the Android app, changing only
package/imports/comments and excluding the Compose-language UI. Its renderer
body was checked against the original after normalizing those adaptations.
The browser uses a Canvas port of its geometry, colours and drawing commands.

Original modes: **135**, **120**, **minimal white edge**. Settings include frame
number, optional date imprint and optional DX-style stripe (135 only). The stripe
is the original decorative pattern, not an encoded scanner-readable DX identifier.
135/120/minimal use the original fixed margin proportions. Older custom mat and
instant-photo styles remain available; the old 35mm selection now uses the original
135 renderer. Date printing is an intentional optional overlay inside the photo.

Validation adds five native-margin/settings contract cases. Browser export checks
confirmed all three original-mode PNG dimensions and the presence/absence of the
DX band in downloaded files. The Android build compiled the actual original Kotlin
renderer and passed Android Lint; physical-device export remains untested.

![Original 135 and DX](screenshots/original-edge-135.png)

![Original 120](screenshots/original-edge-120.png)

Pixel inspection tools (zebra/probe) are unavailable on the framed preview; return
to no frame to inspect the simulation's pixels. The histogram describes the
processed photo, excluding its decorative border.

Validation: six frame geometry/sanitization tests; TypeScript, production web
build, Android release build and Android Lint; Chromium checks for all four
styles, downloaded JPEG dimensions and edge pixels, a real PNG download and its dimensions, desktop and phone layout.
Physical-device frame composition has not been tested here. Browser/native text
rasterization may differ; image placement, widths and border colours follow the
same formulas.

![35mm frame](screenshots/photo-frame-film.png)

![Phone](screenshots/photo-frame-phone.png)
