import data from "./development-processes.json" with { type: "json" };
import type {DarkroomParams} from "./types.ts";
export type DevelopmentVariant={id:string;label:string;kind:string;name:string};
export type DevelopmentFamily={id:string;label:string;reference:number;paper:string;variants:DevelopmentVariant[]};
export const DEVELOPMENT_FAMILIES:DevelopmentFamily[]=data;
export function developmentFamilyFor(stock:string):DevelopmentFamily|undefined{return DEVELOPMENT_FAMILIES.find(f=>f.variants.some(v=>v.id===stock));}
export function developmentParams(base:DarkroomParams,family:DevelopmentFamily,variantId:string,paper:boolean):DarkroomParams{
 if(!family.variants.some(v=>v.id===variantId))throw new Error("Профиль не относится к выбранному процессу");
 return {...base,filmStock:variantId,...(paper?{printPaper:family.paper,scanFilm:false}:{})};
}
export function developmentKey(base:DarkroomParams,family:DevelopmentFamily,paper:boolean):string{
 return JSON.stringify(developmentParams(base,family,family.variants[family.reference].id,paper));
}
