// UI port of Fotufilm PhoneDecks, as selected by komarpunk-design/Zalupa.
// Engine-specific pages bind to the existing Spektrafilm controls.
import type { ToolId } from "../../lib/film/store.ts";
import index from "../../lib/film/control-index.json" with { type: "json" };
import { defaultParams } from "../../lib/film/defaults.ts";
import { TOOL_KEYS, toolChangeCount, resetToolParams } from "../../lib/film/tool-state.ts";
import type { DarkroomParams } from "../../lib/film/types.ts";

export const Z_DECKS = [
  {
    id: "film",
    title: "Плёнка",
    icon: "film",
    pages: [
      { id: "films", title: "Плёнки", tool: "film" },
      { id: "halation", title: "Галяция", tool: "film" },
      { id: "emulsion-dir", title: "Эмульсия", tool: "film" },
      { id: "develop", title: "Push / Pull", tool: "development" },
      { id: "spectrum", title: "Спектр", tool: "emulsion" },
      { id: "format", title: "Формат", tool: "camera" },
      { id: "negative", title: "Сканы негативов", tool: "negative" },
    ],
  },
  {
    id: "grain",
    title: "Зерно",
    icon: "grain",
    pages: [{ id: "grain", title: "Spektrafilm", tool: "film" }],
  },
  {
    id: "lens",
    title: "Оптика",
    icon: "lens",
    pages: [{ id: "lens", title: "Фильтры", tool: "camera" }],
  },
  {
    id: "print",
    title: "Печать",
    icon: "print",
    pages: [
      { id: "paper", title: "Бумага", tool: "print" },
      { id: "scan", title: "Готовый скан", tool: "scan" },
      { id: "frame", title: "Рамка", tool: "crop" },
    ],
  },
  {
    id: "light",
    title: "Свет и цвет",
    icon: "light",
    pages: [
      { id: "exposure", title: "Экспозиция", tool: "camera" },
      { id: "balance", title: "Баланс", tool: "camera" },
      { id: "tone", title: "Цифровой тон", tool: "tone" },
    ],
  },
  {
    id: "crop",
    title: "Кадр",
    icon: "crop",
    pages: [{ id: "crop", title: "Кадрирование", tool: "crop" }],
  },
  {
    id: "negs",
    title: "Negs",
    icon: "negs",
    pages: [
      { id: "prep", title: "Подготовка", tool: "prep" },
      { id: "negs-grain", title: "RMS-зерно", tool: "negs" },
      { id: "negs-dir", title: "DIR", tool: "negs" },
      { id: "negs-format", title: "Формат", tool: "negs" },
    ],
  },
  {
    id: "fotufilm",
    title: "Fotufilm",
    icon: "fotufilm",
    pages: [
      { id: "fotufilm-output", title: "Outputs / Lab Scan", tool: "fotufilm" },
      { id: "fotufilm-halation", title: "Layered Transport", tool: "fotufilm" },
    ],
  },
] as const;
export type ZDeckId = (typeof Z_DECKS)[number]["id"];
export type ZPageId = (typeof Z_DECKS)[number]["pages"][number]["id"];
export type ZPage = { id: string; title: string; tool: ToolId };
export const Z_SERVICE: ZPage[] = [
  { id: "gallery", title: "Галерея", tool: "gallery" },
  { id: "presets", title: "Рецепты", tool: "presets" },
  { id: "stock", title: "Очередь", tool: "stock" },
  { id: "export", title: "Сохранение файла", tool: "export" },
  { id: "lab", title: "Расчёт", tool: "lab" },
  { id: "log", title: "Журнал", tool: "log" },
  { id: "settings", title: "Настройки", tool: "settings" },
  { id: "texture", title: "Фактура · все модели", tool: "texture" },
  { id: "edit", title: "Обработка", tool: "edit" },
];
export const zPages: ZPage[] = [...Z_DECKS.flatMap((d) => [...d.pages]), ...Z_SERVICE];
export function zPage(id: string): ZPage {
  return zPages.find((p) => p.id === id) ?? zPages[0];
}
export function zDeck(page: string) {
  return Z_DECKS.find((d) => d.pages.some((p) => p.id === page));
}

export function pageForTool(tool: ToolId, label?: string, previous?: string): ZPage {
  let id: string | undefined;
  const path = index.defaults.find((r) => r.tool === tool && r.label === label)?.path ?? "";
  if (tool === "film") {
    id =
      label && /grain|^grain/.test(path)
        ? "grain"
        : label && /halation|scatter|boost|protect/.test(path)
          ? "halation"
          : label && /coupler|inhibition/.test(path)
            ? "emulsion-dir"
            : "films";
    if (label === "Зерно" || label === "Подслои") id = "grain";
    if (label === "Галяция" || label === "Нормализация") id = "halation";
    if (label === "DIR-каплеры") id = "emulsion-dir";
  } else if (tool === "camera") {
    id =
      label === "Формат, мм"
        ? "format"
        : label && /^(EV|Автоэкспозиция|Замер)$/.test(label)
          ? "exposure"
          : label && /UV|IR|объектива|Диффузия|Фильтр|Масштаб PSF|Сила/.test(label)
            ? "lens"
            : label
              ? "balance"
              : "exposure";
  } else if (tool === "crop")
    id = label && /Рамка|Номер кадра|DX|Дата/.test(label) ? "frame" : "crop";
  else if (tool === "negs")
    id = label?.includes("Формат")
      ? "negs-format"
      : label && /RMS|Равномерность|плотность|Размер частиц|резкости плотности|Зерно/.test(label)
        ? "negs-grain"
        : label
          ? "negs-dir"
          : previous === "emulsion-dir"
            ? "negs-dir"
            : "negs-grain";
  else if (tool === "fotufilm")
    id =
      label && /Layered|Модель свечения|гало|основы|пластины|Антигаляционный/.test(label)
        ? "fotufilm-halation"
        : "fotufilm-output";
  else if (tool === "outputs") id = "fotufilm-output";
  else if (tool === "frame") id = "frame";
  return id ? zPage(id) : (zPages.find((p) => p.tool === tool) ?? zPages[0]);
}

const factory = defaultParams();
const experimentalKeys = Object.keys(factory.experimental);
const pageKeys: Record<string, string[]> = {
  films: ["filmStock"],
  grain: TOOL_KEYS.film.filter((k) => k.startsWith("grain")),
  halation: TOOL_KEYS.film.filter((k) => /halation|scatter|boost|protect/.test(k)),
  "emulsion-dir": TOOL_KEYS.film.filter((k) => /coupler|inhibition/.test(k)),
  exposure: ["exposureCompensationEv", "autoExposure", "autoExposureMethod"],
  balance: ["whiteBalance", "temperature", "tint"],
  format: ["filmFormatMm"],
  lens: ["filterUvAmount", "filterIrAmount", "cameraLensBlurUm", "cameraDiffusion"],
  frame: ["frameStyle", "frameNumber", "frameBarcode", "frameDate", "whitePadding"],
  crop: TOOL_KEYS.crop.filter((k) => !k.startsWith("frame") && k !== "whitePadding"),
  "negs-grain": [
    "grainActive",
    ...experimentalKeys.filter((k) => k.startsWith("grain")).map((k) => "experimental." + k),
  ],
  "negs-dir": [
    "couplersActive",
    ...experimentalKeys.filter((k) => k.startsWith("dir")).map((k) => "experimental." + k),
  ],
  "negs-format": ["filmFormatMm"],
  "fotufilm-output": ["output", "scanFilm"],
  "fotufilm-halation": ["transport", "halationActive", "halationAmount", "halationSpatialScale"],
};
function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
      value,
    );
}
export function zChanges(params: DarkroomParams, page: ZPage): number {
  const keys = pageKeys[page.id],
    baseline = factory;
  return keys
    ? keys.filter((k) => JSON.stringify(at(params, k)) !== JSON.stringify(at(baseline, k))).length
    : toolChangeCount(params, page.tool);
}
export function resetZPage(params: DarkroomParams, page: ZPage): DarkroomParams {
  const keys = pageKeys[page.id];
  if (!keys) return resetToolParams(params, page.tool);
  const next = structuredClone(params),
    baseline = factory;
  for (const path of keys) {
    const parts = path.split("."),
      key = parts.pop()!;
    let parent: Record<string, unknown> = next as unknown as Record<string, unknown>;
    for (const p of parts) parent = parent[p] as Record<string, unknown>;
    parent[key] = structuredClone(at(baseline, path));
  }
  return next;
}
