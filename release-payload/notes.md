Native Android port of noahhaasis/negs 0.18.0, upstream 8154a6a. Standalone app.negs.android, Android 8+, ARM64.

Original Rust processing, rawler + LibRaw, Vulkan Fast/CPU fallback, separate Reference f64 CPU, film/paper catalog, exact parameters, preset JSON, crop and original borders, PNG/TIFF/JPEG + ICC/EXIF, 33³ LUT, real-negative tools, shared .negs library, per-photo edits and batch export. No WebView or network photo upload.

**Alpha 2 (corrected Android system linking):** not complete desktop feature parity. Contact sheet, RAW+JPEG pairing and the full darkroom-roll library UI remain unfinished. No physical Android/GPU test was available. Large RAW Reference processing needs substantial RAM. Development signing key.

Checks: 391 passing host checks, 2 Reference checks, 14 Android API 26/35 checks, lint 0 errors and release build. Four upstream ignored tests remain ignored.

Build and scope: android/README.md. Evidence and limits: android/VALIDATION.md.

APK size: 81298604 bytes.

SHA-256: `6c6db74e8b1c07190f4cf99ef64aa39a1a6a7d89176f199f1f69a5493989034b`

Source commit: `402aeab3a4f543e7eed1887b51b60792e14bb1c2`.
