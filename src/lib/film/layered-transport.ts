/** Apache-2.0. Port of Fotufilm LayeredTransport / HalationModel / radial stencil
 * code @b9049f3, MUAStudio Inc. Optical constructions retain CC BY-SA 4.0.
 * Three integrated-record Spektrafilm adapter; scope: docs/LAYERED_TRANSPORT.md. */
import data from "./layered-transport-data.json" with { type: "json" };
import { blurPlane } from "./spatial.ts";
export const defaultTransport = () => ({
  model: "legacy" as "legacy" | "layered",
  antiHalation: 1,
  baseThickness: 1,
  pressurePlate: 0,
  hazeUm: 0,
});
export type TransportParams = ReturnType<typeof defaultTransport>;
export function sanitizeTransport(raw: unknown): TransportParams {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {},
    p = defaultTransport();
  if (o.model === "layered") p.model = "layered";
  for (const [key, min, max] of [
    ["antiHalation", 0, 4],
    ["baseThickness", 0.25, 3],
    ["pressurePlate", 0, 1],
    ["hazeUm", 0, 500],
  ] as const) {
    const n = o[key];
    if (typeof n === "number" && Number.isFinite(n)) p[key] = Math.min(max, Math.max(min, n));
  }
  return p;
}
export type OpticalModel = {
  layers: { id: string; depth: number; n: number; absorption: number }[];
  source: number;
  q: number;
  capture: number;
  ratio: number;
  core: number;
  nFront: number;
  nRear: number;
  rear: number;
  plate: number;
};
const table = data as unknown as {
  models: Record<
    string,
    {
      layers: {
        id: string;
        thicknessMM: number;
        refractiveIndex: number[];
        absorptionPerMM: number[];
      }[];
      recordDepthMM: number[];
      angularExponent: number[][];
      captureProbability: number[][];
      returnedToDirect: number[][];
      coreSigmaMM: number[];
      frontIndex: number[];
      rearIndex: number[];
      rearReflectance?: number[];
      rearPlateReflectance?: number[];
    }
  >;
  films: Record<string, string>;
};
export function constructionCapabilities(film: string) {
  const model = table.models[table.films[film]];
  return {
    absorber:
      !model ||
      model.layers.some((l) => l.id !== "support" && l.absorptionPerMM.some((v) => v > 0)),
    plate: !model || !model.rearReflectance,
  };
}
export const constructionName = (film: string) =>
  table.films[film]
    ? `Конструкция Fotufilm · ${table.films[film]} (оценочная)`
    : "Общая конструкция Fotufilm (иллюстративная)";
export function construction(film: string, c: number, strengths: number[]): OpticalModel {
  const json = table.models[table.films[film]],
    band = [50, 33, 17][c],
    sample = (x: number[]) => (x.length === 1 ? x[0] : x[band]);
  if (!json)
    return {
      layers: [
        { id: "blue-coating", depth: 0.006, n: 1.52, absorption: 0.4 },
        { id: "green-coating", depth: 0.006, n: 1.52, absorption: 0.4 },
        { id: "red-coating", depth: 0.006, n: 1.52, absorption: 0.4 },
        { id: "support", depth: 0.13, n: 1.48, absorption: 0.2 },
      ],
      source: [0.0155, 0.0094, 0.0052][c],
      q: [2.2, 2, 1.8][c],
      capture: [0.35, 0.4, 0.5][c],
      ratio: strengths[c],
      core: 0.005,
      nFront: 1,
      nRear: 1,
      rear: -1,
      plate: -1,
    };
  return {
    layers: json.layers.map((l) => ({
      id: l.id,
      depth: l.thicknessMM,
      n: sample(l.refractiveIndex),
      absorption: sample(l.absorptionPerMM),
    })),
    source: json.recordDepthMM[c],
    q: sample(json.angularExponent[c]),
    capture: sample(json.captureProbability[c]),
    ratio: sample(json.returnedToDirect[c]),
    core: json.coreSigmaMM[c],
    nFront: sample(json.frontIndex),
    nRear: sample(json.rearIndex),
    rear: json.rearReflectance ? sample(json.rearReflectance) : -1,
    plate: json.rearPlateReflectance ? sample(json.rearPlateReflectance) : -1,
  };
}
export function adjusted(m: OpticalModel, p: TransportParams): OpticalModel {
  return {
    ...m,
    layers: m.layers.map((l) => ({
      ...l,
      depth: l.id === "support" ? l.depth * p.baseThickness : l.depth,
      absorption: l.id === "support" ? l.absorption : l.absorption * p.antiHalation,
    })),
    plate: m.rear < 0 && p.pressurePlate > 0 ? p.pressurePlate : m.plate,
  };
}
export function fresnel(n1: number, n2: number, invariant: number): [number, number] {
  if (invariant >= n1 || invariant >= n2) return [1, 1];
  const c1 = Math.sqrt(Math.max(0, 1 - (invariant / n1) ** 2)),
    c2 = Math.sqrt(Math.max(0, 1 - (invariant / n2) ** 2)),
    ds = n1 * c1 + n2 * c2,
    dp = n2 * c1 + n1 * c2;
  return [
    ds > 0 ? ((n1 * c1 - n2 * c2) / ds) ** 2 : 1,
    dp > 0 ? ((n2 * c1 - n1 * c2) / dp) ** 2 : 1,
  ];
}
export type Solve = {
  nodes: [number, number][];
  captured: number;
  unreturned: number;
  absorbed: number;
  escaped: number;
  unresolved: number;
};
export function solve(m: OpticalModel, angles = 512, tolerance = 1e-7): Solve {
  if (
    !m.layers.length ||
    m.layers.length > 16 ||
    angles < 32 ||
    angles > 8192 ||
    m.capture < 0.001 ||
    m.capture > 1 ||
    m.q < 0 ||
    m.q > 32
  )
    throw Error("Неверная оптическая конструкция");
  const positions = [0];
  for (const l of m.layers) {
    if (
      ![l.depth, l.n, l.absorption].every(Number.isFinite) ||
      l.depth <= 0 ||
      l.n < 1 ||
      l.n > 4 ||
      l.absorption < 0
    )
      throw Error("Неверный оптический слой");
    positions.push(positions.at(-1)! + l.depth);
  }
  if (m.source <= 0 || m.source >= positions.at(-1)!) throw Error("Приёмник вне слоёв");
  const edges = [...positions];
  if (!edges.includes(m.source)) edges.push(m.source);
  edges.sort((a, b) => a - b);
  const source = edges.indexOf(m.source),
    count = edges.length - 1,
    indices: number[] = [],
    absorption: number[] = [];
  for (let i = 0; i < count; i++) {
    const center = (edges[i] + edges[i + 1]) / 2;
    let j = 0;
    while (center >= positions[j + 1]) j++;
    indices.push(m.layers[j].n);
    absorption.push(m.layers[j].absorption);
  }
  type Packet = {
    layer: number;
    down: boolean;
    radius: number;
    s: number;
    p: number;
    returned: boolean;
    events: number;
    visits: number[];
  };
  const out: Solve = {
    nodes: [],
    captured: 0,
    unreturned: 0,
    absorbed: 0,
    escaped: 0,
    unresolved: 0,
  };
  for (let angle = 0; angle < angles; angle++) {
    const u = ((angle + 0.5) / angles) ** (1 / (m.q + 1)),
      invariant = indices[source] * Math.sqrt(Math.max(0, 1 - u * u)),
      weight = 0.5 / angles;
    let queue: Packet[] = [
      {
        layer: source,
        down: true,
        radius: 0,
        s: weight,
        p: weight,
        returned: false,
        events: 0,
        visits: Array(18).fill(0),
      },
    ];
    while (queue.length) {
      if (queue.length >= 200000) throw Error("Слишком много оптических путей");
      const next: Packet[] = [],
        lookup = new Map<string, number>();
      const enqueue = (p: Packet) => {
        const key = [p.layer, +p.down, +p.returned, ...p.visits].join(":");
        const index = lookup.get(key);
        if (index !== undefined) {
          next[index].s += p.s;
          next[index].p += p.p;
        } else {
          lookup.set(key, next.length);
          next.push(p);
        }
      };
      for (const old of queue) {
        const p = { ...old, visits: [...old.visits] },
          power = p.s + p.p;
        if (power < (tolerance * 1e-4) / angles || p.events >= 512) {
          out.unresolved += power;
          continue;
        }
        const j = p.layer,
          n = indices[j],
          cosine = Math.sqrt(Math.max(0, 1 - (invariant / n) ** 2));
        if (cosine <= 0) throw Error("Неверный угол преломления");
        const depth = edges[j + 1] - edges[j];
        p.visits[j]++;
        p.radius += (depth * invariant) / n / cosine;
        const survival = Math.exp((-absorption[j] * depth) / cosine);
        out.absorbed += power * (1 - survival);
        p.s *= survival;
        p.p *= survival;
        p.events++;
        const edge = p.down ? j + 1 : j;
        if (edge === source) {
          const scored = (p.s + p.p) * m.capture;
          if (p.returned && scored > 0) {
            out.nodes.push([p.radius, scored]);
            out.captured += scored;
          } else out.unreturned += scored;
          p.s *= 1 - m.capture;
          p.p *= 1 - m.capture;
        }
        const adjacent = p.down ? j + 1 : j - 1,
          exterior = adjacent < 0 || adjacent >= count,
          n2 = adjacent < 0 ? m.nFront : adjacent >= count ? m.nRear : indices[adjacent];
        let reflectance = fresnel(n, n2, invariant);
        if (adjacent >= count && m.rear >= 0) reflectance = [m.rear, m.rear];
        else if (adjacent >= count && m.plate >= 0)
          reflectance = reflectance.map((v) =>
            v >= 1 ? 1 : v + ((1 - v) ** 2 * m.plate) / (1 - v * m.plate),
          ) as [number, number];
        const rs = p.s * reflectance[0],
          rp = p.p * reflectance[1],
          ts = p.s - rs,
          tp = p.p - rp;
        if (adjacent >= count && (m.rear >= 0 || m.plate >= 0)) out.absorbed += ts + tp;
        else if (exterior) out.escaped += ts + tp;
        else if (ts + tp > 0) enqueue({ ...p, layer: adjacent, s: ts, p: tp });
        if (rs + rp > 0)
          enqueue({ ...p, down: !p.down, s: rs, p: rp, returned: p.returned || adjacent >= count });
      }
      queue = next;
    }
  }
  if (out.unresolved > tolerance) throw Error("Не сошёлся баланс энергии");
  out.nodes.sort((a, b) => a[0] - b[0]);
  if (out.captured > 0) for (const node of out.nodes) node[1] /= out.captured;
  return out;
}
export function adjustedReturn(
  ratio: number,
  film: number,
  current: number,
  lossless: number,
  physical: number,
) {
  if (current <= 0 || film <= 0) return 0;
  if (ratio <= 0 || lossless <= film * (1 + 1e-9)) return current / film;
  const launch = ratio / film,
    w = Math.log(lossless / current) / Math.log(lossless / film);
  return (current / film) * (physical / launch) ** (1 - w);
}
function coarsen(nodes: [number, number][], maximum = 512) {
  if (nodes.length <= maximum) return nodes;
  const out: [number, number][] = [],
    capacity = 1 / maximum;
  let used = 0,
    moment = 0;
  for (const [r, m] of nodes) {
    let remaining = m;
    while (remaining > 1e-16) {
      const take = Math.min(remaining, capacity - used);
      used += take;
      moment += r * take;
      remaining -= take;
      if (used >= capacity - 1e-14) {
        out.push([moment / used, used]);
        used = moment = 0;
      }
    }
  }
  if (used > 1e-14) out.push([moment / used, used]);
  return out;
}
type Stencil = { stride: number; radius: number; weight: number; values: Float64Array };
function stencils(nodes: [number, number][], pitch: number): Stencil[] {
  const groups = new Map<number, [number, number][]>();
  for (const node of nodes) {
    let stride = 1;
    while (node[0] / pitch / stride + 1 > 12 && stride <= 4096) stride *= 2;
    if (stride > 4096) throw Error("Слишком широкое гало");
    if (!groups.has(stride)) groups.set(stride, []);
    groups.get(stride)!.push(node);
  }
  const out: Stencil[] = [];
  for (const [stride, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const sum = group.reduce((s, n) => s + n[1], 0);
    let reach = 0,
      cumulative = 0;
    for (const n of group) {
      cumulative += n[1];
      if (cumulative >= sum * (1 - 1e-4)) {
        reach = n[0] / pitch;
        break;
      }
    }
    const radius = Math.max(1, Math.ceil(reach / stride) + 1),
      side = 2 * radius + 1,
      values = new Float64Array(side * side);
    for (const [r, m] of group) {
      const px = r / pitch;
      if (px > reach + 1e-9) continue;
      const distance = px / stride,
        angles = Math.max(32, Math.ceil(2 * Math.PI * distance * 12));
      for (let k = 0; k < angles; k++) {
        const phi = (2 * Math.PI * (k + 0.5)) / angles,
          x = distance * Math.cos(phi),
          y = distance * Math.sin(phi),
          ix = Math.floor(x),
          iy = Math.floor(y),
          fx = x - ix,
          fy = y - iy;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++)
            values[(iy + dy + radius) * side + ix + dx + radius] +=
              (m * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy)) / angles;
      }
    }
    const norm = values.reduce((a, b) => a + b, 0);
    if (norm <= 0) throw Error("Пустое ядро переноса");
    for (let i = 0; i < values.length; i++) values[i] /= norm;
    out.push({ stride, radius, weight: sum, values });
  }
  return out;
}
const prepared = new Map<string, { kernels: Stencil[][]; ratio: number[]; core: number[] }>();
function prepare(film: string, p: TransportParams, strengths: number[], pitch: number) {
  const key = JSON.stringify([
      film,
      p.antiHalation,
      p.baseThickness,
      p.pressurePlate,
      pitch,
      strengths,
    ]),
    hit = prepared.get(key);
  if (hit) return hit;
  const result = { kernels: [] as Stencil[][], ratio: [] as number[], core: [] as number[] };
  for (let c = 0; c < 3; c++) {
    const original = construction(film, c, strengths),
      model = adjusted(original, p),
      solved = solve(model);
    let factor = 1;
    if (p.antiHalation !== 1 || p.baseThickness !== 1 || p.pressurePlate !== 0) {
      const reference = solve(original),
        bare = solve(adjusted(original, { ...defaultTransport(), antiHalation: 0 }));
      factor = adjustedReturn(
        original.ratio,
        reference.captured,
        solved.captured,
        bare.captured,
        (1 - original.capture) / original.capture,
      );
    }
    result.kernels.push(stencils(coarsen(solved.nodes), pitch));
    result.ratio.push(original.ratio * factor);
    result.core.push(original.core);
  }
  if (prepared.size >= 12) prepared.delete(prepared.keys().next().value!);
  prepared.set(key, result);
  return result;
}
function spread(source: Float32Array, w: number, h: number, kernels: Stencil[]) {
  const out = new Float32Array(w * h);
  let level = source,
    lw = w,
    lh = h,
    stride = 1;
  for (const s of kernels) {
    while (stride < s.stride) {
      const nw = Math.ceil(lw / 2),
        nh = Math.ceil(lh / 2),
        coarse = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++)
        for (let x = 0; x < nw; x++) {
          let sum = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              sum += level[Math.min(2 * y + dy, lh - 1) * lw + Math.min(2 * x + dx, lw - 1)];
          coarse[y * nw + x] = sum * 0.25;
        }
      level = coarse;
      lw = nw;
      lh = nh;
      stride *= 2;
    }
    const convolved = new Float32Array(lw * lh),
      side = 2 * s.radius + 1;
    for (let y = 0; y < lh; y++)
      for (let x = 0; x < lw; x++) {
        let sum = 0;
        for (let dy = -s.radius; dy <= s.radius; dy++)
          for (let dx = -s.radius; dx <= s.radius; dx++)
            sum +=
              s.values[(dy + s.radius) * side + dx + s.radius] *
              level[
                Math.min(lh - 1, Math.max(0, y + dy)) * lw + Math.min(lw - 1, Math.max(0, x + dx))
              ];
        convolved[y * lw + x] = sum;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let fx = Math.min(lw - 1, Math.max(0, (x + 0.5) / stride - 0.5)),
          fy = Math.min(lh - 1, Math.max(0, (y + 0.5) / stride - 0.5));
        const x0 = Math.floor(fx),
          y0 = Math.floor(fy),
          x1 = Math.min(x0 + 1, lw - 1),
          y1 = Math.min(y0 + 1, lh - 1);
        fx -= x0;
        fy -= y0;
        const a = convolved[y0 * lw + x0] * (1 - fx) + convolved[y0 * lw + x1] * fx,
          b = convolved[y1 * lw + x0] * (1 - fx) + convolved[y1 * lw + x1] * fx;
        out[y * w + x] += s.weight * (a * (1 - fy) + b * fy);
      }
  }
  return out;
}
export function applyLayeredTransport(
  image: { r: Float32Array; g: Float32Array; b: Float32Array; w: number; h: number },
  film: string,
  p: TransportParams,
  strengths: number[],
  pixelSizeUm: number,
  amount: number,
  size: number,
) {
  const pitch = pixelSizeUm / 1000,
    model = prepare(film, p, strengths, pitch / Math.max(0.1, size)),
    planes = [image.r, image.g, image.b];
  for (let c = 0; c < 3; c++) {
    const source = planes[c],
      core =
        model.core[c] > 0
          ? blurPlane(source, image.w, image.h, model.core[c] / pitch)
          : source.slice();
    if (amount > 0 && model.ratio[c] > 0) {
      let returned: Float32Array = spread(source, image.w, image.h, model.kernels[c]);
      if (p.hazeUm > 0) returned = blurPlane(returned, image.w, image.h, p.hazeUm / pixelSizeUm);
      for (let i = 0; i < source.length; i++) core[i] += amount * model.ratio[c] * returned[i];
    }
    source.set(core);
  }
}
