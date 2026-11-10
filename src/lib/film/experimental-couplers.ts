// GPLv3. Spektrafilm experimental @28bf883: donor/receiver Langmuir DIR model.
import type { DarkroomParams, FilmProfile } from "./types.ts";
import { blurPlane } from "./spatial.ts";
function interp(x: number, xp: number[], yp: number[]): number {
  if (x <= xp[0]) return yp[0];
  if (x >= xp.at(-1)!) return yp.at(-1)!;
  let lo = 0,
    hi = xp.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (x >= xp[m]) lo = m;
    else hi = m;
  }
  const d = xp[hi] - xp[lo];
  return d === 0 ? yp[lo] : yp[lo] + ((yp[hi] - yp[lo]) * (x - xp[lo])) / d;
}
export function applyLangmuirCouplers(
  planes: Float32Array[],
  logRaw: Float32Array[],
  w: number,
  h: number,
  profile: FilmProfile,
  p: DarkroomParams,
  pixelUm: number,
): void {
  if (!p.couplersActive) return;
  const e = p.experimental,
    count = w * h,
    n = profile.densityCurves.length,
    positive = profile.type === "positive",
    gamma = e.filmChemistry ? 1 : p.filmGamma;
  const floor = [0, 1, 2].map((c) => Math.min(...profile.densityCurves.map((d) => d[c]))),
    dc = profile.densityCurves.map((d) => d.map((v, c) => v - floor[c]));
  const max = [0, 1, 2].map((c) => Math.max(...dc.map((d) => d[c]))),
    ref = max.map((d) => d * 0.5),
    k = max.map(
      (d, c) => d * [e.dirDonorRed, e.dirDonorGreen, e.dirDonorBlue][profile.monochrome ? 0 : c],
    );
  const unit = [
    [
      p.gammaSamelayer[0] * p.inhibitionSamelayer,
      p.gammaRtoGB[0] * p.inhibitionInterlayer,
      p.gammaRtoGB[1] * p.inhibitionInterlayer,
    ],
    [
      p.gammaGtoRB[0] * p.inhibitionInterlayer,
      p.gammaSamelayer[1] * p.inhibitionSamelayer,
      p.gammaGtoRB[1] * p.inhibitionInterlayer,
    ],
    [
      p.gammaBtoRG[0] * p.inhibitionInterlayer,
      p.gammaBtoRG[1] * p.inhibitionInterlayer,
      p.gammaSamelayer[2] * p.inhibitionSamelayer,
    ],
  ];
  if (profile.monochrome)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        unit[a][b] = a !== b ? 0 : p.gammaSamelayer[0] * p.inhibitionSamelayer;
  const receiverRef = [0, 1, 2].map((c) => ref.reduce((s, d, j) => s + d * unit[j][c], 0)),
    kr = receiverRef.map(
      (d, c) =>
        2 *
        d *
        [e.dirReceiverRed, e.dirReceiverGreen, e.dirReceiverBlue][profile.monochrome ? 0 : c],
    );
  const donor = (d: number, c: number) =>
    positive ? d : k[c] + d !== 0 ? (d * (k[c] + ref[c])) / (k[c] + d) : 0;
  const receiver = (d: number, c: number) =>
    !positive ? d : kr[c] + d !== 0 ? (d * (kr[c] + receiverRef[c])) / (kr[c] + d) : 0;
  const axis = Array.from(
    { length: n },
    (_, i) =>
      profile.logExposure.min + ((profile.logExposure.max - profile.logExposure.min) * i) / (n - 1),
  );
  const original = [0, 1, 2].map((c) => dc.map((row) => row[c]));
  const precorrected = [0, 1, 2].map((c) => {
    const xp = axis.map(
      (x, i) =>
        x -
        receiver(
          dc[i].reduce(
            (s, d, j) => s + donor(positive ? max[j] - d : d, j) * unit[j][c] * p.couplersAmount,
            0,
          ),
          c,
        ),
    );
    return axis.map((x) => interp(x, xp, original[c]));
  });
  const correction = [0, 1, 2].map((c) =>
    Float32Array.from({ length: count }, (_, i) =>
      planes.reduce(
        (s, d, j) => s + donor(positive ? max[j] - d[i] : d[i], j) * unit[j][c] * p.couplersAmount,
        0,
      ),
    ),
  );
  if (p.couplerDiffusionUm > 0 && pixelUm > 0)
    for (let c = 0; c < 3; c++) {
      const input = correction[c],
        core = blurPlane(input, w, h, p.couplerDiffusionUm / pixelUm),
        out = Float32Array.from(core, (v) => v * (1 - e.dirTailWeight));
      for (const [weight, ratio] of [
        [0.1633, 0.536],
        [0.6496, 1.5236],
        [0.187, 2.7684],
      ]) {
        const tail = blurPlane(input, w, h, (e.dirTailUm / pixelUm) * ratio);
        for (let i = 0; i < count; i++) out[i] += tail[i] * weight * e.dirTailWeight;
      }
      correction[c] = out;
    }
  const xp = axis.map((x) => x / gamma);
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < count; i++)
      planes[c][i] = interp(logRaw[c][i] - receiver(correction[c][i], c), xp, precorrected[c]);
}
