# Push / Pull laboratory

Version 9.46 adds a primary Push / Pull tool tab, independent of the experimental enlarger preference. Choose a film/developer family, calculate the previews, select a card, and explicitly apply it. Until Apply, editor parameters are untouched. Apply changes filmStock in one undo step. Optional recommended paper also changes printPaper and disables scanFilm; it is off by default.

Ten families expose 36 existing profiles: Portra 800 (normal, Push 1, Push 2), T-Max 100 (D-76, T-Max, T-Max RS), Tri-X 400 TX (D-76, T-Max), Tri-X TXP/TXT (HC-110 B), and Technical Pan (HC-110 B, Technidol). See src/lib/film/development-processes.json for exact IDs and original names.

Portra labels use the upstream profile names. For black-and-white series, the middle reference is a comparison baseline, not a calibrated normal-development recommendation. Pull/Push mean shorter/longer times relative to that reference. Times come from profile names. No conversion to push stops, physical ISO or chemistry instructions is inferred. Exposure, gamma, grain and printing settings are preserved.

The browser uses the existing reduced RGB profile representation. Android uses the corresponding bundled spectral profiles through a serialized native processTrials call, with at most six 384-pixel trials. Main preview/export bytes and dimensions are restored afterward. There is no synthetic brightness/gamma push adjustment. Unsupported emulsions do not receive invented curves; choosing another family explicitly replaces the film on Apply.

Source/settings/family changes cancel and invalidate previews. Closing the tool cancels work and releases object URLs. Export/Open are disabled during calculation. Cancellation and render failures do not apply changes.

Validation: TypeScript, profile availability/parameter isolation tests, browser checks for visible navigation, distinct renders, no mutation before Apply, one-step undo, stale invalidation, cancellation and phone layout; Android release build and APK signature/archive verification. Native behavior still needs testing on a physical device.
