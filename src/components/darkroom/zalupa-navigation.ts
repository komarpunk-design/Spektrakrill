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
    source: "catalog",
    title: "Плёнки",
    fullTitle: "Общий каталог",
    icon: "film",
    description: "Плёнки всех источников в одном каталоге.",
    pages: [{ id: "films", title: "Все плёнки", tool: "film" }],
  },
  {
    id: "spektrafilm",
    source: "spektrafilm",
    title: "Spektrafilm",
    fullTitle: "Spektrafilm · базовые инструменты",
    icon: "spektrafilm",
    description: "Исходные инструменты Spektrafilm, съёмка, печать и оформление кадра.",
    pages: [
      { id: "exposure", title: "Экспозиция", tool: "camera" },
      { id: "balance", title: "Баланс", tool: "camera" },
      { id: "lens", title: "Оптика", tool: "camera" },
      { id: "format", title: "Формат", tool: "camera" },
      { id: "grain", title: "Зерно", tool: "film" },
      { id: "halation", title: "Галяция", tool: "film" },
      { id: "emulsion-dir", title: "DIR", tool: "film" },
      { id: "develop", title: "Push / Pull", tool: "development" },
      { id: "paper", title: "Печать", tool: "print" },
      { id: "scan", title: "Готовый скан", tool: "scan" },
      { id: "frame", title: "Рамка", tool: "crop" },
      { id: "crop", title: "Кадрирование", tool: "crop" },
      { id: "tone", title: "Цифровой тон", tool: "tone" },
    ],
  },
  {
    id: "experimental",
    source: "experimental",
    title: "Experimental",
    fullTitle: "Spektrafilm Experimental",
    icon: "experimental",
    description:
      "Инструменты из экспериментальной ветки Spektrafilm. Настройки работают с тем же кадром.",
    pages: [
      { id: "spectrum", title: "Спектр и основа", tool: "emulsion" },
      { id: "exp-chemistry", title: "Химия плёнки", tool: "development" },
      { id: "exp-grain", title: "RMS-зерно", tool: "negs" },
      { id: "exp-dir", title: "Langmuir DIR", tool: "negs" },
      { id: "exp-paper", title: "Основа бумаги", tool: "print" },
      { id: "negative", title: "Сканы негативов", tool: "negative" },
    ],
  },
  {
    id: "negs",
    source: "negs",
    title: "Negs",
    fullTitle: "Negs",
    icon: "negs",
    description: "Подготовка исходника, форматы кадра и параметры плёнок из Negs.",
    pages: [
      { id: "prep", title: "Prep", tool: "prep" },
      { id: "negs-format", title: "Форматы кадра", tool: "negs" },
      { id: "negs-profiles", title: "Профиль Negs", tool: "negs" },
    ],
  },
  {
    id: "fotufilm",
    source: "fotufilm",
    title: "Fotufilm",
    fullTitle: "Fotufilm",
    icon: "fotufilm",
    description: "Отдельные модели Fotufilm: получение изображения и послойная галяция.",
    pages: [
      { id: "fotufilm-output", title: "Outputs / Lab Scan", tool: "fotufilm" },
      { id: "fotufilm-halation", title: "Layered Transport", tool: "fotufilm" },
    ],
  },
] as const;
export const Z_PAGE_HINTS: Record<string, string> = {
  "exp-grain":
    "RMS-модель из Spektrafilm Experimental. Плёнки Negs используют эту же модель; восстановление их значений находится в Negs → Профиль Negs.",
  "exp-dir":
    "Нелинейный Langmuir DIR из Spektrafilm Experimental. Данные плёнок Negs применяются в той же модели.",
  "exp-chemistry":
    "Послойная химия и времена проявки из Experimental. Общая γ совпадает с коэффициентом в Push / Pull.",
  "exp-paper":
    "Спектральная подложка и временные варианты печатных профилей из Experimental. Для цифрового вывода бумага не используется.",
  "negs-format":
    "Готовые размеры кадра из Negs. Они меняют тот же физический размер, что и ручной формат Spektrafilm.",
  "negs-profiles":
    "Данные из выбранной плёнки Negs. Ручные регуляторы общей модели RMS и Langmuir находятся в Experimental.",
};
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
];
export const zPages: ZPage[] = [...Z_DECKS.flatMap((d) => [...d.pages]), ...Z_SERVICE];
export function zPage(id: string): ZPage {
  return zPages.find((p) => p.id === id) ?? zPages[0];
}
export function zDeck(page: string) {
  return Z_DECKS.find((d) => d.pages.some((p) => p.id === page));
}

export function pageForTool(tool: ToolId, label?: string, previous?: string): ZPage {
  const path = index.defaults.find((r) => r.tool === tool && r.label === label)?.path ?? "";
  let id: string | undefined;
  if (tool === "film") {
    id =
      label && /grain/.test(path)
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
  else if (tool === "development")
    id =
      label &&
      (/experimental\.film/.test(path) ||
        /Время проявки|Химия плёнки|Общая проявка|слои γ|канал γ|эмульсии γ|Истощение проявителя/.test(
          label,
        ))
        ? "exp-chemistry"
        : "develop";
  else if (tool === "print")
    id =
      label &&
      (/experimental\.printBase/.test(path) || /основы|основе|Время проявки печатной/.test(label))
        ? "exp-paper"
        : "paper";
  else if (tool === "negs")
    id = label?.includes("Формат")
      ? "negs-format"
      : label && /RMS|Равномерность|плотность|Размер частиц|резкости плотности|Зерно/.test(label)
        ? "exp-grain"
        : label
          ? "exp-dir"
          : previous === "grain"
            ? "exp-grain"
            : previous === "emulsion-dir"
              ? "exp-dir"
              : "negs-profiles";
  else if (tool === "fotufilm")
    id =
      (label && /Layered|Модель свечения|гало|основы|пластины|Антигаляционный/.test(label)) ||
      (!label && previous === "halation")
        ? "fotufilm-halation"
        : "fotufilm-output";
  else if (tool === "outputs") id = "fotufilm-output";
  else if (tool === "frame") id = "frame";
  else if (tool === "texture")
    return label && /Размытие зерна|Облака/.test(label)
      ? zPage("exp-grain")
      : label && /^(DIR-каплеры|Количество|Межслойное|Свой слой|Диффузия, µm)$/.test(label)
        ? zPage("exp-dir")
        : label &&
            /RMS|Равномерность [RGB]|Насыщение|Хвост|хвоста|плотность [RGB]|частиц ·|резкости плотности/.test(
              label,
            )
          ? pageForTool("negs", label)
          : label && /гало|Модель свечения|основы|Антигаляционный|пластины/.test(label)
            ? pageForTool("fotufilm", label)
            : pageForTool("film", label ?? "Зерно");
  else if (tool === "edit") id = "exposure";
  return id ? zPage(id) : (zPages.find((p) => p.tool === tool) ?? zPages[0]);
}

const factory = defaultParams();
const experimentalKeys = Object.keys(factory.experimental);
const pageKeys: Record<string, string[]> = {
  films: ["filmStock"],
  develop: [...TOOL_KEYS.development],
  paper: [...TOOL_KEYS.print],
  "exp-chemistry": [
    "filmGamma",
    ...experimentalKeys
      .filter((k) => k.startsWith("film") && !k.startsWith("filmBase"))
      .map((k) => "experimental." + k),
  ],
  "exp-paper": experimentalKeys
    .filter((k) => k.startsWith("printBase"))
    .map((k) => "experimental." + k),
  "negs-profiles": [],
  grain: TOOL_KEYS.film.filter((k) => k.startsWith("grain")),
  halation: TOOL_KEYS.film.filter((k) => /halation|scatter|boost|protect/.test(k)),
  "emulsion-dir": TOOL_KEYS.film.filter((k) => /coupler|inhibition/.test(k)),
  exposure: ["exposureCompensationEv", "autoExposure", "autoExposureMethod"],
  balance: ["whiteBalance", "temperature", "tint"],
  format: ["filmFormatMm"],
  lens: ["filterUvAmount", "filterIrAmount", "cameraLensBlurUm", "cameraDiffusion"],
  frame: ["frameStyle", "frameNumber", "frameBarcode", "frameDate", "whitePadding"],
  crop: TOOL_KEYS.crop.filter((k) => !k.startsWith("frame") && k !== "whitePadding"),
  "exp-grain": [
    "grainActive",
    "grainBlur",
    "grainDyeCloudsUm",
    ...experimentalKeys.filter((k) => k.startsWith("grain")).map((k) => "experimental." + k),
  ],
  "exp-dir": [
    "couplersActive",
    "couplersAmount",
    "inhibitionInterlayer",
    "inhibitionSamelayer",
    "couplerDiffusionUm",
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
