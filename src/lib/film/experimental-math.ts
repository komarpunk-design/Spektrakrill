// GPLv3. Port of spektrafilm experimental @28bf883, utils/morph_curves.py.
import type { FilmProfile, Vec3 } from "./types.ts";
import type { ExperimentalParams } from "./experimental.ts";
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function normal(z: number): number {
  // erf approximation (max absolute error < 1.5e-7); native uses std::erfc.
  const x = Math.abs(z) / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
}
function cdf(z: number, type: string, alpha: number, mix: number): number {
  let value = normal(z);
  if (type === "sept_norm_cdfs") {
    const u = clamp(z / 5.8013 + 0.5, 0, 1),
      v = clamp(u + alpha * u * (1 - u) * (2 * u - 1) ** 2, 0, 1);
    value = v ** 4 * (35 + v * (-84 + v * (70 - 20 * v)));
  }
  if (mix > 0) {
    const location = -Math.log(Math.log(2)),
      width = 0.5 * Math.log(2) * Math.sqrt(2 * Math.PI);
    value = (1 - mix) * value + mix * Math.exp(-Math.exp(-(z / width + location)));
  }
  return value;
}
export type MorphControls = {
  gamma: number;
  fast: number;
  slow: number;
  red: number;
  green: number;
  blue: number;
  exhaustion: number;
};
function morphProfileCurves(
  profile: FilmProfile,
  p: MorphControls,
): { curves: Vec3[]; layers: Vec3[][] } {
  const model = profile.densityModel;
  if (!model) throw new Error("У профиля нет модели слоёв для проявки");
  const count = profile.densityCurves.length,
    out = Array.from({ length: count }, () => [0, 0, 0] as Vec3);
  const layers = Array.from({ length: count }, () =>
    Array.from({ length: model.centers[0].length }, () => [0, 0, 0] as Vec3),
  );
  for (let c = 0; c < 3; c++) {
    const mu = model.centers[c].slice(),
      sigma = model.sigmas[c].slice(),
      amp = model.amplitudes[c],
      alpha = model.alphas?.[c] ?? mu.map(() => 0);
    const order = mu.map((_, i) => i).sort((a, b) => mu[a] - mu[b]),
      indices = [order[0], order[Math.floor(order.length / 2)], order.at(-1)!];
    const factors = [p.fast, p.slow, p.slow].map(
      (f) => f * p.gamma * [p.red, p.green, p.blue][profile.monochrome ? 0 : c],
    );
    for (let k = 0; k < 3; k++) {
      const i = indices[k];
      mu[i] /= factors[k];
      sigma[i] = Math.max(0.05, sigma[i] / factors[k]);
    }
    const sign = profile.type === "positive" ? -1 : 1;
    const evaluate = (offset: number, mix: number) =>
      mu.reduce(
        (s, m, i) =>
          s + amp[i] * cdf((sign * (-m - offset)) / sigma[i], model.model_type, alpha[i], mix),
        0,
      );
    let offset = 0;
    if (p.exhaustion > 0) {
      const target = evaluate(0, 0),
        residual = (x: number) => evaluate(x, p.exhaustion) - target;
      if (Math.abs(residual(0)) > 1e-12) {
        let lo = -0.25,
          hi = 0.25,
          a = residual(lo),
          b = residual(hi);
        for (let attempt = 0; attempt < 12; attempt++) {
          if (a === 0) {
            offset = lo;
            break;
          }
          if (b === 0) {
            offset = hi;
            break;
          }
          if (a * b < 0) {
            for (let n = 0; n < 80; n++) {
              const mid = (lo + hi) / 2,
                r = residual(mid);
              if (a * r <= 0) {
                hi = mid;
                b = r;
              } else {
                lo = mid;
                a = r;
              }
            }
            offset = (lo + hi) / 2;
            break;
          }
          lo *= 2;
          hi *= 2;
          a = residual(lo);
          b = residual(hi);
        }
      }
    }
    for (let k = 0; k < count; k++) {
      const x =
        profile.logExposure.min +
        ((profile.logExposure.max - profile.logExposure.min) * k) / (count - 1);
      out[k][c] = mu.reduce((s, m, i) => {
        const d =
          amp[i] *
          cdf((sign * (x - m - offset)) / sigma[i], model.model_type, alpha[i], p.exhaustion);
        layers[k][i][c] = d;
        return s + d;
      }, 0);
    }
  }
  return { curves: out, layers };
}
export function morphDensityCurves(profile: FilmProfile, p: MorphControls): Vec3[] {
  return morphProfileCurves(profile, p).curves;
}
function smooth(values: number[], sigma: number): number[] {
  const r = Math.floor(4 * sigma + 0.5),
    weights = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2)),
    sum = weights.reduce((a, b) => a + b, 0),
    n = values.length;
  const reflect = (i: number) => {
    while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1;
    return i;
  };
  return values.map((_, i) =>
    weights.reduce((s, w, k) => s + (w * values[reflect(i + k - r)]) / sum, 0),
  );
}
function interp(x: number, xp: number[], yp: number[]): number {
  if (x <= xp[0]) return yp[0];
  if (x >= xp.at(-1)!) return yp.at(-1)!;
  let i = 0;
  while (x > xp[i + 1]) i++;
  const t = (x - xp[i]) / (xp[i + 1] - xp[i]);
  return yp[i] * (1 - t) + yp[i + 1] * t;
}
export function tunedBase(profile: FilmProfile, e: ExperimentalParams, film: boolean): Vec3 {
  const scale = film ? e.filmBaseScale : e.printBaseScale,
    tilt = film ? e.filmBaseTilt : 0,
    channels = film
      ? [e.filmBaseYellow, e.filmBaseMagenta, e.filmBaseCyan]
      : [e.printBaseYellow, e.printBaseMagenta, e.printBaseCyan];
  if (channels.every((x) => x === 1) && tilt === 0)
    return profile.baseRgbOd.map((x) => x * scale) as Vec3;
  if (!profile.baseSpectrum || !profile.wavelengths)
    throw new Error("У профиля нет спектральных данных основы");
  const wl = profile.wavelengths,
    base = profile.baseSpectrum.map((x) => x ?? 0),
    spacing = (wl.at(-1)! - wl[0]) / (wl.length - 1),
    peaks = film ? [460, 555, 650] : [445, 530, 610];
  const a = film ? channels : channels.map((x, i) => x * interp(peaks[i], wl, base));
  const factors = smooth(
      wl.map((x) => interp(x, peaks, a)),
      (film ? 35 : 20) / spacing,
    ),
    tilts = smooth(
      wl.map((x) => Math.max(0, 1 + (tilt / 95) * (x - 555))),
      35 / spacing,
    );
  const result = factors.map((x, i) => (film ? base[i] * scale * x * tilts[i] * scale : x * scale));
  return [650, 555, 460].map((x) => interp(x, wl, result)) as Vec3;
}
export function withExperimentalProfile(
  profile: FilmProfile,
  e: ExperimentalParams,
  film: boolean,
  morph?: MorphControls,
): FilmProfile {
  let out = profile;
  if (morph) {
    const { curves, layers } = morphProfileCurves(profile, morph);
    out = {
      ...out,
      densityLayers: layers,
      densityCurves: curves,
      dmin: [0, 1, 2].map((c) => Math.min(...curves.map((v) => v[c]))) as Vec3,
      dmax: [0, 1, 2].map((c) => Math.max(...curves.map((v) => v[c]))) as Vec3,
    };
  }
  if (film ? e.filmBaseActive : e.printBaseActive)
    out = { ...out, baseRgbOd: tunedBase(profile, e, film) };
  return out;
}

/** Experimental grain.py::_coarsest_area_from_curves, 48 µm aperture. */
export function rmsParticleAreas(profile: FilmProfile, e: ExperimentalParams): Vec3 {
  const layers = profile.densityLayers ?? profile.densityCurves.map((c) => [c]);
  const scale = [e.grainScaleFast, e.grainScaleMid, e.grainScaleSlow];
  return [0, 1, 2].map((c) => {
    const maximum = layers[0].map((_, l) => Math.max(...layers.map((row) => row[l][c]))),
      total = maximum.reduce((a, b) => a + b, 0);
    const floor = [e.grainFloorRed, e.grainFloorGreen, e.grainFloorBlue][
        profile.monochrome ? 0 : c
      ],
      u = [e.grainUniformityRed, e.grainUniformityGreen, e.grainUniformityBlue][
        profile.monochrome ? 0 : c
      ];
    const peak = Math.max(
      ...layers.map((row) =>
        row.reduce((sum, layer, l) => {
          const frac = maximum[l] / total;
          if (!(frac > 0)) return sum;
          const d = layer[c] + frac * floor;
          return sum + (scale[l] / frac) * d * (maximum[l] + frac * floor - u * d);
        }, 0),
      ),
    );
    return (
      (([e.grainRmsRed, e.grainRmsGreen, e.grainRmsBlue][profile.monochrome ? 0 : c] / 1000) ** 2 *
        (Math.PI * 24 * 24)) /
      Math.max(peak, 1e-9)
    );
  }) as Vec3;
}
