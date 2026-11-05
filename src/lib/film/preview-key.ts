import type { DarkroomParams } from "./types";

/** Params that do not change the film simulation — skip the engine. */
const DISPLAY_ONLY: (keyof DarkroomParams)[] = [
  "exportFormat",
  "exportQuality",
  "exportMaxEdge",
  "gray18Canvas",
  "whitePadding",
  "autoPreview",
  "gpuExport",
  "cropAspect",
];

export function previewSignature(p: DarkroomParams): string {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p) as [keyof DarkroomParams, DarkroomParams[keyof DarkroomParams]][]) {
    if (DISPLAY_ONLY.includes(k)) continue;
    copy[k] = v;
  }
  return JSON.stringify(copy);
}
