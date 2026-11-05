import type { DarkroomParams } from "./types.ts";
import { isFilmBypass } from "./types.ts";
import { defaultDigitalTone } from "./digital-tone.ts";
import { sanitizeRawEngine, sanitizeRawEngineStyle, type RawEngine } from "./raw-engine.ts";
import { defaultParams, sanitizeParams } from "./defaults.ts";

const SLOT_KEYS: (keyof DarkroomParams)[] = [
  "filmStock",
  "filmGamma",
  "grainActive",
  "grainParticleArea",
  "grainBlur",
  "grainScaleR",
  "grainScaleG",
  "grainScaleB",
  "grainDensityMin",
  "grainUniformity",
  "grainDyeCloudsUm",
  "grainSublayers",
  "grainSubLayersN",
  "halationActive",
  "halationAmount",
  "halationSpatialScale",
  "scatterAmount",
  "scatterSpatialScale",
  "boostEv",
  "protectEv",
  "boostRange",
  "halationNBounces",
  "halationBounceDecay",
  "halationRenormalize",
  "couplersActive",
  "couplersAmount",
  "inhibitionInterlayer",
  "inhibitionSamelayer",
  "couplerDiffusionUm",
  "printPaper",
  "printExposure",
  "printExposureCompensation",
  "printYFilterShift",
  "printMFilterShift",
  "printYFilterNeutral",
  "printMFilterNeutral",
  "printCFilterNeutral",
  "printIlluminant",
  "preflashExposure",
  "preflashYShift",
  "preflashMShift",
  "chemistryActive",
  "printGamma",
  "printGammaFast",
  "printGammaSlow",
  "printGammaR",
  "printGammaG",
  "printGammaB",
  "developerExhaustion",
  "printDiffusion",
  "glareActive",
  "glarePercent",
  "glareRoughness",
  "glareBlur",
  "scanLensBlur",
  "scanWhiteCorrection",
  "scanWhiteLevel",
  "scanBlackCorrection",
  "scanBlackLevel",
  "scanUnsharpSigma",
  "scanUnsharpAmount",
  "scanFilm",
  "toneBrightness",
  "toneContrast",
  "toneSaturation",
  "toneHighlights",
  "toneShadows",
  "toneWarmth",
  "rawEngineStyle",
];

export type EngineSlot = {
  tool: string;
  params: Partial<DarkroomParams>;
};

export type EngineSlots = Partial<Record<RawEngine, EngineSlot>>;

export function snapshotEngine(params: DarkroomParams, tool: string): EngineSlot {
  const patch: Partial<DarkroomParams> = {};
  for (const key of SLOT_KEYS) {
    (patch as Record<string, unknown>)[key] = params[key];
  }
  return { tool, params: patch };
}

export function applyEngineSlot(
  base: DarkroomParams,
  engine: RawEngine,
  slot: EngineSlot | undefined,
): { params: DarkroomParams; tool: string } {
  const d = defaultParams();
  const next: DarkroomParams = { ...base };
  if (slot?.params) {
    Object.assign(next, slot.params);
  } else if (engine !== "spektrafilm") {
    Object.assign(next, defaultDigitalTone());
  }
  next.rawEngine = sanitizeRawEngine(engine);
  next.rawEngineStyle = sanitizeRawEngineStyle(next.rawEngine, next.rawEngineStyle);
  if (next.rawEngine !== "spektrafilm") {
    next.filmStock = "none";
  } else if (!slot?.params?.filmStock) {
    next.filmStock = d.filmStock;
  }
  const fallbackTool = next.rawEngine === "spektrafilm" ? "film" : "tone";
  let tool = slot?.tool || fallbackTool;
  if (next.rawEngine !== "spektrafilm" && (tool === "film" || tool === "print" || tool === "scan")) {
    tool = "tone";
  }
  if (next.rawEngine === "spektrafilm" && tool === "tone") {
    tool = isFilmBypass(next.filmStock) ? "film" : "film";
  }
  return { params: sanitizeParams(next), tool };
}

export function engineChipLabel(id: RawEngine): string {
  if (id === "spektrafilm") return "Spektra";
  if (id === "hasselblad") return "HNCS";
  if (id === "lumix") return "Lumix";
  if (id === "adobe") return "Adobe";
  return id;
}

export function engineFullLabel(id: RawEngine): string {
  if (id === "spektrafilm") return "Spektrafilm";
  if (id === "hasselblad") return "Hasselblad HNCS";
  if (id === "lumix") return "Lumix";
  if (id === "adobe") return "Adobe Color";
  return id;
}
