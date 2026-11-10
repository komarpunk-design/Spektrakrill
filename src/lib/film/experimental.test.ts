import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  defaultExperimental,
  sanitizeExperimental,
  experimentalGrainPreset,
  experimentalCouplersPreset,
} from "./experimental.ts";
import { defaultParams } from "./defaults.ts";
import { spektraToParams } from "./preset-json.ts";
import type { FilmProfile } from "./types.ts";
test("old settings get neutral experimental defaults; corrupt controls are bounded", () => {
  assert.deepEqual(sanitizeExperimental(undefined), defaultExperimental());
  const e = sanitizeExperimental({
    filmFast: NaN,
    filmBaseScale: -1,
    grainUniformityRed: 5,
    spectralMethod: "fake",
    workflow: "fake",
    scanExposure: -100,
    scanIlluminant: "fake",
    scanCalibration: "x".repeat(800),
  });
  assert.equal(e.filmFast, 1);
  assert.equal(e.filmBaseScale, 0);
  assert.equal(e.grainUniformityRed, 1);
  assert.equal(e.spectralMethod, "legacy");
  assert.equal(e.workflow, "normal");
  assert.equal(e.scanExposure, -12);
  assert.equal(e.scanIlluminant, "D55");
  assert.equal(e.scanCalibration.length, 512);
});
test("stock presets preserve unrelated controls and source data", () => {
  const p = JSON.parse(
    readFileSync(
      new URL("../../../public/profiles/exp_kodak_portra_400.json", import.meta.url),
      "utf8",
    ),
  ) as FilmProfile;
  const params = { ...defaultParams(), filmGamma: 1.2, exposureCompensationEv: -1 };
  const g = experimentalGrainPreset(p, params),
    dir = experimentalCouplersPreset(p, params);
  assert.equal(g.experimental?.grainRms, true);
  assert.equal(g.experimental?.filmFast, params.experimental.filmFast);
  assert.equal(dir.experimental?.dirLangmuir, true);
  assert.equal("filmGamma" in g, false);
  assert.equal("exposureCompensationEv" in dir, false);
  assert.equal(params.experimental.grainRms, false);
});
test("imports experimental Python schema rather than silently dropping it", () => {
  const p = spektraToParams({
    film_profile: "kodak_doublex",
    print_profile: "kodak_portra_endura",
    camera: { color_filter: "hoya_y2" },
    film_render: {
      chemistry: {
        active: true,
        development_time: 9,
        gamma_factor: 1.2,
        gamma_factor_fast: 0.8,
        developer_exhaustion: 0.4,
      },
      base: { active: true, scale: 0.8, cyan: 1.3 },
      grain: {
        rms_granularity: [4, 7, 9],
        particle_scale_sublayers: [1, 0.4, 0.1],
        mult_usm_amount: 2,
      },
      dir_couplers: { langmuir_donor_k_rgb: [0.5, 1, 2], diffusion_tail_um: 300 },
      convert: {
        scan_illuminant: "D65",
        exposure_compensation_ev: 1,
        calibration: "1 0 0 0 1 0 0 0 1",
      },
    },
    print_render: { chemistry: { active: true, gamma_factor_slow: 1.1 } },
    settings: { rgb_to_raw_method: "otsu2018", use_convert_lut: false },
    workflow: { route: "input > convert-film > print > scan" },
  });
  assert.equal(p.filmStock, "exp_kodak_doublex_9min");
  assert.equal(p.filmGamma, 1.2);
  assert.equal(p.experimental.filmChemistry, true);
  assert.equal(p.experimental.filmFast, 0.8);
  assert.equal(p.experimental.filmExhaustion, 0.4);
  assert.equal(p.experimental.filmBaseScale, 0.8);
  assert.equal(p.experimental.grainRmsGreen, 7);
  assert.equal(p.experimental.grainScaleMid, 0.4);
  assert.equal(p.experimental.grainUsmAmount, 2);
  assert.equal(p.experimental.dirDonorRed, 0.5);
  assert.equal(p.experimental.dirTailUm, 300);
  assert.equal(p.experimental.colorFilter, "hoya_y2");
  assert.equal(p.experimental.scanExposure, 1);
  assert.equal(p.experimental.scanIlluminant, "D65");
  assert.equal(p.experimental.spectralMethod, "otsu2018");
  assert.equal(p.experimental.workflow, "negative-print");
  assert.equal(p.experimental.scanUseLut, false);
  assert.equal(p.printGammaSlow, 1.1);
});
test("our complete experimental settings survive preset roundtrip", () => {
  const p = defaultParams();
  p.experimental = {
    ...p.experimental,
    filmFast: 1.3,
    filmChemistry: true,
    spectralMethod: "arctic2026beta04",
    scanCalibration: "1 .1 0 0 1 0 0 0 1",
  };
  assert.deepEqual(spektraToParams(JSON.parse(JSON.stringify(p))).experimental, p.experimental);
});
