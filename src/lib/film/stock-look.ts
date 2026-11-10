import { experimentalGrainPreset, experimentalCouplersPreset } from "./experimental.ts";
import negsPresets from "./negs-presets.json" with { type: "json" };
import { isFilmBypass, type FilmProfile, type DarkroomParams } from "./types.ts";

/**
 * Legacy cassette tap only switches the spectral stock. Negs entries also
 * apply the transferred per-stock grain and DIR defaults, as one Undo step.
 * Grain, gamma, paper, scan and the rest stay as the user left them —
 * factory Volpato looks live on the Пресеты tab, not on the shelf.
 */
export function stockParamsForFilm(filmId: string, current: DarkroomParams): DarkroomParams {
  const id = !filmId || isFilmBypass(filmId) ? "none" : filmId;
  if (current.filmStock === id) return current;
  const source = (
    negsPresets as unknown as Record<
      string,
      { monochrome: boolean; type: "negative" | "positive"; sourceStock: string }
    >
  )[id];
  if (source) {
    const profile = { id, ...source, negs: true } as FilmProfile;
    let next = { ...current, filmStock: id, ...experimentalGrainPreset(profile, current) };
    next = { ...next, ...experimentalCouplersPreset(profile, next) };
    return next;
  }
  return { ...current, filmStock: id };
}
