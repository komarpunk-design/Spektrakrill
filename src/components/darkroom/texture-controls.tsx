import {HalationControls} from "./halation-controls";
import {useDarkroom} from '@/lib/film/store';
import {SliderRow,ToggleRow} from '@/components/ui/control';
import {ControlSection} from '@/components/darkroom/workflow-ui';
import {EmulsionControls} from '@/components/darkroom/emulsion-controls';
export function TextureControls(){
 const params=useDarkroom(s=>s.params),setParam=useDarkroom(s=>s.setParam);
 const fmt=(n:number,digits=2)=>n.toFixed(digits);
 return <>
 <ControlSection title="Зерно" description="Зернистая структура изображения; её масштаб зависит от формата кадра." defaultOpen keys={["grainActive","grainBlur","experimental.grainRms"]}>
 <ToggleRow label="Зерно" checked={params.grainActive} onChange={v=>setParam('grainActive',v)}/>
 {params.grainActive?<>
 <SliderRow label="Размытие зерна" hint={fmt(params.grainBlur)} min={0} max={1.4} step={.05} value={params.grainBlur} onChange={v=>setParam('grainBlur',v)}/>
 <EmulsionControls mode="grain"/>
 {!params.experimental.grainRms?<ControlSection title="Ручной размер частиц" description="Параметры прежней модели. При включённом RMS размер вычисляется автоматически.">
 <SliderRow label="Частица, µm²" min={.04} max={1.2} step={.02} value={params.grainParticleArea} hint={fmt(params.grainParticleArea)} onChange={v=>setParam('grainParticleArea',v)}/>
 <ToggleRow label="Подслои" checked={params.grainSublayers} onChange={v=>setParam('grainSublayers',v)}/>
 <SliderRow label="Равномерность" min={.85} max={.995} step={.005} value={params.grainUniformity} hint={fmt(params.grainUniformity,3)} onChange={v=>setParam('grainUniformity',v)}/>
 <SliderRow label="Dmin зерна" min={0} max={.3} step={.01} value={params.grainDensityMin} hint={fmt(params.grainDensityMin,3)} onChange={v=>setParam('grainDensityMin',v)}/>
 {(['R','G','B'] as const).map(c=><SliderRow key={c} label={'Масштаб '+c} min={.4} max={c==='B'?5:4} step={.05} value={params[('grainScale'+c) as 'grainScaleR']} onChange={v=>setParam(('grainScale'+c) as 'grainScaleR',v)}/>)}
 </ControlSection>:null}
 <SliderRow label="Облака, µm" hint={fmt(params.grainDyeCloudsUm)} min={0} max={4} step={.1} value={params.grainDyeCloudsUm} onChange={v=>setParam('grainDyeCloudsUm',v)}/>
 </>:null}</ControlSection>
 <section className="transport-page"><h3>Гало и слои плёнки</h3><HalationControls showLegacyDetails/></section>
 <ControlSection title="DIR · взаимодействие слоёв" description="Развитие соседних слоёв меняет цвет и локальный контраст у границ." keys={["couplersActive","couplersAmount","inhibitionInterlayer"]}>
          <ToggleRow
            label="DIR-каплеры"
            checked={params.couplersActive}
            onChange={(v) => setParam("couplersActive", v)}
          />
          {params.couplersActive ? (
            <>
              <SliderRow
                label="Количество"
                hint={fmt(params.couplersAmount)}
                min={0}
                max={2.5}
                step={0.05}
                value={params.couplersAmount}
                onChange={(v) => setParam("couplersAmount", v)}
              />
              <SliderRow
                label="Межслойное"
                hint={fmt(params.inhibitionInterlayer)}
                min={0}
                max={2}
                step={0.05}
                value={params.inhibitionInterlayer}
                onChange={(v) => setParam("inhibitionInterlayer", v)}
              />
              <SliderRow
                label="Свой слой"
                hint={fmt(params.inhibitionSamelayer)}
                min={0}
                max={2}
                step={0.05}
                value={params.inhibitionSamelayer}
                onChange={(v) => setParam("inhibitionSamelayer", v)}
              />
              <ControlSection title="Распространение DIR" description="Радиус действия ингибиторов проявления между соседними участками.">{(
                <SliderRow
                  label="Диффузия, µm"
                  hint={fmt(params.couplerDiffusionUm, 0)}
                  min={0}
                  max={80}
                  step={5}
                  value={params.couplerDiffusionUm}
                  onChange={(v) => setParam("couplerDiffusionUm", v)}
                />
              )}</ControlSection>
            </>
          ) : null}
<EmulsionControls mode="dir"/></ControlSection>
 </>;
}
