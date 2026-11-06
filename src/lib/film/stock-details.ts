/** Catalog presentation adapted from hwx959/Spektrafilm-android (GPLv3).
 * See THIRD_PARTY_NOTICES.md; descriptions are translated to Russian. */
import detailsJson from "./stock-details.json" with { type: "json" };

type Detail = { manufacturer: string; group: string; kind: string; balance: string | null; year: string; summary: string };
const details: Record<string, Detail> = detailsJson;
const groups: Record<string, string> = {
  color_negative: "Цветной негатив", color_reversal: "Цветной слайд", cine_negative: "Киноплёнка",
  motion_picture: "Киноплёнка", motion_picture_negative: "Киноплёнка", print_film: "Копировальная плёнка", print_paper: "Фотобумага",
};
export function stockDetail(id: string): Detail | undefined { return details[id]; }
export function stockSpec(item: { id: string; iso?: number | null }): string {
  const info = stockDetail(item.id);
  const light = info?.balance === "daylight" ? "Дневной свет" : info?.balance === "tungsten" ? "Лампы накаливания" : "";
  return [item.iso ? `ISO ${item.iso}` : "", light].filter(Boolean).join(" · ");
}
export function stockCategory(id: string): string {
  const item = stockDetail(id);
  if (!item) return "Пользовательский профиль";
  return groups[item.group] || (item.kind === "print_paper" ? "Фотобумага" : item.kind === "print_film" ? "Копировальная плёнка" : "Фотоплёнка");
}
