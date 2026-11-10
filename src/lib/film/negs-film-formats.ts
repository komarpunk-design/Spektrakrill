// GPLv3. noahhaasis/negs @26c903b, linux/src/fixtures.rs FILM_FORMATS.
// These are the source's film long-edge conventions (35 stays 35).
export const NEGS_FILM_FORMATS = [
  { mm: 17, label: "110" },
  { mm: 24, label: "Полукадр" },
  { mm: 35, label: "35 мм · 135" },
  { mm: 56, label: "6×4,5 / 6×6" },
  { mm: 70, label: "6×7" },
  { mm: 84, label: "6×9" },
  { mm: 120, label: "4×5" },
] as const;
