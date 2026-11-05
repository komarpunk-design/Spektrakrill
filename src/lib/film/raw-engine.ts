/**
 * RAW rendering engines — color science of the digital back, applied on
 * linear RGB AFTER white balance and BEFORE the 81-band film simulator.
 *
 * Picker architecture inspired by PhotonCamera (Apache-2.0, bjzhou/PhotonCamera)
 * `RawRenderingEngine`. Color warps here are original parametric reconstructions
 * of published brand looks (HNCS / Lumix Photo Style / Adobe Color). No Phocus
 * shaders, no stolen 2D LUTs, no display-referred film curve — those would
 * fight Spektrafilm.
 *
 * `spektrafilm` is a hard no-op so the working export path is byte-identical.
 */

export type RawEngine = "spektrafilm" | "hasselblad" | "lumix" | "adobe";

export type RawEngineStyle =
  | "standard"
  | "nature"
  | "portrait"
  | "landscape"
  | "vivid"
  | "natural"
  | "reproduction";

export type RgbPlanes = { r: Float32Array; g: Float32Array; b: Float32Array };

export const RAW_ENGINES: { id: RawEngine; label: string; hint: string }[] = [
  {
    id: "spektrafilm",
    label: "Spektrafilm",
    hint: "Как снято. 81 полоса — после выбора плёнки",
  },
  {
    id: "hasselblad",
    label: "Hasselblad HNCS",
    hint: "Цвет цифровой спины Hasselblad, до плёнки",
  },
  {
    id: "lumix",
    label: "Lumix",
    hint: "Photo Style Panasonic, до плёнки",
  },
  {
    id: "adobe",
    label: "Adobe Color",
    hint: "Нейтральный развивающий профиль, до плёнки",
  },
];

const STYLE_LABEL: Record<RawEngineStyle, string> = {
  standard: "Standard",
  nature: "Nature",
  portrait: "Portrait",
  landscape: "Landscape",
  vivid: "Vivid",
  natural: "Natural",
  reproduction: "Reproduction",
};

const STYLES: Record<RawEngine, RawEngineStyle[]> = {
  spektrafilm: [],
  hasselblad: ["standard", "nature", "portrait", "reproduction"],
  lumix: ["standard", "vivid", "natural", "portrait", "landscape"],
  adobe: ["standard", "natural", "portrait", "landscape"],
};

export function sanitizeRawEngine(v: unknown): RawEngine {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "hncs" || s === "hncscm" || s === "phocus") return "hasselblad";
  if (s === "panasonic" || s === "v-gamut" || s === "vgamut") return "lumix";
  if (s === "adobecurve" || s === "camera_standard") return "adobe";
  if (s === "hasselblad" || s === "lumix" || s === "adobe" || s === "spektrafilm") {
    return s;
  }
  return "spektrafilm";
}

export function stylesFor(engine: RawEngine): RawEngineStyle[] {
  return STYLES[engine] ?? [];
}

export function sanitizeRawEngineStyle(engine: RawEngine, v: unknown): RawEngineStyle {
  const allowed = stylesFor(engine);
  if (!allowed.length) return "standard";
  const s = String(v ?? "")
    .trim()
    .toLowerCase() as RawEngineStyle;
  return allowed.includes(s) ? s : allowed[0];
}

export function rawEngineLabel(id: RawEngine): string {
  return RAW_ENGINES.find((e) => e.id === id)?.label ?? id;
}

export function rawEngineStyleLabel(id: RawEngineStyle): string {
  return STYLE_LABEL[id] ?? id;
}

export function rawEngineNeeded(engine: RawEngine): boolean {
  return engine !== "spektrafilm";
}

type Warp = {
  globalChroma: number;
  skinChroma: number;
  skinHue: number;
  greenChroma: number;
  greenHue: number;
  blueChroma: number;
  blueHue: number;
  shadowDesat: number;
  highlight: number;
};

function warpFor(engine: RawEngine, style: RawEngineStyle): Warp | null {
  if (engine === "spektrafilm") return null;
  if (engine === "hasselblad") {
    if (style === "nature") {
      return {
        globalChroma: 1.12,
        skinChroma: 1.06,
        skinHue: 0.03,
        greenChroma: 1.18,
        greenHue: -0.1,
        blueChroma: 1.08,
        blueHue: -0.04,
        shadowDesat: 0.35,
        highlight: 0.14,
      };
    }
    if (style === "portrait") {
      return {
        globalChroma: 0.88,
        skinChroma: 1.16,
        skinHue: 0.06,
        greenChroma: 0.9,
        greenHue: -0.04,
        blueChroma: 0.92,
        blueHue: 0,
        shadowDesat: 0.28,
        highlight: 0.16,
      };
    }
    if (style === "reproduction") {
      return {
        globalChroma: 1.02,
        skinChroma: 1.02,
        skinHue: 0.01,
        greenChroma: 1.04,
        greenHue: -0.03,
        blueChroma: 1.0,
        blueHue: 0,
        shadowDesat: 0.12,
        highlight: 0.08,
      };
    }
    return {
      globalChroma: 0.96,
      skinChroma: 1.1,
      skinHue: 0.04,
      greenChroma: 1.06,
      greenHue: -0.08,
      blueChroma: 0.92,
      blueHue: -0.04,
      shadowDesat: 0.22,
      highlight: 0.12,
    };
  }
  if (engine === "lumix") {
    if (style === "vivid") {
      return {
        globalChroma: 1.22,
        skinChroma: 1.08,
        skinHue: -0.02,
        greenChroma: 1.12,
        greenHue: 0.04,
        blueChroma: 1.14,
        blueHue: 0.05,
        shadowDesat: 0.08,
        highlight: 0,
      };
    }
    if (style === "natural") {
      return {
        globalChroma: 0.88,
        skinChroma: 1.02,
        skinHue: 0.02,
        greenChroma: 0.94,
        greenHue: 0,
        blueChroma: 0.94,
        blueHue: 0,
        shadowDesat: 0.18,
        highlight: 0,
      };
    }
    if (style === "portrait") {
      return {
        globalChroma: 0.9,
        skinChroma: 1.12,
        skinHue: 0.05,
        greenChroma: 0.88,
        greenHue: 0,
        blueChroma: 0.9,
        blueHue: 0,
        shadowDesat: 0.2,
        highlight: 0.06,
      };
    }
    if (style === "landscape") {
      return {
        globalChroma: 1.08,
        skinChroma: 1.0,
        skinHue: 0,
        greenChroma: 1.2,
        greenHue: -0.06,
        blueChroma: 1.14,
        blueHue: 0.04,
        shadowDesat: 0.1,
        highlight: 0,
      };
    }
    return {
      globalChroma: 1.04,
      skinChroma: 1.04,
      skinHue: 0.02,
      greenChroma: 1.06,
      greenHue: 0,
      blueChroma: 1.04,
      blueHue: 0.02,
      shadowDesat: 0.1,
      highlight: 0,
    };
  }
  // adobe
  if (style === "natural") {
    return {
      globalChroma: 0.92,
      skinChroma: 1.0,
      skinHue: 0.02,
      greenChroma: 0.96,
      greenHue: 0,
      blueChroma: 0.96,
      blueHue: 0,
      shadowDesat: 0.1,
      highlight: 0,
    };
  }
  if (style === "portrait") {
    return {
      globalChroma: 0.96,
      skinChroma: 1.12,
      skinHue: 0.05,
      greenChroma: 0.94,
      greenHue: 0,
      blueChroma: 0.94,
      blueHue: 0,
      shadowDesat: 0.14,
      highlight: 0.04,
    };
  }
  if (style === "landscape") {
    return {
      globalChroma: 1.06,
      skinChroma: 1.02,
      skinHue: 0.02,
      greenChroma: 1.12,
      greenHue: -0.04,
      blueChroma: 1.08,
      blueHue: 0.03,
      shadowDesat: 0.08,
      highlight: 0,
    };
  }
  return {
    globalChroma: 1.03,
    skinChroma: 1.08,
    skinHue: 0.04,
    greenChroma: 0.98,
    greenHue: -0.02,
    blueChroma: 1.0,
    blueHue: 0,
    shadowDesat: 0.1,
    highlight: 0,
  };
}

function lobe(hue: number, center: number, width: number): number {
  let d = hue - center;
  const tau = Math.PI * 2;
  d = ((d + Math.PI) % tau + tau) % tau - Math.PI;
  const x = d / Math.max(1e-6, width);
  return Math.exp(-0.5 * x * x);
}

/**
 * In-place YCgCo hue/chroma warp. Neutral pixels stay neutral.
 * Spektrafilm engine returns immediately.
 */
export function applyRawEngine(
  img: RgbPlanes,
  engine: RawEngine,
  style: RawEngineStyle = "standard",
): void {
  const w = warpFor(engine, style);
  if (!w) return;
  const { r, g, b } = img;
  const n = Math.min(r.length, g.length, b.length);
  for (let i = 0; i < n; i++) {
    const R = r[i];
    const G = g[i];
    const B = b[i];
    if (!Number.isFinite(R) || !Number.isFinite(G) || !Number.isFinite(B)) continue;
    const Y = 0.25 * R + 0.5 * G + 0.25 * B;
    const Cg = -0.25 * R + 0.5 * G - 0.25 * B;
    const Co = 0.5 * R - 0.5 * B;
    const chroma0 = Math.hypot(Cg, Co);
    if (chroma0 < 1e-6) {
      if (w.highlight > 0 && Y > 0) {
        const y2 = Y / (1 + Y * 0.18);
        const s = 1 + (y2 / Y - 1) * w.highlight;
        r[i] = R * s;
        g[i] = G * s;
        b[i] = B * s;
      }
      continue;
    }
    const hue = Math.atan2(Cg, Co);
    const skin = lobe(hue, 0.18, 0.55);
    const green = lobe(hue, 1.35, 0.7);
    const blue = lobe(hue, -1.85, 0.8);
    let chroma =
      chroma0 *
      w.globalChroma *
      (1 +
        skin * (w.skinChroma - 1) +
        green * (w.greenChroma - 1) +
        blue * (w.blueChroma - 1));
    if (w.shadowDesat > 0 && Y < 0.045) {
      const t = Math.max(0, Y / 0.045);
      chroma *= 1 - w.shadowDesat * (1 - t);
    }
    const hue2 =
      hue + skin * w.skinHue + green * w.greenHue + blue * w.blueHue;
    let Yout = Y;
    if (w.highlight > 0 && Y > 0) {
      const y2 = Y / (1 + Y * 0.18);
      Yout = Y + (y2 - Y) * w.highlight;
    }
    const Cg2 = chroma * Math.sin(hue2);
    const Co2 = chroma * Math.cos(hue2);
    r[i] = Yout - Cg2 + Co2;
    g[i] = Yout + Cg2;
    b[i] = Yout - Cg2 - Co2;
  }
}
