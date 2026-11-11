// Photographic workspace: navigation owns pages, never processing algorithms.
import type { ToolId } from "../../lib/film/store.ts";
import index from "../../lib/film/control-index.json" with { type: "json" };
import { defaultParams } from "../../lib/film/defaults.ts";
import { TOOL_KEYS } from "../../lib/film/tool-state.ts";
import type { DarkroomParams } from "../../lib/film/types.ts";

export type ZPage = { id: string; title: string; tool: ToolId };
export const Z_DECKS = [
  {
    id: "camera",
    source: "camera",
    title: "Камера",
    fullTitle: "Камера · исходный свет",
    icon: "camera",
    description: "Подготовка фотографии до виртуальной плёнки: свет, баланс и оптика.",
    pages: [
      { id: "exposure", title: "Экспозиция", tool: "camera" },
      { id: "balance", title: "Баланс белого", tool: "camera" },
      { id: "prep", title: "Подготовка", tool: "prep" },
      { id: "lens", title: "Оптика", tool: "camera" },
      { id: "taking-filter", title: "Цветной фильтр", tool: "emulsion" },
      { id: "input-color", title: "Входной цвет", tool: "lab" },
    ],
  },
  {
    id: "film",
    source: "film",
    title: "Плёнка",
    fullTitle: "Плёнка · материал",
    icon: "film",
    description: "Единый каталог материалов, физический формат, спектр и подложка.",
    pages: [
      { id: "films", title: "Каталог", tool: "film" },
      { id: "format", title: "Формат", tool: "camera" },
      { id: "spectrum", title: "Спектр", tool: "emulsion" },
      { id: "film-base", title: "Основа и маска", tool: "emulsion" },
      { id: "profile", title: "Профиль", tool: "negs" },
    ],
  },
  {
    id: "development",
    source: "development",
    title: "Проявка",
    fullTitle: "Проявка · плотность и слои",
    icon: "experimental",
    description:
      "Экспонирование и проявка — отдельные этапы. Общая γ используется также послойной химией.",
    pages: [
      { id: "develop", title: "Push / Pull", tool: "development" },
      { id: "chemistry", title: "Химия", tool: "development" },
      { id: "dir", title: "DIR", tool: "film" },
    ],
  },
  {
    id: "effects",
    source: "effects",
    title: "Эффекты",
    fullTitle: "Эффекты · фактура и свет",
    icon: "grain",
    description:
      "Один инструмент на эффект. Выберите модель внутри; остальные её значения сохранятся.",
    pages: [
      { id: "grain", title: "Зерно", tool: "film" },
      { id: "halation", title: "Галяция", tool: "film" },
    ],
  },
  {
    id: "print",
    source: "print",
    title: "Печать",
    fullTitle: "Печать · получение изображения",
    icon: "print",
    description: "Выберите способ получения результата. Цифровые режимы обходят фотобумагу.",
    pages: [
      { id: "output", title: "Вывод", tool: "outputs" },
      { id: "paper", title: "Бумага и печать", tool: "print" },
      { id: "paper-base", title: "Основа бумаги", tool: "print" },
      { id: "test-print", title: "Пробная печать", tool: "print" },
    ],
  },
  {
    id: "scan",
    source: "scan",
    title: "Скан",
    fullTitle: "Скан · конвертация и отделка",
    icon: "scan",
    description:
      "Конвертация настоящего негатива отделена от отделки результата виртуальной плёнки.",
    pages: [
      { id: "scan", title: "Отделка скана", tool: "scan" },
      { id: "negative", title: "Настоящий негатив", tool: "negative" },
    ],
  },
  {
    id: "finish",
    source: "finish",
    title: "Финиш",
    fullTitle: "Финиш · оформление и файл",
    icon: "crop",
    description: "Кадрирование, края фотографии, цифровой тон и параметры сохраняемого файла.",
    pages: [
      { id: "crop", title: "Кадрирование", tool: "crop" },
      { id: "frame", title: "Рамка", tool: "crop" },
      { id: "tone", title: "Цифровой тон", tool: "tone" },
      { id: "output-color", title: "Цвет и размер", tool: "lab" },
      { id: "export", title: "Файл", tool: "export" },
    ],
  },
] as const;
export const Z_SERVICE: ZPage[] = [
  { id: "gallery", title: "Галерея", tool: "gallery" },
  { id: "presets", title: "Рецепты", tool: "presets" },
  { id: "stock", title: "Очередь", tool: "stock" },
  { id: "log", title: "Журнал", tool: "log" },
  { id: "settings", title: "Настройки", tool: "settings" },
];
export const Z_PAGE_HINTS: Record<string, string> = {
  grain:
    "Spektrafilm — ручная структура частиц. RMS — гранулярность эмульсии и её подслоёв. Только выбранная модель участвует в обработке.",
  halation:
    "Spektrafilm — рассеяние и повторные отражения. Layered Transport — прохождение света через слои и основу плёнки.",
  dir: "Классическая модель и Langmuir используют общие силу и радиус. Langmuir добавляет насыщение и хвост диффузии.",
  spectrum:
    "Реконструкция света из RGB. «Авто» использует профиль; базовый метод применяется там, где профиль его не переопределяет.",
  format:
    "Готовые форматы и ручной размер меняют одно значение. Масштаб зерна и оптических эффектов зависит от физического размера кадра.",
  profile:
    "Восстановление исходных значений выбранного материала; ручная настройка расположена в инструментах «Зерно» и «DIR».",
  negative:
    "Загрузите скан или пересъёмку настоящей цветной негативной плёнки. Это восстановление плотностей, а не эмуляция негатива из обычного фото.",
  output:
    "Единый выбор: фотобумага, Digital Reference, Auto Levels, Lab Scan или негатив на просвет.",
  "paper-base":
    "Плотность и цвет подложки печатного материала. При цифровом выводе бумага обходится.",
  "input-color": "Декодирование исходного цвета и обработка входного гамута до плёнки.",
  "output-color":
    "Выходной гамут и увеличение готового изображения. Формат и профиль файла — на странице «Файл».",
};
export type ZDeckId = (typeof Z_DECKS)[number]["id"];
export type ZPageId = (typeof Z_DECKS)[number]["pages"][number]["id"];
export const zPages: ZPage[] = [...Z_DECKS.flatMap((d) => [...d.pages]), ...Z_SERVICE];
const aliases: Record<string, string> = {
  "exp-grain": "grain",
  "exp-dir": "dir",
  "emulsion-dir": "dir",
  "exp-chemistry": "chemistry",
  "exp-paper": "paper-base",
  "negs-format": "format",
  "negs-profiles": "profile",
  "fotufilm-output": "output",
  "fotufilm-halation": "halation",
  lab: "spectrum",
};
export function zPage(id: string): ZPage {
  return zPages.find((p) => p.id === (aliases[id] ?? id)) ?? zPages.find((p) => p.id === "films")!;
}
export function zDeck(page: string) {
  return Z_DECKS.find((d) => d.pages.some((p) => p.id === page));
}
export function pageForTool(tool: ToolId, label?: string, previous?: string): ZPage {
  const path = index.defaults.find((r) => r.tool === tool && r.label === label)?.path ?? "";
  let id: string = tool;
  if (tool === "camera")
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
  else if (tool === "film")
    id =
      label && (/grain/.test(path) || /Зерно|Подслои/.test(label))
        ? "grain"
        : label &&
            (/halation|scatter|boost|protect/.test(path) || /Галяция|Нормализация/.test(label))
          ? "halation"
          : label && (/coupler|inhibition/.test(path) || /DIR/.test(label))
            ? "dir"
            : "films";
  else if (tool === "development")
    id =
      label &&
      (/experimental\.film/.test(path) ||
        /Время проявки|Химия плёнки|Общая проявка|слои γ|канал γ|эмульсии γ|Истощение проявителя/.test(
          label,
        ))
        ? "chemistry"
        : "develop";
  else if (tool === "print")
    id =
      label &&
      (/experimental\.printBase/.test(path) || /основы|основе|Время проявки печатной/.test(label))
        ? "paper-base"
        : "paper";
  else if (tool === "emulsion")
    id =
      label && /Фильтр/.test(label)
        ? "taking-filter"
        : label && /основ|маск|Спектральный наклон/.test(label)
          ? "film-base"
          : "spectrum";
  else if (tool === "negs")
    id = label?.includes("Формат")
      ? "format"
      : label && /RMS|Равномерность|плотность|Размер частиц|резкости плотности|Зерно/.test(label)
        ? "grain"
        : label
          ? "dir"
          : previous === "grain"
            ? "grain"
            : previous === "dir"
              ? "dir"
              : "profile";
  else if (tool === "fotufilm" || tool === "outputs")
    id =
      label && /Layered|Модель свечения|гало|основы|Антигаляционный|пластины/.test(label)
        ? "halation"
        : "output";
  else if (tool === "texture")
    return label && /гало|Модель свечения|основы|Антигаляционный|пластины/.test(label)
      ? zPage("halation")
      : label && /DIR|Количество|Межслойное|Свой слой|Диффузия|донор|приёмник|хвост/i.test(label)
        ? zPage("dir")
        : zPage("grain");
  else if (tool === "crop" || tool === "frame")
    id = tool === "frame" || (label && /Рамка|Номер кадра|DX|Дата/.test(label)) ? "frame" : "crop";
  else if (tool === "lab")
    id =
      label && /Входной|Декод/.test(label)
        ? "input-color"
        : label && /Выходной|Апскейл/.test(label)
          ? "output-color"
          : label === "LUT превью"
            ? "settings"
            : "spectrum";
  else if (tool === "edit") id = "exposure";
  return zPage(id);
}
const factory = defaultParams(),
  ek = Object.keys(factory.experimental);
const exp = (filter: (k: string) => boolean) => ek.filter(filter).map((k) => "experimental." + k);
export const Z_PAGE_KEYS: Record<string, string[]> = {
  films: ["filmStock"],
  exposure: ["exposureCompensationEv", "autoExposure", "autoExposureMethod"],
  balance: ["whiteBalance", "temperature", "tint"],
  lens: ["filterUvAmount", "filterIrAmount", "cameraLensBlurUm", "cameraDiffusion"],
  prep: ["prep"],
  format: ["filmFormatMm"],
  "taking-filter": ["experimental.colorFilter"],
  spectrum: [
    "experimental.spectralMethod",
    "rgbToRawMethod",
    "hanatosWindow",
    "hanatosSurface",
    "spectralBlur",
  ],
  "film-base": exp((k) => k.startsWith("filmBase")),
  profile: [],
  develop: [...TOOL_KEYS.development],
  chemistry: ["filmGamma", ...exp((k) => k.startsWith("film") && !k.startsWith("filmBase"))],
  grain: [
    ...TOOL_KEYS.film.filter((k) => k.startsWith("grain")),
    ...exp((k) => k.startsWith("grain")),
  ],
  halation: [
    ...TOOL_KEYS.film.filter((k) => /halation|scatter|boost|protect/.test(k)),
    "transport",
  ],
  dir: [
    ...TOOL_KEYS.film.filter((k) => /coupler|inhibition/.test(k)),
    ...exp((k) => k.startsWith("dir")),
  ],
  output: ["output", "scanFilm"],
  paper: [...TOOL_KEYS.print],
  "paper-base": exp((k) => k.startsWith("printBase")),
  "test-print": [],
  scan: [...TOOL_KEYS.scan],
  negative: exp((k) => k.startsWith("scan") || k === "workflow"),
  frame: [...TOOL_KEYS.frame],
  crop: TOOL_KEYS.crop.filter((k) => !k.startsWith("frame") && k !== "whitePadding"),
  tone: [...TOOL_KEYS.tone, "rawEngineStyle"],
  "input-color": ["inputGamutCompress", "applyCctfDecoding"],
  "output-color": ["outputGamutCompress", "upscaleFactor"],
  export: [...TOOL_KEYS.export],
  settings: [...TOOL_KEYS.settings, "gpuPreview", "gpuExport", "previewMaxSize", "lutResolution"],
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
  return (Z_PAGE_KEYS[page.id] ?? []).filter(
    (k) => JSON.stringify(at(params, k)) !== JSON.stringify(at(factory, k)),
  ).length;
}
export function resetZPage(params: DarkroomParams, page: ZPage): DarkroomParams {
  const next = structuredClone(params);
  for (const path of Z_PAGE_KEYS[page.id] ?? []) {
    const parts = path.split("."),
      key = parts.pop()!;
    let parent = next as unknown as Record<string, unknown>;
    for (const p of parts) parent = parent[p] as Record<string, unknown>;
    parent[key] = structuredClone(at(factory, path));
  }
  return next;
}
/** A bypassed stage stays discoverable; its stored settings are never erased. */
export function zBypassReason(params: DarkroomParams, id: string): string | null {
  const negative = params.experimental.workflow !== "normal";
  if (negative && id === "output")
    return "Для настоящего негатива способ конвертации выбирается в «Скан → Настоящий негатив». Эти варианты вывода относятся к эмуляции плёнки.";
  if (
    negative &&
    ["exposure", "prep", "lens", "taking-filter", "develop", "dir", "grain", "halation"].includes(
      id,
    )
  )
    return "Сейчас конвертируется настоящий негатив: подготовка, съёмочные эффекты и виртуальная проявка обходятся. Настройки сохранены для эмуляции плёнки.";
  if (
    ["paper", "paper-base", "test-print"].includes(id) &&
    (negative ? params.experimental.workflow !== "negative-print" : params.output.mode !== "paper")
  )
    return "Выбран цифровой вывод или негатив на просвет: фотобумага и параметры печати обходятся.";
  if (
    ["grain", "halation", "dir", "develop", "chemistry", "taking-filter", "film-base"].includes(
      id,
    ) &&
    params.filmStock === "none"
  )
    return "Плёнка не выбрана. Выберите материал в «Плёнка → Каталог».";
  if (
    params.rawEngine !== "spektrafilm" &&
    [
      "grain",
      "halation",
      "dir",
      "develop",
      "chemistry",
      "spectrum",
      "film-base",
      "output",
      "paper",
      "paper-base",
    ].includes(id)
  )
    return "Эти инструменты используют движок Spektrafilm. Выберите его в настройках цветонауки.";
  return null;
}
