import type { DarkroomParams } from "./types";

export type ChangeGroup = "film" | "camera" | "print" | "scan" | "lab";

export type ParamChange = {
  key: string;
  group: ChangeGroup;
  label: string;
  from: string;
  to: string;
};

const SKIP = new Set<keyof DarkroomParams>([
  "exportFormat",
  "exportQuality",
  "exportMaxEdge",
  "exportColorSpace",
  "outputCctf",
  "gpuPreview",
  "gpuExport",
  "useEnlargerLut",
  "useScannerLut",
  "lutResolution",
  "useFastStats",
  "autoPreview",
  "previewMaxSize",
  "gray18Canvas",
  "whitePadding",
  "cropAspect",
  "applyCctfDecoding",
  "upscaleFactor",
  "printIlluminant",
  "printYFilterNeutral",
  "printMFilterNeutral",
  "printCFilterNeutral",
  "toneCurveActive",
  "toneCurveMaster",
  "toneCurveRed",
  "toneCurveGreen",
  "toneCurveBlue",
  "orientation",
]);

const LABELS: Partial<Record<keyof DarkroomParams, string>> = {
  filmStock: "Плёнка",
  printPaper: "Бумага",
  filmGamma: "Гамма плёнки",
  grainActive: "Зерно",
  grainParticleArea: "Площадь зерна",
  grainBlur: "Размытие зерна",
  grainScaleR: "Зерно R",
  grainScaleG: "Зерно G",
  grainScaleB: "Зерно B",
  grainDensityMin: "Dmin зерна",
  grainUniformity: "Равномерность зерна",
  grainDyeCloudsUm: "Облака красителя",
  grainSublayers: "Подслои зерна",
  grainSubLayersN: "Число подслоёв",
  halationActive: "Галяция",
  halationAmount: "Галяция, сила",
  scatterAmount: "Рассеяние",
  scatterSpatialScale: "Масштаб рассеяния",
  boostEv: "Подъём светов",
  protectEv: "Защита светов",
  boostRange: "Диапазон подъёма",
  couplersActive: "DIR-каплеры",
  couplersAmount: "Каплеры, сила",
  inhibitionInterlayer: "Межслойное торможение",
  inhibitionSamelayer: "Внутрислойное торможение",
  couplerDiffusionUm: "Диффузия каплеров",
  exposureCompensationEv: "Экспозиция камеры",
  autoExposure: "Автоэкспозиция",
  autoExposureMethod: "Замер",
  filmFormatMm: "Формат, мм",
  whiteBalance: "Баланс белого",
  temperature: "Температура",
  tint: "Оттенок",
  filterUvAmount: "UV-фильтр",
  filterIrAmount: "IR-фильтр",
  cameraLensBlurUm: "Размытие объектива",
  cameraDiffusion: "Диффузия камеры",
  printExposure: "Экспозиция печати",
  printExposureCompensation: "Автокомпенсация печати",
  printYFilterShift: "Y фильтр CC",
  printMFilterShift: "M фильтр CC",
  preflashExposure: "Предвспышка",
  preflashYShift: "Предвспышка Y",
  preflashMShift: "Предвспышка M",
  chemistryActive: "Морф кривых бумаги",
  printGamma: "Гамма печати",
  printGammaFast: "γ быстрая",
  printGammaSlow: "γ медленная",
  printGammaR: "γ R",
  printGammaG: "γ G",
  printGammaB: "γ B",
  developerExhaustion: "Истощение проявителя",
  printDiffusion: "Диффузия печати",
  glareActive: "Блик бумаги",
  glarePercent: "Блик, %",
  glareRoughness: "Шероховатость блика",
  glareBlur: "Размытие блика",
  scanFilm: "Сканировать как плёнку",
  scanUnsharpSigma: "Аншарп σ",
  scanUnsharpAmount: "Аншарп",
  scanWhiteCorrection: "Коррекция белого",
  scanBlackCorrection: "Коррекция чёрного",
  scanLensBlur: "Размытие сканера",
  scanWhiteLevel: "Белый уровень",
  scanBlackLevel: "Чёрный уровень",
  crop: "Кадрирование",
  rgbToRawMethod: "RGB → спектр",
  hanatosWindow: "Hanatos окно",
  hanatosSurface: "Hanatos поверхность",
  spectralBlur: "Спектральное размытие",
  inputGamutCompress: "Входной гамут",
  outputGamutCompress: "Выходной гамут",
  rawEngine: "Движок RAW",
  rawEngineStyle: "Стиль движка",
  toneBrightness: "Яркость",
  toneContrast: "Контраст",
  toneSaturation: "Насыщенность",
  toneHighlights: "Света",
  toneShadows: "Тени",
  toneWarmth: "Теплота",
};

const GROUP_OF: Partial<Record<keyof DarkroomParams, ChangeGroup>> = {
  filmStock: "film",
  filmGamma: "film",
  grainActive: "film",
  grainParticleArea: "film",
  grainBlur: "film",
  grainScaleR: "film",
  grainScaleG: "film",
  grainScaleB: "film",
  grainDensityMin: "film",
  grainUniformity: "film",
  grainDyeCloudsUm: "film",
  grainSublayers: "film",
  grainSubLayersN: "film",
  halationActive: "film",
  halationAmount: "film",
  scatterAmount: "film",
  scatterSpatialScale: "film",
  boostEv: "film",
  protectEv: "film",
  boostRange: "film",
  couplersActive: "film",
  couplersAmount: "film",
  inhibitionInterlayer: "film",
  inhibitionSamelayer: "film",
  couplerDiffusionUm: "film",
  exposureCompensationEv: "camera",
  autoExposure: "camera",
  autoExposureMethod: "camera",
  filmFormatMm: "camera",
  whiteBalance: "camera",
  temperature: "camera",
  tint: "camera",
  filterUvAmount: "camera",
  filterIrAmount: "camera",
  cameraLensBlurUm: "camera",
  cameraDiffusion: "camera",
  printPaper: "print",
  printExposure: "print",
  printExposureCompensation: "print",
  printYFilterShift: "print",
  printMFilterShift: "print",
  preflashExposure: "print",
  preflashYShift: "print",
  preflashMShift: "print",
  chemistryActive: "print",
  printGamma: "print",
  printGammaFast: "print",
  printGammaSlow: "print",
  printGammaR: "print",
  printGammaG: "print",
  printGammaB: "print",
  developerExhaustion: "print",
  printDiffusion: "print",
  glareActive: "print",
  glarePercent: "print",
  glareRoughness: "print",
  glareBlur: "print",
  scanFilm: "scan",
  scanUnsharpSigma: "scan",
  scanUnsharpAmount: "scan",
  scanWhiteCorrection: "scan",
  scanBlackCorrection: "scan",
  scanLensBlur: "scan",
  scanWhiteLevel: "scan",
  scanBlackLevel: "scan",
  crop: "scan",
  rgbToRawMethod: "lab",
  hanatosWindow: "lab",
  hanatosSurface: "lab",
  spectralBlur: "lab",
  inputGamutCompress: "lab",
  outputGamutCompress: "lab",
  rawEngine: "lab",
  rawEngineStyle: "lab",
  toneBrightness: "camera",
  toneContrast: "camera",
  toneSaturation: "camera",
  toneHighlights: "camera",
  toneShadows: "camera",
  toneWarmth: "camera",
};

const GROUP_ORDER: ChangeGroup[] = ["film", "camera", "print", "scan", "lab"];

export type NameMaps = {
  film?: Record<string, string>;
  paper?: Record<string, string>;
};

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-4;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return nearlyEqual(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => same(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 100) return String(Math.round(n));
  const s = n.toFixed(abs >= 10 ? 1 : 2);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function fmtBool(v: unknown): string {
  return v ? "вкл" : "выкл";
}

function fmtDiffusion(v: unknown): string {
  const d = v as { active?: boolean; family?: string; strength?: number } | null;
  if (!d || !d.active) return "выкл";
  const fam = String(d.family ?? "").replace(/_/g, " ");
  return `${fam || "фильтр"} · ${fmtNum(Number(d.strength ?? 0))}`;
}

export function formatParamValue(
  key: keyof DarkroomParams,
  value: unknown,
  names?: NameMaps,
): string {
  if (key === "filmStock") {
    const id = String(value ?? "");
    if (id === "none" || id === "off" || id === "bypass" || id === "linear" || !id) return "без плёнки";
    return names?.film?.[id] ?? id.replace(/_/g, " ");
  }
  if (key === "printPaper") {
    const id = String(value ?? "");
    if (id === "none" || id === "off" || id === "bypass" || !id) return "без бумаги";
    return names?.paper?.[id] ?? id.replace(/_/g, " ");
  }
  if (key === "cameraDiffusion" || key === "printDiffusion") return fmtDiffusion(value);
  if (key === "whiteBalance") {
    const s = String(value ?? "");
    if (s === "as_shot") return "как снято";
    if (s === "daylight") return "дневной";
    if (s === "tungsten") return "лампа";
    if (s === "custom") return "свой";
    return s;
  }
  if (key === "temperature") return `${fmtNum(Number(value))} K`;
  if (typeof value === "boolean") return fmtBool(value);
  if (typeof value === "number") return fmtNum(value);
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function diffParams(
  before: DarkroomParams,
  after: DarkroomParams,
  names?: NameMaps,
): ParamChange[] {
  const keys = Object.keys(after) as (keyof DarkroomParams)[];
  const out: ParamChange[] = [];
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    if (!LABELS[key] && key !== "filmStock" && key !== "printPaper") continue;
    if (same(before[key], after[key])) continue;
    out.push({
      key,
      group: GROUP_OF[key] ?? "lab",
      label: LABELS[key] ?? key,
      from: formatParamValue(key, before[key], names),
      to: formatParamValue(key, after[key], names),
    });
  }
  out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  return out;
}

export const GROUP_LABEL: Record<ChangeGroup, string> = {
  film: "Плёнка",
  camera: "Камера",
  print: "Печать",
  scan: "Скан",
  lab: "Лаб",
};
