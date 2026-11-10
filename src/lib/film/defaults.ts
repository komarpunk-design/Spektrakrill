import { defaultExperimental, sanitizeExperimental } from "./experimental.ts";
import { sanitizeFrameStyle } from "./photo-frame.ts";
import type { DarkroomParams, DiffusionFamily, DiffusionState } from "./types.ts";
import { isFilmBypass, isPaperBypass } from "./types.ts";
import {
  sanitizeRawEngine,
  sanitizeRawEngineStyle,
} from "./raw-engine.ts";
import { sanitizeDigitalTone } from "./digital-tone.ts";
import {
  sanitizeTemperature,
  sanitizeTint,
  sanitizeWhiteBalance,
} from "./wb-temp-tint.ts";

export const DIFFUSION_FAMILIES: DiffusionFamily[] = [
  "black_pro_mist",
  "pro_mist",
  "glimmerglass",
  "cinebloom",
];

export const defaultDiffusion = (active = false): DiffusionState => ({
  active,
  family: "black_pro_mist",
  strength: 0.5,
  spatialScale: 1,
  haloWarmth: 0,
  coreIntensity: 1,
  coreSize: 1,
  haloIntensity: 1,
  haloSize: 1,
  bloomIntensity: 1,
  bloomSize: 1,
});

export function sanitizeDiffusionFamily(v: unknown): DiffusionFamily {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (s === "classic_soft") return "black_pro_mist";
  if ((DIFFUSION_FAMILIES as string[]).includes(s)) return s as DiffusionFamily;
  return "black_pro_mist";
}

export function sanitizeDiffusion(v: unknown): DiffusionState {
  const base = defaultDiffusion(false);
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const num = (k: keyof DiffusionState, fallback: number) => {
    const n = Number(o[k]);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    active: Boolean(o.active),
    family: sanitizeDiffusionFamily(o.family ?? o.filterFamily ?? o.filter_family),
    strength: num("strength", base.strength),
    spatialScale: num("spatialScale", base.spatialScale),
    haloWarmth: num("haloWarmth", base.haloWarmth),
    coreIntensity: num("coreIntensity", base.coreIntensity),
    coreSize: num("coreSize", base.coreSize),
    haloIntensity: num("haloIntensity", base.haloIntensity),
    haloSize: num("haloSize", base.haloSize),
    bloomIntensity: num("bloomIntensity", base.bloomIntensity),
    bloomSize: num("bloomSize", base.bloomSize),
  };
}

export function sanitizeWb<T extends { whiteBalance?: unknown; temperature?: unknown; tint?: unknown }>(
  p: T,
): T {
  return {
    ...p,
    whiteBalance: sanitizeWhiteBalance(p.whiteBalance),
    temperature: sanitizeTemperature(p.temperature),
    tint: sanitizeTint(p.tint),
  };
}

export function sanitizeParams(raw: unknown): DarkroomParams {
  const base = defaultParams();
  const p = raw && typeof raw === "object" ? (raw as Partial<DarkroomParams>) : {};
  const merged: DarkroomParams = { ...base, ...p };
  merged.experimental=sanitizeExperimental(p.experimental);
  merged.filmGamma = Number.isFinite(merged.filmGamma) && merged.filmGamma > 0 ? merged.filmGamma : 1;
  merged.exposureCompensationEv = Number.isFinite(merged.exposureCompensationEv) ? merged.exposureCompensationEv : 0;
  merged.frameNumber = Number.isFinite(merged.frameNumber) ? Math.max(1,Math.min(99,Math.trunc(merged.frameNumber))) : 18;
  merged.frameBarcode = merged.frameBarcode !== false;
  merged.frameDate = typeof merged.frameDate === "string" ? merged.frameDate.slice(0,32) : "";
  merged.frameStyle = sanitizeFrameStyle(merged.frameStyle);
  merged.whitePadding = Number.isFinite(merged.whitePadding) ? Math.max(0.01, Math.min(0.2, merged.whitePadding)) : 0.04;
  merged.cameraDiffusion = sanitizeDiffusion(merged.cameraDiffusion);
  merged.printDiffusion = sanitizeDiffusion(merged.printDiffusion);
  const wb = sanitizeWb(merged);
  const vec3 = (v: unknown, fb: [number, number, number]): [number, number, number] => {
    if (Array.isArray(v) && v.length >= 3) {
      const a = Number(v[0]);
      const b = Number(v[1]);
      const c = Number(v[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) return [a, b, c];
    }
    return fb;
  };
  const pair = (v: unknown, fb: [number, number]): [number, number] => {
    if (Array.isArray(v) && v.length >= 2) {
      const a = Number(v[0]);
      const b = Number(v[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
    }
    return fb;
  };
  wb.scatterCoreUm = vec3(wb.scatterCoreUm, base.scatterCoreUm);
  wb.scatterTailUm = vec3(wb.scatterTailUm, base.scatterTailUm);
  wb.scatterTailWeight = vec3(wb.scatterTailWeight, base.scatterTailWeight);
  wb.halationStrength = vec3(wb.halationStrength, base.halationStrength);
  wb.halationFirstSigmaUm = vec3(wb.halationFirstSigmaUm, base.halationFirstSigmaUm);
  wb.gammaSamelayer = vec3(wb.gammaSamelayer, base.gammaSamelayer);
  wb.gammaRtoGB = pair(wb.gammaRtoGB, base.gammaRtoGB);
  wb.gammaGtoRB = pair(wb.gammaGtoRB, base.gammaGtoRB);
  wb.gammaBtoRG = pair(wb.gammaBtoRG, base.gammaBtoRG);
  if (!Number.isFinite(wb.halationNBounces) || wb.halationNBounces < 1) wb.halationNBounces = 1;
  if (wb.halationNBounces > 8) wb.halationNBounces = 8;
  if (!Number.isFinite(wb.previewMaxSize) || wb.previewMaxSize < 256) wb.previewMaxSize = 960;
  if (wb.previewMaxSize > 4096) wb.previewMaxSize = 4096;
  const ori = Number(wb.orientation);
  wb.orientation = ori === 90 || ori === 180 || ori === 270 ? (ori as 90 | 180 | 270) : 0;
  wb.rawEngine = sanitizeRawEngine(wb.rawEngine);
  wb.rawEngineStyle = sanitizeRawEngineStyle(wb.rawEngine, wb.rawEngineStyle);
  if (isFilmBypass(wb.filmStock)) wb.filmStock = "none";
  if (isPaperBypass(wb.printPaper)) wb.printPaper = "none";
  sanitizeDigitalTone(wb);
  return wb;
}


export const defaultParams = (): DarkroomParams => ({
  experimental: defaultExperimental(),
  filmStock: "none",
  printPaper: "kodak_portra_endura",
  exposureCompensationEv: 0,
  autoExposure: true,
  autoExposureMethod: "center_weighted",
  filmFormatMm: 35,
  cameraLensBlurUm: 0,
  cameraDiffusion: defaultDiffusion(false),
  printIlluminant: "TH-KG3",
  printExposure: 1,
  printExposureCompensation: true,
  printYFilterShift: 0,
  printMFilterShift: 0,
  printCFilterNeutral: 0,
  printYFilterNeutral: 55,
  printMFilterNeutral: 65,
  printDiffusion: defaultDiffusion(false),
  scanLensBlur: 0,
  scanWhiteCorrection: false,
  scanWhiteLevel: 0.98,
  scanBlackCorrection: false,
  scanBlackLevel: 0.01,
  scanUnsharpSigma: 0.7,
  scanUnsharpAmount: 0.7,
  scanFilm: false,
  outputCctf: true,
  autoPreview: true,
  previewMaxSize: 960,
  gray18Canvas: false,
  whitePadding: 0.04,
  frameStyle: "none",
  frameNumber: 18,
  frameBarcode: true,
  frameDate: "",
  crop: false,
  cropCenterX: 0.5,
  cropCenterY: 0.5,
  cropSizeX: 0.35,
  cropSizeY: 0.35,
  applyCctfDecoding: true,
  upscaleFactor: 1,
  filterUvAmount: 0,
  filterIrAmount: 0,
  whiteBalance: "as_shot",
  temperature: 5500,
  tint: 0,
  grainActive: true,
  grainParticleArea: 0.2,
  grainScaleR: 0.8,
  grainScaleG: 1.0,
  grainScaleB: 2.0,
  grainDensityMin: 0.07,
  grainUniformity: 0.97,
  grainBlur: 0.65,
  grainDyeCloudsUm: 1,
  halationActive: true,
  scatterAmount: 1,
  scatterSpatialScale: 1,
  halationAmount: 1,
  halationSpatialScale: 1,
  boostEv: 0,
  protectEv: 4,
  boostRange: 0.3,
  scatterCoreUm: [2.2, 2.0, 1.6],
  scatterTailUm: [9.3, 9.7, 9.1],
  scatterTailWeight: [0.78, 0.65, 0.67],
  halationStrength: [0.05, 0.015, 0],
  halationFirstSigmaUm: [65, 65, 65],
  halationNBounces: 3,
  halationBounceDecay: 0.5,
  halationRenormalize: true,
  couplersActive: true,
  couplersAmount: 1,
  inhibitionSamelayer: 1,
  inhibitionInterlayer: 1,
  gammaSamelayer: [0.341, 0.324, 0.273],
  gammaRtoGB: [0.355, 0.305],
  gammaGtoRB: [0.154, 0.358],
  gammaBtoRG: [0.171, 0.225],
  couplerDiffusionUm: 20,
  glareActive: true,
  glarePercent: 0.03,
  glareRoughness: 0.7,
  glareBlur: 0.5,
  chemistryActive: false,
  printGamma: 1,
  printGammaFast: 1,
  printGammaSlow: 1,
  printGammaR: 1,
  printGammaG: 1,
  printGammaB: 1,
  developerExhaustion: 0,
  filmGamma: 1,
  preflashExposure: 0,
  preflashYShift: 0,
  preflashMShift: 0,
  gamutCompress: true,
  rgbToRawMethod: "hanatos2025",
  hanatosWindow: true,
  hanatosSurface: false,
  spectralBlur: 0,
  useEnlargerLut: false,
  useScannerLut: false,
  lutResolution: 17,
  useFastStats: false,
  gpuPreview: true,
  gpuExport: true,
  rawEngine: "spektrafilm",
  rawEngineStyle: "standard",
  grainSublayers: true,
  grainSubLayersN: 1,
  inputGamutCompress: "off",
  outputGamutCompress: "legacy_clip",
  exportFormat: "jpeg",
  exportQuality: 98,
  exportMaxEdge: 0,
  exportColorSpace: "srgb",
  orientation: 0,
  cropAspect: "free",
  toneCurveActive: false,
  toneCurveMaster: [],
  toneCurveRed: [],
  toneCurveGreen: [],
  toneCurveBlue: [],
  toneBrightness: 0,
  toneContrast: 0,
  toneSaturation: 0,
  toneHighlights: 0,
  toneShadows: 0,
  toneWarmth: 0,
});

export function particleAreaForIso(iso: number | null): number {
  if (!iso) return 0.2;
  // datasheet-inspired: ~0.1 @ 100, 0.2 @ 400, 0.4 @ 800
  return Math.max(0.06, 0.1 * Math.sqrt(iso / 100));
}

export function halationForAh(ah: "strong" | "weak" | "no"): [number, number, number] {
  if (ah === "no") return [0.22, 0.08, 0.02];
  if (ah === "weak") return [0.12, 0.04, 0];
  return [0.05, 0.015, 0];
}
