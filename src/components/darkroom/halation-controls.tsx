import {defaultParams} from "@/lib/film/defaults";
import { useDarkroom } from "@/lib/film/store";
import { Field, Select, SliderRow, ToggleRow } from "@/components/ui/control";
import { ControlSection } from "./workflow-ui";
import { constructionName, constructionCapabilities } from "@/lib/film/layered-transport";
export function HalationControls({ showLegacyDetails = false,sourceOnly=false }: { showLegacyDetails?: boolean;sourceOnly?:boolean }) {
  const params = useDarkroom((s) => s.params),
    setParam = useDarkroom((s) => s.setParam),
    patch = useDarkroom((s) => s.patch),
    p = params.transport;
  const capabilities = constructionCapabilities(params.filmStock);
  const update = (key: "antiHalation" | "baseThickness" | "pressurePlate" | "hazeUm", v: number) =>
    setParam("transport", { ...p, [key]: v });
  return (
    <>
      <ToggleRow
        label={sourceOnly?"Использовать Layered Transport":"Гало вокруг светов"}
        hint="Свечение у ламп, солнца и ярких бликов на плёнке."
        checked={sourceOnly?p.model==="layered"&&params.halationActive:params.halationActive}
        onChange={(v) => sourceOnly?patch({transport:{...p,model:v?"layered":"legacy"},...(v?{halationActive:true}:{})}):setParam("halationActive", v)}
      />
      {params.halationActive && (!sourceOnly||p.model==="layered") ? (
        <>
          {!sourceOnly?<div className="px-4 py-2">
            <Field label="Модель свечения">
              <Select
                ariaLabel="Модель свечения"
                value={p.model}
                onChange={(v) => setParam("transport", { ...p, model: v as "legacy" | "layered" })}
                options={[
                  { value: "legacy", label: "Прежняя · мягкое свечение" },
                  { value: "layered", label: "Layered Transport · слои плёнки" },
                ]}
              />
            </Field>
          </div>:null}
          <SliderRow
            label="Сила гало"
            hint={params.halationAmount.toFixed(2)}
            min={0}
            max={3}
            step={0.05}
            value={params.halationAmount}
            onChange={(v) => setParam("halationAmount", v)} defaultValue={defaultParams().halationAmount}
          />
          <SliderRow
            label="Размер гало"
            hint={params.halationSpatialScale.toFixed(2)}
            min={0.2}
            max={3}
            step={0.1}
            value={params.halationSpatialScale}
            onChange={(v) => setParam("halationSpatialScale", v)} defaultValue={defaultParams().halationSpatialScale}
          />
          {showLegacyDetails && p.model === "legacy" ? (
            <ControlSection
              title="Прежняя модель · точная настройка"
              description="Рассеяние света, подсветка светов и повторные отражения. Не используются для геометрии Layered Transport."
            >
              {(
                [
                  ["scatterAmount", "Рассеяние", 0, 2, 0.05],
                  ["scatterSpatialScale", "Масштаб рассеяния", 0.2, 3, 0.1],
                  ["boostEv", "Подсветка EV", 0, 4, 0.5],
                  ["protectEv", "Защита EV", 0, 8, 0.5],
                  ["boostRange", "Диапазон", 0.05, 1, 0.05],
                  ["halationNBounces", "Отскоки", 1, 5, 1],
                  ["halationBounceDecay", "Затухание", 0.1, 0.95, 0.05],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={params[key].toFixed(2)}
                  min={min}
                  max={max}
                  step={step}
                  value={params[key]}
                  onChange={(v) => setParam(key, v)} defaultValue={defaultParams()[key]}
                />
              ))}
              <ToggleRow
                label="Нормализация"
                checked={params.halationRenormalize}
                onChange={(v) => setParam("halationRenormalize", v)}
              />
            </ControlSection>
          ) : null}
          {p.model === "layered" ? (
            <>
              <p className="transport-construction">
                {constructionName(params.filmStock)}. Параметры описывают модель материала, а не
                измеренную конструкцию вашей плёнки.
              </p>
              {!capabilities.absorber ? (
                <p className="transport-construction">
                  В этой конструкции антигаляционный слой уже удалён. Его регулятор не применяется.
                </p>
              ) : null}
              <SliderRow
                disabled={!capabilities.absorber}
                label="Антигаляционный слой"
                hint={p.antiHalation.toFixed(2) + "×"}
                min={0}
                max={4}
                step={0.05}
                value={p.antiHalation}
                onChange={(v) => update("antiHalation", v)}
              />
              <SliderRow
                label="Толщина основы"
                hint={p.baseThickness.toFixed(2) + "×"}
                min={0.25}
                max={3}
                step={0.05}
                value={p.baseThickness}
                onChange={(v) => update("baseThickness", v)}
              />
              {!capabilities.plate ? (
                <p className="transport-construction">
                  Непрозрачная подложка закрывает прижимную пластину; отражение от неё не
                  учитывается.
                </p>
              ) : null}
              <SliderRow
                disabled={!capabilities.plate}
                label="Отражение прижимной пластины"
                hint={Math.round(p.pressurePlate * 100) + "%"}
                min={0}
                max={1}
                step={0.05}
                value={p.pressurePlate}
                onChange={(v) => update("pressurePlate", v)}
              />
              <SliderRow
                label="Мутность основы"
                hint={p.hazeUm.toFixed(0) + " µm"}
                min={0}
                max={500}
                step={5}
                value={p.hazeUm}
                onChange={(v) => update("hazeUm", v)}
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
