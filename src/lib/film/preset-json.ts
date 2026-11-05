import { defaultParams, sanitizeDiffusion, sanitizeWb } from "./defaults.ts";
import type {
  DarkroomParams,
  DiffusionState,
  ExportColorSpace,
  InputGamutMode,
  OutputGamutMode,
} from "./types.ts";
import type { Look } from "./store.ts";

const PARAM_KEYS = new Set(Object.keys(defaultParams()));

const KEY_ALIAS: Record<string, keyof DarkroomParams> = {
  filmprofile: "filmStock",
  film_profile: "filmStock",
  film_stock: "filmStock",
  printprofile: "printPaper",
  print_profile: "printPaper",
  print_paper: "printPaper",
  exposurecompensationev: "exposureCompensationEv",
  exposure_compensation_ev: "exposureCompensationEv",
  autoexposure: "autoExposure",
  auto_exposure: "autoExposure",
  autoexposuremethod: "autoExposureMethod",
  filmformatmm: "filmFormatMm",
  lensblurum: "cameraLensBlurUm",
  cameralensblurum: "cameraLensBlurUm",
  illuminant: "printIlluminant",
  printilluminant: "printIlluminant",
  printexposure: "printExposure",
  printexposurecompensation: "printExposureCompensation",
  yfiltershift: "printYFilterShift",
  mfiltershift: "printMFilterShift",
  printyfiltershift: "printYFilterShift",
  printmfiltershift: "printMFilterShift",
  preflashexposure: "preflashExposure",
  preflashyfiltershift: "preflashYShift",
  preflashmfiltershift: "preflashMShift",
  preflashyshift: "preflashYShift",
  preflashmshift: "preflashMShift",
  whitebalance: "whiteBalance",
  grainactive: "grainActive",
  sublayersactive: "grainSublayers",
  grainsublayers: "grainSublayers",
  particleareaum2: "grainParticleArea",
  agxparticleareaum2: "grainParticleArea",
  grainparticlearea: "grainParticleArea",
  blurdyecloudsum: "grainDyeCloudsUm",
  nsublayers: "grainSubLayersN",
  grainsublayersn: "grainSubLayersN",
  densitycurvegamma: "filmGamma",
  filmgamma: "filmGamma",
  filmgammafactor: "filmGamma",
  morphactive: "chemistryActive",
  chemistryactive: "chemistryActive",
  morphgammafactor: "printGamma",
  printgamma: "printGamma",
  morphgammafactorfast: "printGammaFast",
  morphgammafactorslow: "printGammaSlow",
  morphgammafactorred: "printGammaR",
  morphgammafactorgreen: "printGammaG",
  morphgammafactorblue: "printGammaB",
  morphdeveloperexhaustion: "developerExhaustion",
  developerexhaustion: "developerExhaustion",
  scanfilm: "scanFilm",
  savingcctfencoding: "outputCctf",
  outputcctf: "outputCctf",
  inputcctfdecoding: "applyCctfDecoding",
  applycctfdecoding: "applyCctfDecoding",
  spectralgaussianblur: "spectralBlur",
  spectralblur: "spectralBlur",
  adaptationwindow: "hanatosWindow",
  hanatoswindow: "hanatosWindow",
  adaptationsurface: "hanatosSurface",
  hanatossurface: "hanatosSurface",
  applyhanatos2025adaptationwindow: "hanatosWindow",
  applyhanatos2025adaptationsurface: "hanatosSurface",
  spectralupsampling: "rgbToRawMethod",
  rgbtorawmethod: "rgbToRawMethod",
  outputgamutcompress: "outputGamutCompress",
  inputgamutcompress: "inputGamutCompress",
  previewmaxsize: "previewMaxSize",
  upscalefactor: "upscaleFactor",
  filteruvamount: "filterUvAmount",
  filteriramount: "filterIrAmount",
  scatteramount: "scatterAmount",
  scatterspatialscale: "scatterSpatialScale",
  halationamount: "halationAmount",
  halationspatialscale: "halationSpatialScale",
  boostev: "boostEv",
  protectev: "protectEv",
  boostrange: "boostRange",
  nBounces: "halationNBounces",
  halationnbounces: "halationNBounces",
  bouncedecay: "halationBounceDecay",
  halationbouncedecay: "halationBounceDecay",
  renormalize: "halationRenormalize",
  halationrenormalize: "halationRenormalize",
  couplersactive: "couplersActive",
  couplersamount: "couplersAmount",
  amount: "couplersAmount",
  inhibitionsamelayer: "inhibitionSamelayer",
  inhibitioninterlayer: "inhibitionInterlayer",
  diffusionsizeum: "couplerDiffusionUm",
  couplerdiffusionum: "couplerDiffusionUm",
  glareactive: "glareActive",
  glarepercent: "glarePercent",
  glareroughness: "glareRoughness",
  glareblur: "glareBlur",
  grainblur: "grainBlur",
  whitecorrection: "scanWhiteCorrection",
  whitelevel: "scanWhiteLevel",
  blackcorrection: "scanBlackCorrection",
  blacklevel: "scanBlackLevel",
  scanlensblur: "scanLensBlur",
  tonecurveactive: "toneCurveActive",
  gpupreview: "gpuPreview",
  gpuexport: "gpuExport",
  rawengine: "rawEngine",
  rawenginestyle: "rawEngineStyle",
  renderingengine: "rawEngine",
  tonebrightness: "toneBrightness",
  tonecontrast: "toneContrast",
  tonesaturation: "toneSaturation",
  tonehighlights: "toneHighlights",
  toneshadows: "toneShadows",
  tonewarmth: "toneWarmth",
  outputcolorspace: "exportColorSpace",
  savingcolorspace: "exportColorSpace",
  exportcolorspace: "exportColorSpace",
  gray18canvas: "gray18Canvas",
  whitepadding: "whitePadding",
};

function camelize(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function normKey(k: string): string {
  return k.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  return undefined;
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/** Read camelCase or snake_case from a Spektrafilm object. */
function val(o: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (o[n] !== undefined) return o[n];
    const c = camelize(n);
    if (c !== n && o[c] !== undefined) return o[c];
    const s = snake(n);
    if (s !== n && o[s] !== undefined) return o[s];
  }
  const want = new Set(names.map(normKey));
  for (const [k, v] of Object.entries(o)) {
    if (want.has(normKey(k))) return v;
  }
  return undefined;
}

function mapColorSpace(v: unknown): ExportColorSpace | undefined {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return undefined;
  if (s.includes("linear")) return "linear_srgb";
  if (s.includes("adobe")) return "adobe_rgb";
  if (s.includes("prophoto")) return "prophoto";
  if (s.includes("2020") || s.includes("rec2020")) return "rec2020";
  if (s.includes("srgb")) return "srgb";
  return undefined;
}

function mapRgbMethod(v: unknown): DarkroomParams["rgbToRawMethod"] | undefined {
  const s = String(v ?? "").toLowerCase();
  if (!s) return undefined;
  if (s.includes("mallett")) return "mallett2019";
  if (s.includes("hanatos")) return "hanatos2025";
  return undefined;
}

function gamutAlgo(v: unknown): string {
  if (typeof v === "string") return v.trim().toLowerCase();
  const o = asRec(v);
  if (!o) return "";
  if (o.active === false) return "off";
  return String(o.algorithm ?? o.mode ?? "").trim().toLowerCase();
}

function mapInputGamut(v: unknown): InputGamutMode | undefined {
  const s = gamutAlgo(v);
  if (s === "off" || s === "xy") return s;
  return undefined;
}

function mapOutputGamut(v: unknown): OutputGamutMode | undefined {
  const s = gamutAlgo(v);
  if (s === "legacy_clip" || s === "off" || s === "aces_rgc" || s === "oklch" || s === "oklrab") return s;
  return undefined;
}

function asDiffusion(v: unknown): DiffusionState | undefined {
  if (!asRec(v)) return undefined;
  return sanitizeDiffusion(v);
}

function points(v: unknown): [number, number][] | undefined {
  const a = arr(v);
  if (!a) return undefined;
  const out: [number, number][] = [];
  for (const p of a) {
    if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]), Number(p[1])]);
  }
  return out.length ? out : undefined;
}

function put(out: Record<string, unknown>, key: keyof DarkroomParams, v: unknown) {
  if (v === undefined) return;
  out[key] = v;
}

function applyScalar(out: Record<string, unknown>, key: string, v: unknown) {
  const alias = KEY_ALIAS[normKey(key)] ?? (PARAM_KEYS.has(key) ? (key as keyof DarkroomParams) : PARAM_KEYS.has(camelize(key)) ? (camelize(key) as keyof DarkroomParams) : null);
  if (!alias) return;
  if (alias === "exportColorSpace") {
    const cs = mapColorSpace(v);
    if (cs) out.exportColorSpace = cs;
    return;
  }
  if (alias === "rgbToRawMethod") {
    const m = mapRgbMethod(v);
    if (m) out.rgbToRawMethod = m;
    return;
  }
  if (alias === "inputGamutCompress") {
    const g = mapInputGamut(v);
    if (g) out.inputGamutCompress = g;
    return;
  }
  if (alias === "outputGamutCompress") {
    const g = mapOutputGamut(v);
    if (g) out.outputGamutCompress = g;
    return;
  }
  if (v && typeof v === "object") return;
  out[alias] = v;
}

function applyGrain(out: Record<string, unknown>, g: Record<string, unknown>) {
  const active = bool(val(g, "active", "grainActive"));
  if (active !== undefined) put(out, "grainActive", active);
  const sub = bool(val(g, "sublayersActive", "grainSublayers"));
  if (sub !== undefined) put(out, "grainSublayers", sub);
  const area = num(val(g, "agxParticleAreaUm2", "particleAreaUm2", "grainParticleArea"));
  if (area !== undefined) put(out, "grainParticleArea", area);
  const scale = arr(val(g, "agxParticleScale", "particleScale"));
  if (scale && scale.length >= 3) {
    put(out, "grainScaleR", num(scale[0]));
    put(out, "grainScaleG", num(scale[1]));
    put(out, "grainScaleB", num(scale[2]));
  }
  const dmin = val(g, "densityMin", "grainDensityMin");
  const dminArr = arr(dmin);
  if (dminArr) put(out, "grainDensityMin", num(dminArr[0]));
  else put(out, "grainDensityMin", num(dmin));
  const uni = val(g, "uniformity", "grainUniformity");
  const uniArr = arr(uni);
  if (uniArr) put(out, "grainUniformity", num(uniArr[0]));
  else put(out, "grainUniformity", num(uni));
  put(out, "grainBlur", num(val(g, "blur", "grainBlur")));
  put(out, "grainDyeCloudsUm", num(val(g, "blurDyeCloudsUm", "grainDyeCloudsUm")));
  put(out, "grainSubLayersN", num(val(g, "nSubLayers", "grainSubLayersN", "microSublayers")));
}

function applyHalation(out: Record<string, unknown>, h: Record<string, unknown>) {
  put(out, "halationActive", bool(val(h, "active", "halationActive")));
  put(out, "scatterAmount", num(val(h, "scatterAmount")));
  put(out, "scatterSpatialScale", num(val(h, "scatterSpatialScale")));
  put(out, "halationAmount", num(val(h, "halationAmount")));
  put(out, "halationSpatialScale", num(val(h, "halationSpatialScale")));
  put(out, "boostEv", num(val(h, "boostEv")));
  put(out, "protectEv", num(val(h, "protectEv")));
  put(out, "boostRange", num(val(h, "boostRange")));
  const core = arr(val(h, "scatterCoreUm"));
  if (core && core.length >= 3) put(out, "scatterCoreUm", core.map(Number).slice(0, 3));
  const tail = arr(val(h, "scatterTailUm"));
  if (tail && tail.length >= 3) put(out, "scatterTailUm", tail.map(Number).slice(0, 3));
  const tw = arr(val(h, "scatterTailWeight", "scatterTailWeightPct"));
  if (tw && tw.length >= 3) put(out, "scatterTailWeight", tw.map(Number).slice(0, 3));
  const hs = arr(val(h, "halationStrength", "halationStrengthPct"));
  if (hs && hs.length >= 3) put(out, "halationStrength", hs.map(Number).slice(0, 3));
  const sig = arr(val(h, "halationFirstSigmaUm", "firstSigmaUm"));
  if (sig && sig.length >= 3) put(out, "halationFirstSigmaUm", sig.map(Number).slice(0, 3));
  put(out, "halationNBounces", num(val(h, "halationNBounces", "nBounces")));
  put(out, "halationBounceDecay", num(val(h, "halationBounceDecay", "bounceDecay")));
  put(out, "halationRenormalize", bool(val(h, "halationRenormalize", "renormalize")));
}

function applyCouplers(out: Record<string, unknown>, c: Record<string, unknown>) {
  put(out, "couplersActive", bool(val(c, "active", "couplersActive")));
  put(out, "couplersAmount", num(val(c, "amount", "couplersAmount")));
  put(out, "inhibitionSamelayer", num(val(c, "inhibitionSamelayer")));
  put(out, "inhibitionInterlayer", num(val(c, "inhibitionInterlayer")));
  const gs = arr(val(c, "gammaSamelayer", "gammaSamelayerRgb"));
  if (gs && gs.length >= 3) put(out, "gammaSamelayer", gs.map(Number).slice(0, 3));
  const r = arr(val(c, "gammaRtoGB", "gammaRtoGb", "gammaInterlayerRToGb"));
  if (r && r.length >= 2) put(out, "gammaRtoGB", [Number(r[0]), Number(r[1])]);
  const g = arr(val(c, "gammaGtoRB", "gammaGtoRb", "gammaInterlayerGToRb"));
  if (g && g.length >= 2) put(out, "gammaGtoRB", [Number(g[0]), Number(g[1])]);
  const b = arr(val(c, "gammaBtoRG", "gammaBtoRg", "gammaInterlayerBToRg"));
  if (b && b.length >= 2) put(out, "gammaBtoRG", [Number(b[0]), Number(b[1])]);
  put(out, "couplerDiffusionUm", num(val(c, "diffusionSizeUm", "couplerDiffusionUm")));
}

function applyPrintBlock(out: Record<string, unknown>, src: Record<string, unknown>) {
  put(out, "printIlluminant", str(val(src, "illuminant", "printIlluminant")));
  put(out, "printExposure", num(val(src, "printExposure")));
  put(out, "printExposureCompensation", bool(val(src, "printExposureCompensation")));
  put(out, "printYFilterShift", num(val(src, "yFilterShift", "printYFilterShift")));
  put(out, "printMFilterShift", num(val(src, "mFilterShift", "printMFilterShift")));
  put(out, "printYFilterNeutral", num(val(src, "yFilterNeutral", "printYFilterNeutral")));
  put(out, "printMFilterNeutral", num(val(src, "mFilterNeutral", "printMFilterNeutral")));
  put(out, "printCFilterNeutral", num(val(src, "cFilterNeutral", "printCFilterNeutral")));
  put(out, "preflashExposure", num(val(src, "preflashExposure")));
  put(out, "preflashYShift", num(val(src, "preflashYFilterShift", "preflashYShift")));
  put(out, "preflashMShift", num(val(src, "preflashMFilterShift", "preflashMShift")));
  const diff = asDiffusion(val(src, "diffusionFilter", "diffusion"));
  if (diff) out.printDiffusion = diff;
}

function applyChemistry(out: Record<string, unknown>, m: Record<string, unknown>, kind: "film" | "print") {
  if (kind === "film") {
    put(out, "filmGamma", num(val(m, "gammaFactor", "densityCurveGamma", "filmGamma")));
    return;
  }
  put(out, "chemistryActive", bool(val(m, "active", "chemistryActive")));
  put(out, "printGamma", num(val(m, "gammaFactor", "printGamma")));
  put(out, "printGammaFast", num(val(m, "gammaFactorFast")));
  put(out, "printGammaSlow", num(val(m, "gammaFactorSlow")));
  put(out, "printGammaR", num(val(m, "gammaFactorRed")));
  put(out, "printGammaG", num(val(m, "gammaFactorGreen")));
  put(out, "printGammaB", num(val(m, "gammaFactorBlue")));
  put(out, "developerExhaustion", num(val(m, "developerExhaustion")));
}

function pickFilmStock(p: Record<string, unknown>): string | undefined {
  const sim = asRec(p.simulation);
  return str(
    p.filmStock ??
      p.filmProfile ??
      p.film_profile ??
      p.film_stock ??
      sim?.film_stock ??
      sim?.filmStock ??
      sim?.filmProfile ??
      sim?.film_profile,
  );
}

function pickPrintPaper(p: Record<string, unknown>): string | undefined {
  const sim = asRec(p.simulation);
  return str(
    p.printPaper ??
      p.printProfile ??
      p.print_profile ??
      p.print_paper ??
      sim?.print_paper ??
      sim?.printPaper ??
      sim?.printProfile ??
      sim?.print_profile,
  );
}

function flattenScalars(out: Record<string, unknown>, nest: unknown) {
  const n = asRec(nest);
  if (!n) return;
  for (const [k, v] of Object.entries(n)) {
    applyScalar(out, k, v);
  }
}

export function spektraToParams(raw: Record<string, unknown>): DarkroomParams {
  const out: Record<string, unknown> = { ...defaultParams() };
  const nested = asRec(raw.params);
  const p: Record<string, unknown> =
    nested &&
    (raw.filmProfile ||
      raw.filmStock ||
      nested.filmProfile ||
      nested.filmStock ||
      nested.film_stock ||
      nested.camera ||
      nested.simulation ||
      nested.filmRender)
      ? { ...raw, ...nested }
      : raw;

  put(out, "filmStock", pickFilmStock(p));
  put(out, "printPaper", pickPrintPaper(p));

  for (const [k, v] of Object.entries(p)) {
    if (!PARAM_KEYS.has(k) || v === undefined) continue;
    if (k === "cameraDiffusion" || k === "printDiffusion") {
      const d = asDiffusion(v);
      if (d) out[k] = d;
      continue;
    }
    out[k] = v;
  }

  for (const [k, v] of Object.entries(p)) {
    applyScalar(out, k, v);
  }

  const cam = asRec(p.camera);
  if (cam) {
    put(out, "exposureCompensationEv", num(val(cam, "exposureCompensationEv")));
    put(out, "autoExposure", bool(val(cam, "autoExposure")));
    put(out, "autoExposureMethod", str(val(cam, "autoExposureMethod")) as DarkroomParams["autoExposureMethod"]);
    put(out, "filmFormatMm", num(val(cam, "filmFormatMm")));
    put(out, "cameraLensBlurUm", num(val(cam, "lensBlurUm", "cameraLensBlurUm")));
    const diff = asDiffusion(val(cam, "diffusionFilter", "diffusion"));
    if (diff) out.cameraDiffusion = diff;
    const uv = arr(val(cam, "filterUv"));
    if (uv) put(out, "filterUvAmount", num(uv[0]));
    const ir = arr(val(cam, "filterIr"));
    if (ir) put(out, "filterIrAmount", num(ir[0]));
  }

  const camDiff = asDiffusion(p.cameraDiffusion ?? p.camera_diffusion);
  if (camDiff) out.cameraDiffusion = camDiff;
  const printDiff = asDiffusion(p.printDiffusion ?? p.enlargerDiffusion ?? p.enlarger_diffusion);
  if (printDiff) out.printDiffusion = printDiff;

  const en = asRec(p.enlarger);
  if (en) applyPrintBlock(out, en);
  const pre = asRec(p.preflashing);
  if (pre) applyPrintBlock(out, pre);

  const sc = asRec(p.scanner);
  if (sc) {
    put(out, "scanLensBlur", num(val(sc, "lensBlur", "scanLensBlur")));
    put(out, "scanWhiteCorrection", bool(val(sc, "whiteCorrection", "scanWhiteCorrection")));
    put(out, "scanWhiteLevel", num(val(sc, "whiteLevel", "scanWhiteLevel")));
    put(out, "scanBlackCorrection", bool(val(sc, "blackCorrection", "scanBlackCorrection")));
    put(out, "scanBlackLevel", num(val(sc, "blackLevel", "scanBlackLevel")));
    const usm = arr(val(sc, "unsharpMask"));
    if (usm && usm.length >= 2) {
      put(out, "scanUnsharpSigma", num(usm[0]));
      put(out, "scanUnsharpAmount", num(usm[1]));
    }
  }

  const io = asRec(p.io) ?? asRec(p.input) ?? asRec(p.output);
  if (io) {
    put(out, "scanFilm", bool(val(io, "scanFilm")));
    put(out, "applyCctfDecoding", bool(val(io, "inputCctfDecoding", "applyCctfDecoding")));
    put(out, "outputCctf", bool(val(io, "outputCctfEncoding", "savingCctfEncoding", "outputCctf")));
    const cs = mapColorSpace(val(io, "outputColorSpace", "exportColorSpace"));
    if (cs) out.exportColorSpace = cs;
    put(out, "upscaleFactor", num(val(io, "upscaleFactor")));
    put(out, "crop", bool(val(io, "crop")));
    const cc = arr(val(io, "cropCenter"));
    if (cc && cc.length >= 2) {
      put(out, "cropCenterX", num(cc[0]));
      put(out, "cropCenterY", num(cc[1]));
    }
    const cz = arr(val(io, "cropSize"));
    if (cz && cz.length >= 2) {
      put(out, "cropSizeX", num(cz[0]));
      put(out, "cropSizeY", num(cz[1]));
    }
    const ig = mapInputGamut(val(io, "inputGamutCompress"));
    if (ig) out.inputGamutCompress = ig;
    const og = mapOutputGamut(val(io, "outputGamutCompress"));
    if (og) out.outputGamutCompress = og;
    put(out, "hanatosWindow", bool(val(io, "applyHanatos2025AdaptationWindow", "adaptationWindow", "hanatosWindow")));
    put(out, "hanatosSurface", bool(val(io, "applyHanatos2025AdaptationSurface", "adaptationSurface", "hanatosSurface")));
    put(out, "spectralBlur", num(val(io, "spectralGaussianBlur", "spectralBlur")));
    const rgb = mapRgbMethod(val(io, "rgbToRawMethod", "spectralUpsampling"));
    if (rgb) out.rgbToRawMethod = rgb;
  }

  // Spektrafilm GUI: input_image is the source file, not the look.
  const guiIn = asRec(p.input_image) ?? asRec(p.inputImage);
  if (guiIn) {
    put(out, "hanatosWindow", bool(val(guiIn, "applyHanatos2025AdaptationWindow", "hanatosWindow")));
    put(out, "hanatosSurface", bool(val(guiIn, "applyHanatos2025AdaptationSurface", "hanatosSurface")));
    put(out, "spectralBlur", num(val(guiIn, "spectralGaussianBlur", "spectralBlur")));
    const rgb = mapRgbMethod(val(guiIn, "rgbToRawMethod", "spectralUpsampling"));
    if (rgb) out.rgbToRawMethod = rgb;
  }

  const rawWb = asRec(p.raw) ?? asRec(p.load_raw) ?? asRec(p.loadRaw);
  if (rawWb) {
    put(out, "whiteBalance", str(val(rawWb, "whiteBalance")) as DarkroomParams["whiteBalance"]);
    put(out, "temperature", num(val(rawWb, "temperature")));
    put(out, "tint", num(val(rawWb, "tint")));
    Object.assign(out, sanitizeWb(out));
  }

  const disp = asRec(p.display);
  if (disp) {
    put(out, "gray18Canvas", bool(val(disp, "gray18Canvas")));
    put(out, "whitePadding", num(val(disp, "whitePadding")));
  }

  const ig = mapInputGamut(p.inputGamutCompress ?? p.input_gamut_compress);
  if (ig) out.inputGamutCompress = ig;
  const og = mapOutputGamut(p.outputGamutCompress ?? p.output_gamut_compress);
  if (og) out.outputGamutCompress = og;

  const film = asRec(p.filmRender);
  if (film) {
    put(out, "filmGamma", num(val(film, "densityCurveGamma", "filmGamma")));
    const g = asRec(val(film, "grain"));
    if (g) applyGrain(out, g);
    const h = asRec(val(film, "halation"));
    if (h) applyHalation(out, h);
    const c = asRec(val(film, "dirCouplers") ?? val(film, "couplers"));
    if (c) applyCouplers(out, c);
    const gl = asRec(val(film, "glare"));
    if (gl) {
      put(out, "glareActive", bool(val(gl, "active")));
      put(out, "glarePercent", num(val(gl, "percent", "glarePercent")));
      put(out, "glareRoughness", num(val(gl, "roughness")));
      put(out, "glareBlur", num(val(gl, "blur")));
    }
  }
  if (asRec(p.grain)) applyGrain(out, asRec(p.grain)!);
  if (asRec(p.halation)) applyHalation(out, asRec(p.halation)!);
  if (asRec(p.couplers) || asRec(p.dirCouplers)) applyCouplers(out, asRec(p.couplers) ?? asRec(p.dirCouplers)!);

  const print = asRec(p.printRender);
  if (print) {
    put(out, "printGamma", num(val(print, "densityCurveGamma", "printGamma")));
    const morph = asRec(val(print, "densityCurvesMorph"));
    if (morph) applyChemistry(out, morph, "print");
  }

  const filmChem = asRec(p.film_chemistry) ?? asRec(p.filmChemistry) ?? asRec(p.experimental);
  const printChem = asRec(p.chemistry) ?? asRec(p.print_chemistry);
  if (filmChem) applyChemistry(out, filmChem, "film");
  if (printChem) applyChemistry(out, printChem, "print");

  const exp = asRec(p.experimental);
  if (exp) {
    put(out, "filmGamma", num(val(exp, "filmGammaFactor", "filmGamma")));
    put(out, "chemistryActive", bool(val(exp, "morphActive", "chemistryActive")));
    put(out, "printGamma", num(val(exp, "morphGammaFactor", "printGamma")));
    put(out, "printGammaFast", num(val(exp, "morphGammaFactorFast")));
    put(out, "printGammaSlow", num(val(exp, "morphGammaFactorSlow")));
    put(out, "printGammaR", num(val(exp, "morphGammaFactorRed")));
    put(out, "printGammaG", num(val(exp, "morphGammaFactorGreen")));
    put(out, "printGammaB", num(val(exp, "morphGammaFactorBlue")));
    put(out, "developerExhaustion", num(val(exp, "morphDeveloperExhaustion")));
  }

  const set = asRec(p.settings);
  if (set) {
    const m = mapRgbMethod(val(set, "rgbToRawMethod", "spectralUpsampling"));
    if (m) out.rgbToRawMethod = m;
    put(out, "hanatosWindow", bool(val(set, "applyHanatos2025AdaptationWindow", "adaptationWindow", "hanatosWindow")));
    put(out, "hanatosSurface", bool(val(set, "applyHanatos2025AdaptationSurface", "adaptationSurface", "hanatosSurface")));
    put(out, "spectralBlur", num(val(set, "spectralGaussianBlur", "spectralBlur")));
    put(out, "useEnlargerLut", bool(val(set, "useEnlargerLut")));
    put(out, "useScannerLut", bool(val(set, "useScannerLut")));
    put(out, "lutResolution", num(val(set, "lutResolution")));
    put(out, "useFastStats", bool(val(set, "useFastStats")));
    put(out, "gpuPreview", bool(val(set, "gpuPreview", "gpuEngine")));
    put(out, "gpuExport", bool(val(set, "gpuExport")));
    put(out, "rawEngine", str(val(set, "rawEngine", "renderingEngine")));
    put(out, "rawEngineStyle", str(val(set, "rawEngineStyle", "hncsStyle", "lumixPhotoStyle")));
    put(out, "previewMaxSize", num(val(set, "previewMaxSize")));
  }

  const tc = asRec(p.toneCurve);
  if (tc) {
    put(out, "toneCurveActive", bool(val(tc, "active", "toneCurveActive")));
    put(out, "toneCurveMaster", points(val(tc, "master", "toneCurveMaster")));
    put(out, "toneCurveRed", points(val(tc, "red", "toneCurveRed")));
    put(out, "toneCurveGreen", points(val(tc, "green", "toneCurveGreen")));
    put(out, "toneCurveBlue", points(val(tc, "blue", "toneCurveBlue")));
  }

  const glare = asRec(p.glare);
  if (glare) {
    put(out, "glareActive", bool(val(glare, "active")));
    put(out, "glarePercent", num(val(glare, "percent")));
    put(out, "glareRoughness", num(val(glare, "roughness")));
    put(out, "glareBlur", num(val(glare, "blur")));
  }

  const uv = arr(p.filterUv);
  if (uv) put(out, "filterUvAmount", num(uv[0]));
  const ir = arr(p.filterIr);
  if (ir) put(out, "filterIrAmount", num(ir[0]));

  // Later nests win. simulation last so film/paper/print filters from the GUI stick.
  for (const nest of [
    p.io,
    p.input,
    p.output,
    p.load_raw,
    p.loadRaw,
    p.raw,
    p.preflashing,
    p.enlarger,
    p.scanner,
    p.experimental,
    p.settings,
    p.camera,
    p.simulation,
  ]) {
    flattenScalars(out, nest);
  }

  const sim = asRec(p.simulation);
  if (sim) {
    put(out, "filmStock", pickFilmStock(p));
    put(out, "printPaper", pickPrintPaper(p));
    applyPrintBlock(out, sim);
    const simCs = mapColorSpace(val(sim, "outputColorSpace", "savingColorSpace"));
    if (simCs) out.exportColorSpace = simCs;
    put(out, "outputCctf", bool(val(sim, "savingCctfEncoding", "outputCctf")));
    put(out, "autoPreview", bool(val(sim, "autoPreview")));
  }

  return sanitizeWb(out as unknown as DarkroomParams);
}

function asLook(name: string, params: DarkroomParams): Look {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `look-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name: name || "JSON", at: Date.now(), params };
}

function hasRecipe(o: Record<string, unknown>): boolean {
  const nested = asRec(o.params);
  const sim = asRec(o.simulation) ?? (nested ? asRec(nested.simulation) : null);
  const hit = (x: Record<string, unknown> | null) =>
    Boolean(
      x &&
        (x.filmProfile ||
          x.filmStock ||
          x.film_profile ||
          x.film_stock ||
          x.printProfile ||
          x.printPaper ||
          x.print_profile ||
          x.print_paper ||
          x.camera ||
          x.filmRender ||
          x.enlarger ||
          x.printRender ||
          x.simulation ||
          x.preflashing ||
          (sim && (sim.film_stock || sim.filmStock || sim.filmProfile || sim.print_paper))),
    );
  return hit(o) || hit(nested);
}

export function fileStem(name?: string | null): string | undefined {
  if (!name) return undefined;
  const base = String(name).split(/[\\/]/).pop() ?? String(name);
  const stem = base.replace(/\.(json|txt|preset)$/i, "").trim();
  return stem || undefined;
}

function lookName(o: Record<string, unknown>, params: DarkroomParams, hint?: string): string {
  const sim = asRec(o.simulation);
  const nested = asRec(o.params);
  return (
    fileStem(hint) ||
    str(o.name) ||
    str(o.title) ||
    str(o.sourceName) ||
    str(nested?.name) ||
    str(o.id) ||
    str(sim?.film_stock) ||
    str(params.filmStock) ||
    "JSON"
  );
}

function lookFromEntry(o: Record<string, unknown>, hint?: string): Look | null {
  const nested = asRec(o.params);
  if (!hasRecipe(o) && !nested) return null;
  const params = nested ? spektraToParams({ ...o, params: nested }) : spektraToParams(o);
  if (!hasRecipe(o) && params.filmStock === defaultParams().filmStock && params.printPaper === defaultParams().printPaper) {
    return null;
  }
  return asLook(lookName(o, params, hint), params);
}

function fromObject(o: Record<string, unknown>, hint?: string): Look[] {
  if (Array.isArray(o.looks)) return parsePresetJson(o.looks);
  if (Array.isArray(o.presets)) return parsePresetJson(o.presets);
  const look = lookFromEntry(o, hint);
  return look ? [look] : [];
}

export function unwrapPresetText(text: string): string {
  let t = text.replace(/^\uFEFF/, "").trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  return t;
}

export function isPresetUrl(text: string): boolean {
  return /^https?:\/\//i.test(text) && !text.includes("{");
}

export function parsePresetJson(raw: unknown, sourceName?: string): Look[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.flatMap((item) => parsePresetJson(item, sourceName));
  if (typeof raw === "string") {
    const t = unwrapPresetText(raw);
    if (!t || isPresetUrl(t)) return [];
    try {
      return parsePresetJson(JSON.parse(t), sourceName);
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") return fromObject(raw as Record<string, unknown>, sourceName);
  return [];
}

export function serializeLook(name: string, params: DarkroomParams): string {
  return JSON.stringify(
    {
      name,
      app: "kirillkovaya-plenka",
      version: 1,
      filmProfile: params.filmStock,
      printProfile: params.printPaper,
      params,
    },
    null,
    2,
  );
}
