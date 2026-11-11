import { defaultParams } from "./defaults.ts";
import type { DarkroomParams } from "./types.ts";
import type { ExperimentalParams } from "./experimental.ts";
import type { ToolId } from "./store.ts";

export const TOOL_KEYS: Record<ToolId, (keyof DarkroomParams)[]> = {
  prep: ["prep"],
  edit: ["printPaper","whiteBalance","temperature","grainActive","halationActive","halationAmount","halationSpatialScale","transport","output"],
  outputs: ["output"],
  emulsion: [],
  development: ["filmGamma", "exposureCompensationEv", "autoExposure", "printExposureCompensation"],
  film: ["filmStock"],
  texture: [
    "transport",
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
    "gammaSamelayer","gammaRtoGB","gammaGtoRB","gammaBtoRG",
  ],
  negative: [],
  frame: ["frameStyle","frameNumber","frameBarcode","frameDate","whitePadding"],
  tone: [
    "toneBrightness",
    "toneContrast",
    "toneSaturation",
    "toneHighlights",
    "toneShadows",
    "toneWarmth",
  ],
  presets: [],
  camera: [
    "exposureCompensationEv",
    "autoExposure",
    "autoExposureMethod",
    "filmFormatMm",
    "whiteBalance",
    "temperature",
    "tint",
    "filterUvAmount",
    "filterIrAmount",
    "cameraLensBlurUm",
    "cameraDiffusion",
  ],
  print: [
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
  ],
  scan: [
    "scanFilm",
    "scanUnsharpSigma",
    "scanUnsharpAmount",
    "scanWhiteCorrection",
    "scanBlackCorrection",
    "scanLensBlur",
    "scanWhiteLevel",
    "scanBlackLevel",
  ],
  crop: [
    "crop",
    "cropCenterX",
    "cropCenterY",
    "cropSizeX",
    "cropSizeY",
    "cropAspect",
    "orientation",
    "gray18Canvas",
  ],
  stock: [],
  gallery: [],
  lab: [
    "rgbToRawMethod",
    "hanatosWindow",
    "hanatosSurface",
    "spectralBlur",
    "gpuPreview",
    "gpuExport",
    "useEnlargerLut",
    "useScannerLut",
    "lutResolution",
    "useFastStats",
    "applyCctfDecoding",
    "inputGamutCompress",
    "outputGamutCompress",
    "upscaleFactor",
  ],
  export: ["exportFormat", "exportQuality", "exportMaxEdge", "exportColorSpace", "outputCctf", "gamutCompress"],
  log: [],
  settings: ["rawEngine", "rawEngineStyle"],
};


const experimentalKeys=Object.keys(defaultParams().experimental) as (keyof ExperimentalParams)[];
export const TOOL_EXPERIMENTAL_KEYS:Partial<Record<ToolId,(keyof ExperimentalParams)[]>>={
 development:experimentalKeys.filter(k=>k==='filmChemistry'||k.startsWith('film')&&!k.startsWith('filmBase')),
 texture:experimentalKeys.filter(k=>k.startsWith('grain')||k.startsWith('dir')),
 emulsion:experimentalKeys.filter(k=>k.startsWith('filmBase')||k==='spectralMethod'||k==='colorFilter'),
 negative:experimentalKeys.filter(k=>k.startsWith('scan')||k==='workflow'||k.startsWith('filmBase')),
 print:experimentalKeys.filter(k=>k.startsWith('printBase')),
};
/** Ownership is shared by the edited badge and reset; nested groups are isolated. */
export function toolChangeCount(params:DarkroomParams,tool:ToolId):number{
 const baseline=defaultParams();
 return (tool==="edit"&&params.prep.exposure!==baseline.prep.exposure?1:0)+TOOL_KEYS[tool].filter(k=>JSON.stringify(params[k])!==JSON.stringify(baseline[k])).length+
 (TOOL_EXPERIMENTAL_KEYS[tool]??[]).filter(k=>JSON.stringify(params.experimental?.[k])!==JSON.stringify(baseline.experimental[k])).length;
}
export function resetToolParams(params:DarkroomParams,tool:ToolId):DarkroomParams{
 const baseline=defaultParams(),next={...params};
 for(const k of TOOL_KEYS[tool])(next as unknown as Record<string,unknown>)[k]=baseline[k];
 if(tool==="edit")next.prep={...params.prep,exposure:baseline.prep.exposure};
 const nested=TOOL_EXPERIMENTAL_KEYS[tool]??[];
 if(nested.length){next.experimental={...params.experimental};for(const k of nested)(next.experimental as Record<string,unknown>)[k]=baseline.experimental[k];}
 return next;
}
