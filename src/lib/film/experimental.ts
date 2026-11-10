import scanIlluminants from "./experimental-illuminants.json" with { type: "json" };
import couplersPresets from "./experimental-couplers-presets.json" with { type: "json" };
import grainPresets from "./experimental-grain-presets.json" with { type: "json" };
import type { DarkroomParams, FilmProfile } from "./types.ts";
// Experimental reference: andreavolpato/spektrafilm @28bf883. GPLv3.
export const defaultExperimental = () => ({
  workflow: "normal",
  scanIlluminant: "D55",
  scanExposure: 0,
  scanBasePercentile: 99,
  scanUseLut: true,
  scanCalibration: "1 0 0 0 1 0 0 0 1",
  filmChemistry: false,
  filmFast: 1,
  filmSlow: 1,
  filmRed: 1,
  filmGreen: 1,
  filmBlue: 1,
  filmExhaustion: 0,
  colorFilter: "none",
  filmBaseActive: false,
  filmBaseScale: 1,
  filmBaseTilt: 0,
  filmBaseCyan: 1,
  filmBaseMagenta: 1,
  filmBaseYellow: 1,
  printBaseActive: false,
  printBaseScale: 1,
  printBaseCyan: 1,
  printBaseMagenta: 1,
  printBaseYellow: 1,
  grainRms: false,
  grainRmsRed: 6,
  grainRmsGreen: 8,
  grainRmsBlue: 10,
  grainFloorRed: 0.03,
  grainFloorGreen: 0.03,
  grainFloorBlue: 0.03,
  grainUniformityRed: 0.97,
  grainUniformityGreen: 0.97,
  grainUniformityBlue: 0.97,
  grainScaleFast: 1,
  grainScaleMid: 0.5,
  grainScaleSlow: 0.25,
  grainUsmSigma: 0.7,
  grainUsmAmount: 1.5,
  dirLangmuir: false,
  dirDonorRed: 1,
  dirDonorGreen: 1,
  dirDonorBlue: 1,
  dirReceiverRed: 1,
  dirReceiverGreen: 1,
  dirReceiverBlue: 1,
  dirTailUm: 200,
  dirTailWeight: 0.03,
  spectralMethod: "legacy",
});
export type ExperimentalParams = {
  [K in keyof ReturnType<typeof defaultExperimental>]: ReturnType<
    typeof defaultExperimental
  >[K] extends boolean
    ? boolean
    : ReturnType<typeof defaultExperimental>[K] extends number
      ? number
      : string;
};
export function sanitizeExperimental(raw: unknown): ExperimentalParams {
  const base = defaultExperimental(),
    value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...base } as ExperimentalParams;
  for (const key of Object.keys(base) as (keyof ExperimentalParams)[]) {
    const v = value[key];
    if (typeof base[key] === "boolean")
      (out as Record<string, unknown>)[key] = typeof v === "boolean" ? v : base[key];
    else if (typeof base[key] === "number" && typeof v === "number" && Number.isFinite(v)) {
      const low =
        key === "scanExposure"
          ? -12
          : key.endsWith("Tilt")
            ? -2
            : key.endsWith("Exhaustion") ||
                key.includes("Base") ||
                key.includes("Floor") ||
                key.includes("Uniformity") ||
                key.includes("Usm") ||
                key.startsWith("dirTail")
              ? 0
              : 0.01;
      const high =
        key === "scanBasePercentile"
          ? 100
          : key === "scanExposure"
            ? 12
            : key === "dirTailUm"
              ? 1000
              : key === "dirTailWeight"
                ? 1
                : key.startsWith("dirDonor") || key.startsWith("dirReceiver")
                  ? 100
                  : key.endsWith("Tilt")
                    ? 2
                    : key.endsWith("Exhaustion") || key.includes("Uniformity")
                      ? 1
                      : key.includes("Floor")
                        ? 0.5
                        : key.startsWith("grainRms")
                          ? 100
                          : key.includes("UsmSigma")
                            ? 3
                            : key.includes("Base") ||
                                key.includes("Usm") ||
                                key.startsWith("grainScale")
                              ? 4
                              : 10;
      (out as Record<string, unknown>)[key] = Math.min(high, Math.max(low, v));
    }
  }
  out.workflow =
    typeof value.workflow === "string" &&
    ["normal", "negative-print", "negative-scan", "negative-clear"].includes(value.workflow)
      ? value.workflow
      : "normal";
  out.scanIlluminant =
    typeof value.scanIlluminant === "string" && scanIlluminants.includes(value.scanIlluminant)
      ? value.scanIlluminant
      : "D55";
  out.scanCalibration =
    typeof value.scanCalibration === "string"
      ? value.scanCalibration.slice(0, 512)
      : base.scanCalibration;
  out.spectralMethod =
    typeof value.spectralMethod === "string" &&
    [
      "legacy",
      "hanatos2025",
      "mallett2019",
      "otsu2018",
      "jakob2019",
      "arctic2026beta04",
      "gauss-lasers",
    ].includes(value.spectralMethod)
      ? value.spectralMethod
      : "legacy";
  out.colorFilter =
    typeof value.colorFilter === "string" &&
    ["none", "hoya_x0", "hoya_x1", "hoya_y2", "hoya_ya3", "hoya_r1"].includes(value.colorFilter)
      ? value.colorFilter
      : "none";
  return out;
}

/** Apply the reference's stock preset explicitly, preserving unrelated settings. */
export function experimentalGrainPreset(
  profile: FilmProfile,
  params: DarkroomParams,
): Partial<DarkroomParams> {
  const table = grainPresets as unknown as Record<string, unknown>;
  const defaults = table.defaults as Record<string, Record<string, Record<string, number[]>>>;
  const group = profile.monochrome ? "bw" : "color",
    preset = {
      ...defaults[group][profile.type],
      ...((table[profile.sourceStock ?? profile.id] as Record<string, number[]>) ?? {}),
    };
  const expand = (key: string, fallback: number[]) => {
    const value = preset[key] ?? fallback;
    return [0, 1, 2].map((i) => value[i] ?? value[0]);
  };
  const rms = expand("rms_granularity", [6, 8, 10]),
    floor = expand("density_min", [0.03, 0.03, 0.03]),
    uniformity = expand("uniformity", [0.97, 0.97, 0.97]),
    scales = preset.particle_scale_sublayers ?? [1, 0.5, 0.25];
  return {
    grainActive: true,
    grainBlur: 0.89,
    grainDyeCloudsUm: 2,
    experimental: {
      ...params.experimental,
      grainRms: true,
      grainRmsRed: rms[0],
      grainRmsGreen: rms[1],
      grainRmsBlue: rms[2],
      grainFloorRed: floor[0],
      grainFloorGreen: floor[1],
      grainFloorBlue: floor[2],
      grainUniformityRed: uniformity[0],
      grainUniformityGreen: uniformity[1],
      grainUniformityBlue: uniformity[2],
      grainScaleFast: scales[0],
      grainScaleMid: scales[1],
      grainScaleSlow: scales[2],
    },
  };
}

/** Reference defaults + stock override, applied on request as a single undo step. */
export function experimentalCouplersPreset(
  profile: FilmProfile,
  params: DarkroomParams,
): Partial<DarkroomParams> {
  const table = couplersPresets as unknown as Record<string, unknown>;
  const defaults = table.defaults as Record<string, Record<string, Record<string, number[]>>>;
  const preset = {
    ...defaults[profile.monochrome ? "bw" : "color"][profile.type],
    ...((table[profile.sourceStock ?? profile.id] as Record<string, number[]>) ?? {}),
  };
  const three = (name: string, fallback: number[]) => {
    const v = preset[name] ?? fallback;
    return [v[0], v[1] ?? v[0], v[2] ?? v[0]] as [number, number, number];
  };
  const two = (name: string) => {
    const v = preset[name] ?? [0, 0];
    return [v[0], v[1] ?? v[0]] as [number, number];
  };
  const donor = three("langmuir_donor_k_rgb", [1, 1, 1]),
    receiver = three("langmuir_receiver_k_rgb", [1, 1, 1]);
  return {
    couplersActive: true,
    gammaSamelayer: three("gamma_samelayer_rgb", [0.341, 0.324, 0.273]),
    gammaRtoGB: two("gamma_interlayer_r_to_gb"),
    gammaGtoRB: two("gamma_interlayer_g_to_rb"),
    gammaBtoRG: two("gamma_interlayer_b_to_rg"),
    couplerDiffusionUm: 20,
    experimental: {
      ...params.experimental,
      dirLangmuir: true,
      dirDonorRed: donor[0],
      dirDonorGreen: donor[1],
      dirDonorBlue: donor[2],
      dirReceiverRed: receiver[0],
      dirReceiverGreen: receiver[1],
      dirReceiverBlue: receiver[2],
      dirTailUm: 200,
      dirTailWeight: 0.03,
    },
  };
}
