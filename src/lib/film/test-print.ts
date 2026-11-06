import type { DarkroomParams } from "./types.ts";
import { isFilmBypass, isPaperBypass } from "./types.ts";
export type PrintTrial = { exposure: number; ev: number; limited: boolean };
export function printTrials(base: number, step: number): PrintTrial[] {
  if (!Number.isFinite(base) || base <= 0) throw new Error("Недопустимая выдержка печати");
  if (![0.25, 0.5, 1].includes(step)) throw new Error("Недопустимый шаг пробы");
  return [-2,-1,0,1,2].map(index => {
    const requested = base * 2 ** (index * step);
    const exposure = Math.max(0.2, Math.min(3, requested));
    return { exposure, ev: Math.log2(exposure/base), limited: Math.abs(exposure-requested)>1e-8 };
  });
}
export function printTrialParams(params: DarkroomParams, exposure: number): DarkroomParams {
  if (!Number.isFinite(exposure) || exposure < 0.2 || exposure > 3) throw new Error("Недопустимая выдержка печати");
  return { ...params, printExposure: exposure };
}
export function printTrialBlocker(params: DarkroomParams): string | null {
  if (!Number.isFinite(params.printExposure) || params.printExposure < 0.2 || params.printExposure > 3) return "Установите базовую выдержку печати от 0,2 до 3,0.";
  if (params.rawEngine !== "spektrafilm") return "Выберите движок Spektrafilm в настройках.";
  if (isFilmBypass(params.filmStock)) return "Сначала выберите плёнку.";
  if (isPaperBypass(params.printPaper) || params.scanFilm) return "Выберите фотобумагу во вкладке «Печать» и отключите скан плёнки.";
  return null;
}
export type PrintTrialImage = { url: string; width: number; height: number };
