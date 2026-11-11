import {NEGS_FILM_FORMATS} from "@/lib/film/negs-film-formats";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import {Field,Select,ToggleRow} from "@/components/ui/control";
import { HalationControls } from "./halation-controls";
import { OutputControls } from "./output-controls";
import { EmulsionControls } from "./emulsion-controls";
export function SourceBack({ source }: { source: ToolId }) {
  const setTool = useDarkroom((s) => s.setTool);
  return (
    <button type="button" className="source-back" onClick={() => setTool(source)}>
      ← {source === "fotufilm" ? "Fotufilm" : source === "negs" ? "Negs" : "Spektrafilm"}
    </button>
  );
}
export function FotufilmControls() {
  return (
    <div className="source-controls" data-source="fotufilm">
      <header>
        <span>FOTUFILM</span>
        <h2>Инструменты Fotufilm</h2>
        <p>
          Перенесённые модели вывода и оптического свечения. Основные инструменты Spektrafilm
          остаются на прежних вкладках.
        </p>
      </header>
      <section>
        <h3>Outputs · готовый результат</h3>
        <OutputControls embedded />
      </section>
      <section>
        <h3>Layered Transport · слои плёнки</h3>
        <p className="source-note">
          Послойный расчёт галяции. Отключение этой модели возвращает прежнюю галяцию Spektrafilm.
        </p>
        <HalationControls sourceOnly />
      </section>
    </div>
  );
}
export function NegsControls() {
  const setTool = useDarkroom((s) => s.setTool),
    p = useDarkroom((s) => s.params),
    setParam = useDarkroom((s) => s.setParam);
  return (
    <div className="source-controls" data-source="negs">
      <header>
        <span>NEGS</span>
        <h2>Инструменты Negs</h2>
        <p>
          Подготовка исходника, RMS-зерно и взаимодействие слоёв. Плёнки Negs доступны в коллекции
          Negs на вкладке «Плёнка».
        </p>
      </header>
      <button type="button" className="source-link" onClick={() => setTool("prep")}>
        Подготовка изображения · Prep →
      </button>
      <section>
        <h3>Физический формат кадра</h3>
        <div className="px-4 py-2"><Field label="Формат кадра · Negs"><Select ariaLabel="Формат кадра · Negs" value={String(p.filmFormatMm)} onChange={value=>setParam('filmFormatMm',Number(value))} options={[...(!NEGS_FILM_FORMATS.some(f=>f.mm===p.filmFormatMm)?[{value:String(p.filmFormatMm),label:`Свой · ${p.filmFormatMm} мм`}]:[]),...NEGS_FILM_FORMATS.map(f=>({value:String(f.mm),label:f.label}))]}/></Field></div>
      </section>
      <section>
        <h3>Зерно · RMS</h3>
        <ToggleRow
          label="Зерно"
          checked={p.grainActive}
          onChange={(v) => setParam("grainActive", v)}
        />
        <EmulsionControls mode="grain" />
      </section>
      <section>
        <h3>Взаимодействие слоёв · DIR</h3>
        <ToggleRow
          label="DIR-каплеры"
          checked={p.couplersActive}
          onChange={(v) => setParam("couplersActive", v)}
        />
        <EmulsionControls mode="dir" />
      </section>
    </div>
  );
}
export function SpektrafilmExtras() {
  const setTool = useDarkroom((s) => s.setTool);
  return (
    <section className="source-extras">
      <h3>Spektrafilm · experimental</h3>
      <button className="source-link" type="button" onClick={() => setTool("emulsion")}>
        Эмульсия, спектр и подложка →
      </button>
      <button className="source-link" type="button" onClick={() => setTool("negative")}>
        Конвертация настоящего негатива →
      </button>
    </section>
  );
}
