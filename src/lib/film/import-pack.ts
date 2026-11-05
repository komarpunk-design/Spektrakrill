import { parsePresetJson, unwrapPresetText } from "./preset-json.ts";
import { isSpectralProfile, parseSpektraImport } from "./profile-json.ts";
import { useDarkroom } from "./store.ts";
import { isFilmBypass } from "./types.ts";
import { installUserProfile, USER_PROFILE_CAP } from "./user-profiles.ts";

export type ImportReport = {
  films: string[];
  papers: string[];
  looksAdded: number;
  looksUpdated: number;
  appliedLook: string | null;
  appliedFilm: string | null;
  appliedPaper: string | null;
};

export async function applySpektraImport(text: string, sourceName?: string): Promise<ImportReport> {
  const rawText = unwrapPresetText(text);
  if (!rawText) throw new Error("empty");
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new Error("json");
  }
  const parsed = parseSpektraImport(raw, sourceName);
  const report: ImportReport = {
    films: [],
    papers: [],
    looksAdded: 0,
    looksUpdated: 0,
    appliedLook: null,
    appliedFilm: null,
    appliedPaper: null,
  };

  let installed = 0;
  for (const profile of parsed.profiles) {
    try {
      const result = await installUserProfile(profile);
      installed += 1;
      if (result.support === "paper") {
        report.papers.push(result.name);
        if (!report.appliedPaper) report.appliedPaper = result.id;
      } else {
        report.films.push(result.name);
        if (!report.appliedFilm) report.appliedFilm = result.id;
      }
    } catch (err) {
      if (err instanceof Error && err.message === "full") {
        if (!installed) throw new Error("full");
        break;
      }
      throw err;
    }
    if (installed >= USER_PROFILE_CAP) break;
  }

  const looks = isSpectralProfile(raw) ? [] : parsePresetJson(parsed.looksRaw, sourceName);
  if (looks.length) {
    const result = useDarkroom.getState().importPresets(looks);
    report.looksAdded = result.added;
    report.looksUpdated = result.updated;
    report.appliedLook = result.applied?.name ?? null;
  } else {
    const patch: { filmStock?: string; printPaper?: string } = {};
    if (report.appliedFilm) patch.filmStock = report.appliedFilm;
    if (report.appliedPaper) patch.printPaper = report.appliedPaper;
    if (patch.filmStock || patch.printPaper) useDarkroom.getState().patch(patch);
    if (report.appliedPaper && !report.appliedFilm) {
      const s = useDarkroom.getState();
      if (s.params.rawEngine === "spektrafilm" && !isFilmBypass(s.params.filmStock)) {
        s.setTool("print");
      }
    }
  }

  if (!report.films.length && !report.papers.length && !looks.length) {
    throw new Error("unknown");
  }
  return report;
}

export function importNotice(report: ImportReport): string {
  const bits: string[] = [];
  if (report.films.length) bits.push(report.films.length === 1 ? report.films[0]! : `${report.films.length} плёнок`);
  if (report.papers.length) bits.push(report.papers.length === 1 ? report.papers[0]! : `${report.papers.length} бумаг`);
  if (report.looksAdded) bits.push(`пресетов +${report.looksAdded}`);
  if (report.looksUpdated) bits.push(`обновлено ${report.looksUpdated}`);
  return bits.length ? `Импорт: ${bits.join(" · ")}` : "Импорт";
}
