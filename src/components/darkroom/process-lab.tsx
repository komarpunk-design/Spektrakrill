import { useEffect, useRef, useState } from "react";
import { DEVELOPMENT_FAMILIES, developmentFamilyFor, developmentKey, developmentParams, type DevelopmentFamily } from "@/lib/film/development-process";
import type { DarkroomParams } from "@/lib/film/types";
import type { PrintTrialImage } from "@/lib/film/test-print";

type Props = {
  params: DarkroomParams; sourceKey: string; hasImage: boolean; blocked: boolean;
  render: (params: DarkroomParams[], signal: AbortSignal, progress: (value:number)=>void)=>Promise<PrintTrialImage[]>;
  apply: (patch: Partial<DarkroomParams>)=>void; cancelNative: ()=>void; onBusy: (value:boolean)=>void;
};
export function ProcessLab({params,sourceKey,hasImage,blocked,render,apply,cancelNative,onBusy}:Props) {
  const [familyId,setFamilyId]=useState(()=>developmentFamilyFor(params.filmStock)?.id??DEVELOPMENT_FAMILIES[0].id);
  const family:DevelopmentFamily=DEVELOPMENT_FAMILIES.find(item=>item.id===familyId)!;
  const [paper,setPaper]=useState(false),[images,setImages]=useState<PrintTrialImage[]>([]),[selected,setSelected]=useState(family.reference);
  const [working,setWorking]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(""),[renderedKey,setRenderedKey]=useState("");
  const request=useRef<AbortController|null>(null),urls=useRef<string[]>([]),cancelRef=useRef(cancelNative);
  cancelRef.current=cancelNative;
  const key=sourceKey+family.id+paper+developmentKey(params,family,paper);
  const valid=images.length===family.variants.length&&key===renderedKey;
  const blocker=!hasImage?"Откройте фотографию, чтобы сравнить проявки.":params.rawEngine!=="spektrafilm"?"Для сравнения выберите движок Spektrafilm в меню обработки.":"";
  const revoke=()=>{urls.current.forEach(URL.revokeObjectURL);urls.current=[];};
  const cancel=()=>{if(request.current){request.current.abort();request.current=null;cancelRef.current();}setWorking(false);onBusy(false);};
  useEffect(()=>()=>{if(request.current){request.current.abort();cancelRef.current();}revoke();onBusy(false);},[onBusy]);
  useEffect(()=>{cancel();revoke();setImages([]);setSelected(family.reference);setError("");},[key]);
  const generate=async()=>{
    if(blocker||blocked||request.current)return;
    revoke();setImages([]);setError("");setProgress(0);setWorking(true);onBusy(true);
    const controller=new AbortController();request.current=controller;
    try{
      const result=await render(family.variants.map(variant=>developmentParams(params,family,variant.id,paper)),controller.signal,setProgress);
      if(controller.signal.aborted){result.forEach(image=>URL.revokeObjectURL(image.url));return;}
      if(result.length!==family.variants.length){result.forEach(image=>URL.revokeObjectURL(image.url));throw new Error("Не все варианты рассчитаны");}
      urls.current=result.map(image=>image.url);setImages(result);setRenderedKey(key);
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"Ошибка сравнения проявок");}
    finally{if(request.current===controller){request.current=null;setWorking(false);onBusy(false);}}
  };
  return <section className="process-lab" aria-label="Лаборатория Push / Pull">
    <header><span className="test-print-badge">ЛАБОРАТОРИЯ ПРОЯВКИ</span><h1>Push / Pull</h1><p>Один кадр · разные профили проявки · единые настройки печати</p></header>
    <div className="process-controls"><label>Плёнка и проявитель<select aria-label="Плёнка и проявитель" value={familyId} onChange={event=>setFamilyId(event.target.value)}>{DEVELOPMENT_FAMILIES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="process-paper"><input type="checkbox" checked={paper} onChange={event=>setPaper(event.target.checked)}/>Печатать на рекомендованной бумаге</label>
      <button type="button" className="test-print-primary" disabled={!!blocker||blocked||working} onClick={()=>void generate()}>{working?`Расчёт ${progress}/${family.variants.length}`:"Сравнить проявки"}</button>
      {working?<button type="button" onClick={cancel}>Отменить расчёт</button>:null}</div>
    <p className="process-note">{family.id==="portra800"?"Portra 800: обычная проявка и отдельные профили Push +1 / +2.":"Pull и Push обозначают сокращённую и увеличенную проявку относительно среднего профиля в этом сравнении. Время взято из названия профиля; оно не эквивалентно заданному числу EV."} Экспозиция кадра сохраняется.</p>
    {!family.variants.some(variant=>variant.id===params.filmStock)?<p className="process-note">Выбрано другое семейство плёнки. Применение заменит текущую плёнку выбранным профилем.</p>:null}
    {blocker?<p role="status" className="process-note">{blocker}</p>:null}
    {blocked&&!blocker?<p role="status" className="process-note">Дождитесь окончания обработки кадра.</p>:null}
    {error?<p role="alert" className="test-print-error">{error}</p>:null}
    <div className="process-board" aria-busy={working}>{family.variants.map((variant,index)=><button type="button" key={variant.id} className={`process-card ${selected===index?"is-selected":""}`} aria-pressed={selected===index} aria-label={variant.label} onClick={()=>setSelected(index)}>
      <div className="process-image">{images[index]?<img src={images[index].url} alt={variant.name}/>:<span>{working?"Проявляем…":variant.kind==="pull"?"−":variant.kind==="push"?"+":"N"}</span>}</div>
      <strong>{variant.label}</strong><small>{variant.name}</small>{params.filmStock===variant.id?<em>Применён сейчас</em>:null}
    </button>)}</div>
    <footer><p>Предпросмотр рассчитан движком на уменьшенном кадре. Зерно и детали полного экспорта могут отличаться. Применение сохраняется одним шагом в истории.</p><button type="button" className="test-print-primary" disabled={!valid||working||blocked||!!blocker} onClick={()=>apply({filmStock:family.variants[selected].id,...(paper?{printPaper:family.paper,scanFilm:false}:{})})}>Применить выбранную проявку</button></footer>
  </section>;
}
