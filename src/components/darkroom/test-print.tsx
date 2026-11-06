import { useEffect, useRef, useState } from "react";
import { printTrials, printTrialBlocker, type PrintTrial, type PrintTrialImage } from "@/lib/film/test-print";
import type { DarkroomParams } from "@/lib/film/types";

type Props = {
  params: DarkroomParams; sourceKey: string; hasImage: boolean; blocked: boolean;
  render: (params: DarkroomParams, exposures: number[], signal: AbortSignal, progress: (value:number)=>void) => Promise<PrintTrialImage[]>;
  apply: (exposure:number)=>void; close: ()=>void; cancelNative: ()=>void;
  onBusy: (value:boolean)=>void;
};
export function TestPrint({params, sourceKey, hasImage, blocked, render, apply, close, cancelNative, onBusy}:Props) {
  const [step,setStep]=useState(.5),[images,setImages]=useState<PrintTrialImage[]>([]),[selection,setSelection]=useState(2);
  const [progress,setProgress]=useState(0),[working,setWorking]=useState(false),[error,setError]=useState("");
  const [mode,setMode]=useState<"strips"|"full">("strips");
  const dialog=useRef<HTMLDivElement>(null), request=useRef<AbortController|null>(null), urls=useRef<string[]>([]);
  const closeRef=useRef(close);closeRef.current=close;
  const cancelRef=useRef(cancelNative);cancelRef.current=cancelNative;
  const trials=printTrials(Number.isFinite(params.printExposure)&&params.printExposure>0?params.printExposure:1,step);
  const fingerprint=sourceKey+JSON.stringify(params)+step;
  const [renderedKey,setRenderedKey]=useState("");
  const [renderedTrials,setRenderedTrials]=useState<PrintTrial[]>([]);
  const valid=images.length===5&&renderedKey===fingerprint;
  const displayTrials=renderedTrials.length===5?renderedTrials:trials;
  const blocker=!hasImage?"Сначала откройте фотографию.":printTrialBlocker(params);
  const revoke=()=>{urls.current.forEach(URL.revokeObjectURL);urls.current=[];};
  const cancel=()=>{if(request.current){request.current.abort();request.current=null;cancelRef.current();}setWorking(false);onBusy(false);};
  useEffect(()=>{
    const prior=document.activeElement as HTMLElement|null;dialog.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();closeRef.current();}
      if(event.key==="Tab"){
        const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,[tabindex="0"]')??[]).filter(n=>n.getClientRects().length);
        if(!nodes.length){event.preventDefault();return;}
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}
      }
    };
    dialog.current?.addEventListener('keydown',key);
    const element=dialog.current;
    return()=>{element?.removeEventListener('keydown',key);if(request.current){request.current.abort();cancelRef.current();}revoke();onBusy(false);if(prior?.isConnected)prior.focus();};
  },[onBusy]);
  useEffect(()=>{if(request.current)cancel();},[fingerprint]);
  const generate=async()=>{
    if(blocker||blocked||request.current)return;
    revoke();setImages([]);setError("");setSelection(2);setProgress(0);setWorking(true);onBusy(true);
    const controller=new AbortController();request.current=controller;
    try{
      const result=await render({...params},trials.map(t=>t.exposure),controller.signal,setProgress);
      if(controller.signal.aborted){result.forEach(image=>URL.revokeObjectURL(image.url));return;}
      if(result.length!==5){result.forEach(image=>URL.revokeObjectURL(image.url));throw new Error("Не удалось рассчитать все пять проб");}
      urls.current=result.map(image=>image.url);setImages(result);setRenderedTrials(trials);setRenderedKey(fingerprint);
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"Ошибка пробной печати");}
    finally{if(request.current===controller){request.current=null;setWorking(false);onBusy(false);}}
  };
  return <div className="test-print-backdrop">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Экспериментальная пробная печать" tabIndex={-1} className="test-print-dialog" onKeyDown={event=>event.stopPropagation()}>
      <header><div><span className="test-print-badge">ЭКСПЕРИМЕНТ</span><h2>Пробная печать</h2><p>Виртуальный увеличитель · пять относительных выдержек</p></div><button type="button" aria-label="Закрыть пробную печать" onClick={close}>×</button></header>
      <div className="test-print-controls"><label>Шаг между полосами<select aria-label="Шаг пробной печати" value={step} disabled={working} onChange={event=>setStep(Number(event.target.value))}><option value={.25}>¼ ступени</option><option value={.5}>½ ступени</option><option value={1}>1 ступень</option></select></label><button className="test-print-primary" type="button" disabled={!!blocker||blocked||working} onClick={()=>void generate()}>{working?`Расчёт · ${progress}/5`:images.length?"Пересчитать пробы":"Рассчитать 5 проб"}</button>{working?<button type="button" onClick={cancel}>Отменить расчёт</button>:null}</div>
      {blocker?<p className="test-print-note" role="status">{blocker} Для проб нужны плёнка, фотобумага и режим печати.</p>:null}
      {!blocker&&blocked?<p className="test-print-note">Дождитесь окончания обработки кадра.</p>:null}
      {error?<p className="test-print-error" role="alert">{error}</p>:null}
      {images.length>0?<>
        <div className="test-print-modes"><button type="button" aria-pressed={mode==="strips"} onClick={()=>setMode("strips")}>Полосы одного кадра</button><button type="button" aria-pressed={mode==="full"} onClick={()=>setMode("full")}>Варианты целиком</button></div>
        <div className={`test-print-board is-${mode}${!valid?" is-stale":""}`} style={mode==="strips"?{aspectRatio:`${images[0].width}/${images[0].height}`,maxWidth:`${50*images[0].width/images[0].height}dvh`}:{}}>
          {images.map((image,index)=><button key={index} type="button" className={selection===index?"is-selected":""} aria-pressed={selection===index} aria-label={`Проба ${index+1}: ${displayTrials[index].exposure.toFixed(2)}×`} onClick={()=>setSelection(index)}>
            <img src={image.url} alt={`Выдержка ${displayTrials[index].exposure.toFixed(2)}×`} style={mode==="strips"?{width:"500%",left:`${-index*100}%`}:{}} />
            <span>{displayTrials[index].ev>0?"+":""}{displayTrials[index].ev.toFixed(2)} EV<small>{displayTrials[index].exposure.toFixed(2)}×{displayTrials[index].limited?" · предел":""}</small></span>
          </button>)}
        </div>
        {!valid?<p className="test-print-note" role="status">Кадр, настройки или шаг изменились. Пересчитайте пробы перед применением.</p>:null}
      </>:<div className="test-print-empty" role="status">{working?`Рассчитываются пробы: ${progress} из 5…`:"Выберите шаг и рассчитайте пробы. Обработка кадра пока не изменится."}</div>}
      <footer><p>Каждая проба рассчитана движком на уменьшенном кадре. Выдержки относительные, не секунды. Нормализация бумаги и остальные настройки сохраняются. Зерно и детали полного экспорта могут отличаться.</p><button type="button" className="test-print-primary" disabled={!valid||working||!!blocker||blocked} onClick={()=>{apply(trials[selection].exposure);close();}}>Применить выбранную выдержку</button></footer>
    </div>
  </div>;
}
