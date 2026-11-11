import {ControlSection} from "./workflow-ui";
import { SliderRow } from "@/components/ui/control";
import { useDarkroom } from "@/lib/film/store";
import { defaultPrep, type PrepParams } from "@/lib/film/negs-prep";
export function PrepControls() {
  const prep = useDarkroom((s) => s.params.prep) ?? defaultPrep(),
    setParam = useDarkroom((s) => s.setParam),
    setTool = useDarkroom((s) => s.setTool);
  const row = (key: keyof PrepParams, label: string, min = -100, max = 100, step = 1) => (
    <SliderRow
      key={key}
      defaultValue={defaultPrep()[key]}
      label={label}
      hint={prep[key].toFixed(key === "exposure" ? 2 : 0) + (key === "exposure" ? " EV" : "")}
      min={min}
      max={max}
      step={step}
      value={prep[key]}
      onChange={(value) => setParam("prep", { ...prep, [key]: value })}
    />
  );
  return (
    <section className="development-controls" aria-label="Подготовка изображения">
      <ControlSection title="Экспозиция подготовки" description="Общая яркость перед плёнкой, независимо от компенсации печати." defaultOpen={true}>
        {row("exposure", "Экспозиция подготовки", -3, 3, 0.05)}
        <p className="lab-note">
          Этот сдвиг не компенсируется при печати. Экспозиция съёмки остаётся в «Камера → Экспозиция».
        </p>
        <button type="button" className="lab-ghost" onClick={() => setTool("camera")}>
          Баланс белого и камера →
        </button>
      </ControlSection>
      <ControlSection title="Света и тени" description="Тональный диапазон и контраст исходной фотографии." defaultOpen={true}>
        {row("highlights", "Света", -180, 100)}
        {row("shadows", "Тени")}
        {row("contrast", "Контраст подготовки")}
        {row("lift", "Подъём чёрного · Lift")}
        {row("gain", "Усиление · Gain")}
      </ControlSection>
      <ControlSection title="Цвет исходника" description="Насыщенность и усиление слабых цветов до плёнки." defaultOpen={false}>
        {row("colorBoost", "Color Boost")}
        {row("saturation", "Насыщенность подготовки")}
      </ControlSection>
      <ControlSection title="Локальные детали" description="Усиление или смягчение фактур без изменения общей яркости." defaultOpen={false}>
        {row("detail", "Детали средних тонов")}
        <p className="lab-note">
          Направляемый фильтр отделяет локальные детали от основы яркости. Обработка требует всего
          кадра, поэтому во время изменения этого параметра предпросмотр может считать дольше.
        </p>
      </ControlSection>
      <p className="development-limit">
        Перенесено из Negs: алгоритмы Prep и guided base. Для конвертации сканов негативов
        подготовка отключена, чтобы не искажать измеренные плотности.
      </p>
    </section>
  );
}
