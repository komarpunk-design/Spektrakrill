import index from "./control-index.json" with { type: "json" };
import { defaultParams } from "./defaults.ts";
export function controlDefault(
  label: string,
  tool: string,
  min: number,
  max: number,
  step: number,
): number | undefined {
  const aliases: Record<string, string[]> = {
    fotufilm: ["fotufilm"],
    negs: ["negs", "emulsion"],
    texture: ["texture", "film"],
  };
  const candidates = index.defaults.filter(
    (r) =>
      r.label === label &&
      (r.tool === tool || aliases[tool]?.includes(r.tool)) &&
      Number(r.min) === min &&
      Number(r.max) === max &&
      Number(r.step) === step,
  );
  const values = candidates
    .map((r) =>
      r.path
        .split(".")
        .reduce<unknown>(
          (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
          defaultParams(),
        ),
    )
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length && values.every((v) => v === values[0]) ? values[0] : undefined;
}
