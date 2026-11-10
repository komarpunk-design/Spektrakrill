import portraJs from "../../../public/profiles/kodak_portra_400.json" with { type: "json" };
import { fileStem } from "./preset-json.ts";
import type { FilmProfile, Mat3, ProfileMeta, Vec3 } from "./types.ts";

const SPECTRAL_ROWS = 81;
const DENSITY_ROWS = 256;

const TYPE_OK = new Set<ProfileMeta["type"]>(["negative", "positive"]);
const SUPPORT_OK = new Set<ProfileMeta["support"]>(["film", "paper"]);
const STAGE_OK = new Set<ProfileMeta["stage"]>(["filming", "printing"]);
const USE_OK = new Set<ProfileMeta["use"]>(["still", "cine"]);
const AH_OK = new Set<ProfileMeta["antihalation"]>(["strong", "weak", "no"]);
const VIEW_OK = new Set(["D50", "K75P"]);
const REF_OK = new Set(["D55", "T", "TH-KG3"]);

const DONOR = portraJs as unknown as FilmProfile;

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

export function isSpectralProfile(raw: unknown): boolean {
  const o = asRec(raw);
  if (!o) return false;
  const info = asRec(o.info);
  const data = asRec(o.data);
  if (!info || !data) return false;
  return Boolean(
    (info.stock || info.name || info.type) &&
      (data.wavelengths || data.density_curves || data.densityCurves),
  );
}

export function sanitizeProfileId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function oneOf<T extends string>(v: unknown, allowed: Set<T>, fallback: T): T {
  const s = str(v);
  if (s && allowed.has(s as T)) return s as T;
  return fallback;
}

function requireOneOf<T extends string>(v: unknown, allowed: Set<T>, field: string): T {
  const s = str(v);
  if (!s || !allowed.has(s as T)) throw new Error(`${field}`);
  return s as T;
}

function vecN(v: unknown, n: number, field: string, allowNull = false): number[] {
  const a = arr(v);
  if (!a || a.length !== n) throw new Error(field);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (allowNull && a[i] == null) {
      out.push(Number.NaN);
      continue;
    }
    const x = num(a[i]);
    if (x === undefined || !Number.isFinite(x)) throw new Error(field);
    out.push(x);
  }
  return out;
}

function mat3n(v: unknown, rows: number, field: string, allowNull = false): Vec3[] {
  const a = arr(v);
  if (!a || a.length !== rows) throw new Error(field);
  const out: Vec3[] = [];
  for (let i = 0; i < rows; i++) {
    const row = arr(a[i]);
    if (!row || row.length < 3) throw new Error(field);
    const cell = (x: unknown): number => {
      if (allowNull && x == null) return Number.NaN;
      const n = num(x);
      if (n === undefined || !Number.isFinite(n)) throw new Error(field);
      return n;
    };
    out.push([cell(row[0]), cell(row[1]), cell(row[2])]);
  }
  return out;
}

function isoFrom(info: Record<string, unknown>, name: string, stock: string): number | null {
  const direct = num(info.iso ?? info.ISO);
  if (direct && direct >= 20 && direct <= 6400) return Math.round(direct);
  const m = `${name} ${stock}`.match(/(?:^|[\s_/-])(\d{2,4})(?:[\s_/-]|$)/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v >= 20 && v <= 3200) return v;
  return null;
}

function modelFrom(data: Record<string, unknown>): FilmProfile["densityCurvesModel"] {
  const raw = asRec(data.density_curves_model) ?? asRec(data.densityCurvesModel);
  if (!raw) return DONOR.densityCurvesModel;
  const type = str(raw.model_type ?? raw.modelType) ?? "cdfs";
  const centers = arr(raw.centers);
  const amplitudes = arr(raw.amplitudes);
  const sigmas = arr(raw.sigmas);
  if (!centers || !amplitudes || !sigmas) return DONOR.densityCurvesModel;
  const asRows = (m: unknown[]): number[][] =>
    m.map((row) => {
      const r = arr(row) ?? [];
      return r.map((x) => Number(x));
    });
  return {
    modelType: type,
    centers: asRows(centers),
    amplitudes: asRows(amplitudes),
    sigmas: asRows(sigmas),
  };
}

function minMax(curves: Vec3[]): { dmin: Vec3; dmax: Vec3 } {
  const dmin: Vec3 = [Infinity, Infinity, Infinity];
  const dmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const row of curves) {
    for (let c = 0; c < 3; c++) {
      dmin[c] = Math.min(dmin[c], row[c]);
      dmax[c] = Math.max(dmax[c], row[c]);
    }
  }
  return { dmin, dmax };
}

export type ParsedSpectralProfile = {
  id: string;
  meta: ProfileMeta;
  jsProfile: FilmProfile;
  nativeJson: string;
};

export function parseSpectralProfile(raw: unknown, sourceName?: string): ParsedSpectralProfile {
  const o = asRec(raw);
  if (!o || !isSpectralProfile(o)) throw new Error("not-spectral");
  const info = asRec(o.info)!;
  const data = asRec(o.data)!;

  const type = requireOneOf(info.type, TYPE_OK, "info.type");
  const support = requireOneOf(info.support, SUPPORT_OK, "info.support");
  const stage = requireOneOf(info.stage, STAGE_OK, "info.stage");
  const viewing = requireOneOf(info.viewing_illuminant ?? info.viewingIlluminant, VIEW_OK, "info.viewing_illuminant");
  const reference = requireOneOf(
    info.reference_illuminant ?? info.referenceIlluminant,
    REF_OK,
    "info.reference_illuminant",
  );
  const channel = str(info.channel_model ?? info.channelModel);
  if (channel !== "color") throw new Error("info.channel_model");

  vecN(data.wavelengths, SPECTRAL_ROWS, "data.wavelengths");
  const densityCurves = mat3n(data.density_curves ?? data.densityCurves, DENSITY_ROWS, "data.density_curves");
  const logExposure = vecN(data.log_exposure ?? data.logExposure, DENSITY_ROWS, "data.log_exposure");
  mat3n(data.log_sensitivity ?? data.logSensitivity, SPECTRAL_ROWS, "data.log_sensitivity", true);
  mat3n(data.channel_density ?? data.channelDensity, SPECTRAL_ROWS, "data.channel_density", true);
  vecN(data.base_density ?? data.baseDensity, SPECTRAL_ROWS, "data.base_density", true);
  vecN(data.midscale_neutral_density ?? data.midscaleNeutralDensity, SPECTRAL_ROWS, "data.midscale_neutral_density", true);

  const stock = sanitizeProfileId(str(info.stock) || fileStem(sourceName) || str(info.name) || "imported_film");
  if (!stock) throw new Error("info.stock");
  const name = str(info.name) || stock.replaceAll("_", " ");
  const use = oneOf(info.use, USE_OK, support === "paper" ? "still" : "still");
  const antihalation = oneOf(info.antihalation, AH_OK, "strong");
  const target = str(info.target_print ?? info.targetPrint) || null;
  const { dmin, dmax } = minMax(densityCurves);

  const meta: ProfileMeta = {
    id: stock,
    name,
    type,
    support,
    stage,
    use,
    antihalation,
    targetPrint: target && target !== "null" ? sanitizeProfileId(target) : null,
    iso: isoFrom(info, name, stock),
    referenceIlluminant: reference,
    user: true,
  };

  const jsProfile: FilmProfile = {
    ...meta,
    viewingIlluminant: viewing,
    logExposure: {
      min: logExposure[0] ?? -3,
      max: logExposure[logExposure.length - 1] ?? 4,
      n: logExposure.length,
    },
    densityCurves,
    dmin,
    dmax,
    rgbToFilm: DONOR.rgbToFilm as Mat3,
    dyeToRgb: DONOR.dyeToRgb as Mat3,
    baseRgbOd: DONOR.baseRgbOd as Vec3,
    densityCurvesModel: modelFrom(data),
    license: str(asRec(o.metadata)?.license) || str(o.license) || "imported",
  };

  return { id: stock, meta, jsProfile, nativeJson: JSON.stringify(o) };
}

export type SpektraImport = {
  profiles: ParsedSpectralProfile[];
  looksRaw: unknown | null;
};

function collectProfiles(raw: unknown, sourceName?: string, out: ParsedSpectralProfile[] = []): ParsedSpectralProfile[] {
  if (Array.isArray(raw)) {
    for (const item of raw) collectProfiles(item, sourceName, out);
    return out;
  }
  const o = asRec(raw);
  if (!o) return out;
  if (isSpectralProfile(o)) {
    out.push(parseSpectralProfile(o, sourceName));
    return out;
  }
  if (Array.isArray(o.profiles)) collectProfiles(o.profiles, sourceName, out);
  const stocks = asRec(o.stocks);
  if (stocks) {
    for (const [id, body] of Object.entries(stocks)) {
      if (!isSpectralProfile(body)) continue;
      const parsed = parseSpectralProfile(body, sourceName);
      const forced = sanitizeProfileId(id);
      out.push(forced && forced !== parsed.id ? { ...parsed, id: forced, meta: { ...parsed.meta, id: forced }, jsProfile: { ...parsed.jsProfile, id: forced } } : parsed);
    }
  }
  return out;
}

export function parseSpektraImport(raw: unknown, sourceName?: string): SpektraImport {
  return { profiles: collectProfiles(raw, sourceName), looksRaw: raw };
}
