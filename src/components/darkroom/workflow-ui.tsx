import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useDarkroom,type ToolId} from '@/lib/film/store';
import {defaultParams} from '@/lib/film/defaults';
import {TOOL_GUIDE,stageForTool} from '@/lib/film/workflow-guide';
import {toolChangeCount} from '@/lib/film/tool-state';
export function WorkflowTools({tool,select}:{tool:ToolId;select:(tool:ToolId)=>void}){
 const params=useDarkroom(s=>s.params),stage=stageForTool(tool),nav=useRef<HTMLElement>(null);
 useEffect(()=>{nav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:"nearest",inline:"nearest"});},[tool]);
 return <nav ref={nav} className="workflow-tools" aria-label={`Разделы этапа «${stage.label}»`}>{stage.tools.filter(id=>id!=='tone'||params.rawEngine!=='spektrafilm').map(id=><button key={id} type="button" aria-pressed={id===tool} onClick={()=>select(id)} title={TOOL_GUIDE[id].purpose}>{TOOL_GUIDE[id].short}{toolChangeCount(params,id)>0?<i aria-label="Есть изменения"/>:null}</button>)}</nav>;
}
export function ToolIntro({tool}:{tool:ToolId}){
 const guide=TOOL_GUIDE[tool],stage=stageForTool(tool),help=useDarkroom(s=>s.prefs.showControlHelp),setPref=useDarkroom(s=>s.setPref);
 return <header className="workflow-intro"><div><span>{stage.number?`${stage.number} · `:''}{stage.label}</span><button type="button" aria-pressed={help!==false} aria-label="Показывать пояснения к настройкам" onClick={()=>setPref('showControlHelp',help===false)}>{help===false?'Пояснения скрыты':'Пояснения включены'}</button></div><h2>{guide.title}</h2><p>{guide.purpose}</p><small>{guide.when}</small></header>;
}
export function ControlSection({title,description,children,defaultOpen=false,keys=[]}:{title:string;description:string;children:ReactNode;defaultOpen?:boolean;keys?:string[]}){
 const params=useDarkroom(s=>s.params),baseline=defaultParams();
 const get=(o:unknown,path:string):unknown=>path.split('.').reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as Record<string,unknown>)[k]:undefined,o);
 const changes=keys.filter(k=>JSON.stringify(get(params,k))!==JSON.stringify(get(baseline,k))).length;
 const [open,setOpen]=useState(()=>defaultOpen);
 return <details className="control-section" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span><strong>{title}</strong><small>{description}</small></span><span className="control-section-meta">{changes>0?<b>{changes} изм.</b>:null}<i aria-hidden="true">{open?'−':'+'}</i></span></summary><div className="control-section-body">{children}</div></details>;
}
export function ToolLinks({tools}:{tools:ToolId[]}){const setTool=useDarkroom(s=>s.setTool);return <div className="workflow-links">{tools.map(id=><button key={id} type="button" onClick={()=>setTool(id)}><strong>{TOOL_GUIDE[id].short}<span>→</span></strong><small>{TOOL_GUIDE[id].purpose}</small></button>)}</div>}
