import { isFilmBypass, type DarkroomParams } from "./types.ts";

/**
 * Cassette tap only switches the spectral stock.
 * Grain, gamma, paper, scan and the rest stay as the user left them —
 * factory Volpato looks live on the Пресеты tab, not on the shelf.
 */
export function stockParamsForFilm(filmId: string, current: DarkroomParams): DarkroomParams {
  const id = !filmId || isFilmBypass(filmId) ? "none" : filmId;
  if (current.filmStock === id) return current;
  return { ...current, filmStock: id };
}
