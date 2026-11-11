import {Field,Select,SliderRow,ToggleRow} from '@/components/ui/control';
import {ControlSection,ToolLinks} from './workflow-ui';
import {useDarkroom} from '@/lib/film/store';
import {bundledCatalog} from '@/lib/film/profiles';
import {defaultOutput,type OutputParams} from '@/lib/film/output-model';
import {isFilmBypass} from '@/lib/film/types';
const choices=[
 {value:'paper',label:'Фотобумага / кинопозитив',detail:'Печать через увеличитель на выбранную бумагу или позитивную плёнку. Свет, фильтры и химия доступны в меню «Бумага».'},
 {value:'digital',label:'Digital Reference · нейтральный позитив',detail:'Нейтральный цифровой позитив без фотобумаги. Сохраняет постоянную настройку цвета и тона независимо от содержимого кадра.'},
 {value:'auto-levels',label:'Auto Levels · автоматический позитив',detail:'Тот же цифровой приёмник с настройкой крайних тонов по содержимому кадра. Удобен для кадров с разным освещением.'},
 {value:'lab-scan',label:'Lab Scan · минилаб',detail:'Позитив с характером минилаба: глубокий чёрный, прохладные тени, характерные зелёные и синие. Экспериментальная адаптация Lab Scan из Fotufilm.'},
 {value:'negative',label:'Негатив · на просвет',detail:'Показывает проявленную плёнку до печати и инверсии. Цветная маска и обратные тона здесь ожидаемы.'},
];
export function OutputControls({embedded=false}:{embedded?:boolean}){
 const params=useDarkroom(s=>s.params),patch=useDarkroom(s=>s.patch),p=params.output??defaultOutput();
 const update=(v:Partial<OutputParams>)=>patch({output:{...p,...v},...(v.mode?{scanFilm:false}:{})});
 const active=choices.find(x=>x.value===p.mode)!,film=bundledCatalog.films.find(f=>f.id===params.filmStock),isPositive=film?.type==='positive',noFilm=isFilmBypass(params.filmStock),negativeWorkflow=params.experimental.workflow!=='normal';
 const row=(key:'exposure'|'cyan'|'magenta'|'yellow'|'look',label:string,min:number,max:number)=> <SliderRow key={key} label={label} hint={p[key].toFixed(2)+(key==='exposure'?' EV':'')} min={min} max={max} step={.05} value={p[key]} onChange={v=>update({[key]:v})}/>;
 return <>
 <div className="px-4 py-2"><Field label="Способ получения результата"><Select value={p.mode} onChange={v=>update({mode:v as OutputParams['mode']})} options={choices.map(({value,label})=>({value,label}))} ariaLabel="Способ получения результата"/></Field><p className="lab-note output-description">{active.detail}</p></div>
 {noFilm?<div className="output-notice">Сначала выберите плёнку. Без плёнки сохраняется цифровой исходник.<ToolLinks tools={['film']}/></div>:negativeWorkflow?<div className="output-notice">Сейчас включена конвертация настоящего негатива. Её маршрут задаётся в меню «Сканы негативов», а эти модели применяются к виртуальной плёнке.<ToolLinks tools={['negative']}/></div>:isPositive&&p.mode!=='paper'?<p className="output-notice">Для слайда используется прямой просмотр позитивной плёнки. Инверсия и отделка минилаба предназначены для негативных материалов.</p>:null}
 {p.mode==='lab-scan'&&!isPositive&&!negativeWorkflow&&!noFilm?<>
 <ToggleRow label="Автонастройка минилаба" checked={p.autoSetup} onChange={autoSetup=>update({autoSetup})}/>
 {row('look','Характер минилаба',0,1)}
 </>:null}
 {['digital','auto-levels','lab-scan'].includes(p.mode)&&!noFilm&&!isPositive&&!negativeWorkflow?<ControlSection title="Плотность и цвет скана" description="Операторские поправки после проявки. Экспозиция съёмки и Push / Pull остаются прежними." keys={['output.exposure','output.cyan','output.magenta','output.yellow']}>
 {row('exposure','Яркость скана',-6,6)}{row('cyan','Ключ Cyan',-1,1)}{row('magenta','Ключ Magenta',-1,1)}{row('yellow','Ключ Yellow',-1,1)}
 </ControlSection>:null}
 {!embedded?<ToolLinks tools={p.mode==='paper'?['print','scan','export']:['scan','export']}/>:null}
 </>;
}
