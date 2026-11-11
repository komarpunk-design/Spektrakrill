import type { PrepParams } from "./negs-prep.ts";
import type { ExperimentalParams } from "./experimental.ts";
export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

export interface ProfileMeta {
  id: string;
  name: string;
  type: "negative" | "positive";
  support: "film" | "paper";
  stage: "filming" | "printing";
  use: "still" | "cine";
  antihalation: "strong" | "weak" | "no";
  targetPrint: string | null;
  iso: number | null;
  referenceIlluminant: string;
  user?: boolean;
  experimental?: boolean;
  negs?: boolean;
  approximate?: boolean;
  creative?: boolean;
  estimatedDevelopment?: boolean;
}

export interface FilmProfile extends ProfileMeta {
  scannerSpectra?:{wavelengths:number[];dyes:number[][];base:number[]};
  densityLayers?: Vec3[][];
  takingFilters?: Record<string,{matrix:Mat3;gain:Vec3}>;
  monochrome?: boolean;
  densityModel?: { model_type:string; centers:number[][]; amplitudes:number[][]; sigmas:number[][]; alphas?:number[][]|null };
  baseSpectrum?: (number|null)[];
  wavelengths?: number[];
  sourceStock?: string;
  viewingIlluminant: string;
  logExposure: { min: number; max: number; n: number };
  densityCurves: Vec3[];
  dmin: Vec3;
  dmax: Vec3;
  rgbToFilm: Mat3;
  dyeToRgb: Mat3;
  baseRgbOd: Vec3;
  densityCurvesModel: {
    modelType: string;
    centers: number[][];
    amplitudes: number[][];
    sigmas: number[][];
  };
  license: string;
}

export type DiffusionFamily =
  | "black_pro_mist"
  | "pro_mist"
  | "glimmerglass"
  | "cinebloom";

export type AutoExposureMethod =
  | "center_weighted"
  | "average"
  | "median"
  | "partial"
  | "matrix"
  | "multi_zone"
  | "highlight_weighted";

export type WhiteBalance = "as_shot" | "daylight" | "tungsten" | "custom";

export type ExportFormat = "jpeg" | "png";

export type ExportColorSpace =
  | "srgb"
  | "adobe_rgb"
  | "prophoto"
  | "rec2020"
  | "linear_srgb";

export type RgbToRawMethod = "hanatos2025" | "mallett2019";

export type RawEngine = "spektrafilm" | "hasselblad" | "lumix" | "adobe";

export type RawEngineStyle =
  | "standard"
  | "nature"
  | "portrait"
  | "landscape"
  | "vivid"
  | "natural"
  | "reproduction";

export type InputGamutMode = "off" | "xy";

export type OutputGamutMode = "legacy_clip" | "off" | "aces_rgc" | "oklch" | "oklrab" | "jzazbz" | "cam16ucs";

export interface DiffusionState {
  active: boolean;
  family: DiffusionFamily;
  strength: number;
  spatialScale: number;
  haloWarmth: number;
  coreIntensity: number;
  coreSize: number;
  haloIntensity: number;
  haloSize: number;
  bloomIntensity: number;
  bloomSize: number;
}

export interface DarkroomParams {
  prep: PrepParams;
  transport: import("./layered-transport.ts").TransportParams;
  output: import("./output-model.ts").OutputParams;
  experimental: ExperimentalParams;
  filmStock: string;
  printPaper: string;
  exposureCompensationEv: number;
  autoExposure: boolean;
  autoExposureMethod: AutoExposureMethod;
  filmFormatMm: number;
  cameraLensBlurUm: number;
  cameraDiffusion: DiffusionState;
  printIlluminant: string;
  printExposure: number;
  printExposureCompensation: boolean;
  printYFilterShift: number;
  printMFilterShift: number;
  printCFilterNeutral: number;
  printYFilterNeutral: number;
  printMFilterNeutral: number;
  printDiffusion: DiffusionState;
  scanLensBlur: number;
  scanWhiteCorrection: boolean;
  scanWhiteLevel: number;
  scanBlackCorrection: boolean;
  scanBlackLevel: number;
  scanUnsharpSigma: number;
  scanUnsharpAmount: number;
  scanFilm: boolean;
  outputCctf: boolean;
  autoPreview: boolean;
  previewMaxSize: number;
  gray18Canvas: boolean;
  whitePadding: number;
  frameStyle: "none" | "135" | "120" | "minimal";
  frameNumber: number;
  frameBarcode: boolean;
  frameDate: string;
  crop: boolean;
  cropCenterX: number;
  cropCenterY: number;
  cropSizeX: number;
  cropSizeY: number;
  applyCctfDecoding: boolean;
  upscaleFactor: number;
  filterUvAmount: number;
  filterIrAmount: number;
  whiteBalance: WhiteBalance;
  /** Correlated colour temperature, Kelvin (Robertson 1968 / DNG). */
  temperature: number;
  /** DNG tint: 0 = Planckian, + green, − magenta. Typical range −150…+150. */
  tint: number;
  grainActive: boolean;
  grainParticleArea: number;
  grainScaleR: number;
  grainScaleG: number;
  grainScaleB: number;
  grainDensityMin: number;
  grainUniformity: number;
  grainBlur: number;
  grainDyeCloudsUm: number;
  halationActive: boolean;
  scatterAmount: number;
  scatterSpatialScale: number;
  halationAmount: number;
  halationSpatialScale: number;
  boostEv: number;
  protectEv: number;
  boostRange: number;
  scatterCoreUm: Vec3;
  scatterTailUm: Vec3;
  scatterTailWeight: Vec3;
  halationStrength: Vec3;
  halationFirstSigmaUm: Vec3;
  halationNBounces: number;
  halationBounceDecay: number;
  halationRenormalize: boolean;
  couplersActive: boolean;
  couplersAmount: number;
  inhibitionSamelayer: number;
  inhibitionInterlayer: number;
  gammaSamelayer: Vec3;
  gammaRtoGB: [number, number];
  gammaGtoRB: [number, number];
  gammaBtoRG: [number, number];
  couplerDiffusionUm: number;
  glareActive: boolean;
  glarePercent: number;
  glareRoughness: number;
  glareBlur: number;
  chemistryActive: boolean;
  printGamma: number;
  printGammaFast: number;
  printGammaSlow: number;
  printGammaR: number;
  printGammaG: number;
  printGammaB: number;
  developerExhaustion: number;
  filmGamma: number;
  preflashExposure: number;
  preflashYShift: number;
  preflashMShift: number;
  gamutCompress: boolean;
  rgbToRawMethod: RgbToRawMethod;
  hanatosWindow: boolean;
  hanatosSurface: boolean;
  spectralBlur: number;
  useEnlargerLut: boolean;
  useScannerLut: boolean;
  lutResolution: number;
  useFastStats: boolean;
  gpuPreview: boolean;
  gpuExport: boolean;
  rawEngine: RawEngine;
  rawEngineStyle: RawEngineStyle;
  grainSublayers: boolean;
  grainSubLayersN: number;
  inputGamutCompress: InputGamutMode;
  outputGamutCompress: OutputGamutMode;
  exportFormat: ExportFormat;
  exportQuality: number;
  exportMaxEdge: number;
  exportColorSpace: ExportColorSpace;
  orientation: 0 | 90 | 180 | 270;
  cropAspect: "free" | "3:2" | "4:5" | "1:1" | "16:9" | "5:4";
  toneCurveActive: boolean;
  toneCurveMaster: [number, number][];
  toneCurveRed: [number, number][];
  toneCurveGreen: [number, number][];
  toneCurveBlue: [number, number][];
  /** Digital grade. Used only when no film stock is selected. −1…+1, 0 = off. */
  toneBrightness: number;
  toneContrast: number;
  toneSaturation: number;
  toneHighlights: number;
  toneShadows: number;
  toneWarmth: number;
}

export function isFilmBypass(id: string | null | undefined): boolean {
  const s = String(id ?? "")
    .trim()
    .toLowerCase();
  return !s || s === "none" || s === "off" || s === "bypass" || s === "linear";
}

export function isPaperBypass(id: string | null | undefined): boolean {
  const s = String(id ?? "")
    .trim()
    .toLowerCase();
  return !s || s === "none" || s === "off" || s === "bypass";
}

export type FilmPack = "none" | "kodak" | "fuji" | "cine" | "slide";

export function filmPack(id: string): FilmPack {
  if (id.startsWith("exp_")) id=id.slice(4);
  if (id.startsWith("negs_")) id=id.slice(5);
  if (isFilmBypass(id)) return "none";
  if (id.startsWith("fujifilm")) {
    if (id.includes("velvia") || id.includes("provia")) return "slide";
    return "fuji";
  }
  if (
    id.includes("vision") ||
    id.includes("verita") ||
    id.includes("2383") ||
    id.includes("2393")
  ) {
    return "cine";
  }
  if (id.includes("ektachrome") || id.includes("kodachrome")) return "slide";
  return "kodak";
}

export function boxShortName(name: string): string {
  return name
    .replace(/^Kodak\s+/i, "")
    .replace(/^Fujifilm\s+/i, "")
    .replace(/\s+Professional$/i, "");
}

export const FILM_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Исходник",
    ids: ["none"],
  },
  {
    label: "Kodak Portra",
    ids: [
      "kodak_portra_160",
      "kodak_portra_400",
      "kodak_portra_800",
      "kodak_portra_800_push1",
      "kodak_portra_800_push2",
    ],
  },
  {
    label: "Kodak still",
    ids: ["kodak_ektar_100", "kodak_gold_200", "kodak_ultramax_400"],
  },
  {
    label: "Kodak Vision3 / cine",
    ids: [
      "kodak_vision3_50d",
      "kodak_vision3_250d",
      "kodak_verita_200d",
      "kodak_vision3_200t",
      "kodak_vision3_500t",
      "kodak_doublex",
      "kodak_trix",
    ],
  },
  {
    label: "Fujifilm",
    ids: ["fujifilm_pro_400h", "fujifilm_c200", "fujifilm_xtra_400"],
  },
  {
    label: "Slide / reversal",
    ids: [
      "kodak_ektachrome_100",
      "kodak_kodachrome_64",
      "fujifilm_velvia_100",
      "fujifilm_provia_100f",
    ],
  },
];

export const PAPER_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Без бумаги",
    ids: ["none"],
  },
  {
    label: "RA-4 paper",
    ids: [
      "kodak_portra_endura",
      "kodak_endura_premier",
      "kodak_supra_endura",
      "kodak_ektacolor_edge",
      "kodak_ultra_endura",
      "fujifilm_crystal_archive_typeii",
    ],
  },
  {
    label: "Print film",
    ids: ["kodak_2383", "kodak_2393", "kodak_2302"],
  },
];
