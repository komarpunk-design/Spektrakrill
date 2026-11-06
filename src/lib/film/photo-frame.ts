export type FrameStyle = "none" | "white" | "black" | "instant" | "film" | "135" | "120" | "minimal";
export const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: "none", label: "Без рамки" },
  { value: "135", label: "135 — перфорация" }, { value: "120", label: "120 — плёночный край" },
  { value: "minimal", label: "Минималистичная белая кромка" }, { value: "white", label: "Белое паспарту" },
  { value: "black", label: "Чёрная рамка" }, { value: "instant", label: "Моментальный снимок" },
  { value: "film", label: "Плёнка 35 мм" },
];
export function sanitizeFrameStyle(value: unknown): FrameStyle {
  return FRAME_STYLES.some(style => style.value === value) ? value as FrameStyle : "none";
}
export interface FilmEdgeOptions { frameNumber?: number; frameBarcode?: boolean; frameDate?: string; filmStock?: string }
export function isOriginalEdge(style: FrameStyle): boolean { return ["135", "120", "minimal", "film"].includes(style); }
const nativePixels = (short: number, ratio: number, min: number) => Math.max(min, Math.trunc(Math.fround(Math.fround(short) * Math.fround(ratio))));
export function edgeLabel(settings: FilmEdgeOptions): string {
  return settings.filmStock && settings.filmStock !== "none" ? settings.filmStock.replaceAll("_", " ").toUpperCase() : "SPEKTRAFILM";
}
export function frameGeometry(w: number, h: number, style: FrameStyle, width: number) {
  const short = Math.min(w,h);
  if (style === "135" || style === "film") { const p=nativePixels(short,.012,3), top=nativePixels(short,.115,14), bottom=nativePixels(short,.165,20); return {width:w+2*p,height:h+top+bottom,x:p,y:top,p}; }
  if (style === "120") { const p=nativePixels(short,.018,4), top=nativePixels(short,.145,16); return {width:w+2*p,height:h+2*top,x:p,y:top,p}; }
  if (style === "minimal") { const p=nativePixels(short,.045,10), bottom=nativePixels(short,.11,24); return {width:w+2*p,height:h+p+bottom,x:p,y:p,p}; }
  const ratio = Number.isFinite(width) ? Math.max(0.01, Math.min(0.2, width)) : 0.04;
  const p = style === "none" ? 0 : Math.max(1, Math.round(Math.min(w, h) * ratio));
  const top = p;
  const bottom = style === "instant" ? 3 * p : top;
  return { width: w + 2 * p, height: h + top + bottom, x: p, y: top, p };
}
/** Border is added outside the image; no image pixels are cropped or covered. */
export function framedCanvas(image: CanvasImageSource, w: number, h: number, style: FrameStyle, width: number, settings: FilmEdgeOptions = {}): HTMLCanvasElement {
  const g = frameGeometry(w, h, style, width);
  const canvas = document.createElement("canvas"); canvas.width = g.width; canvas.height = g.height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas");
  if (isOriginalEdge(style)) {
    drawOriginalEdge(ctx, image, w, h, style, g, settings);
    return canvas;
  }
  ctx.fillStyle = style === "black" || style === "film" ? "#141414" : "#f5f2e9";
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.drawImage(image, g.x, g.y, w, h);

  return canvas;
}
export function frameImageData(data: ImageData, style: FrameStyle, width: number, settings: FilmEdgeOptions = {}): ImageData {
  if (style === "none") return data;
  const source = document.createElement("canvas"); source.width = data.width; source.height = data.height;
  const ctx = source.getContext("2d"); if (!ctx) throw new Error("canvas"); ctx.putImageData(data, 0, 0);
  const result = framedCanvas(source, data.width, data.height, style, width, settings);
  return result.getContext("2d")!.getImageData(0, 0, result.width, result.height);
}

/** Browser port of the original spektra-zh FilmEdge.kt drawing commands.
 * The DX stripe follows the original decorative pattern; it does not encode a scanner-readable DX identifier. */
function drawOriginalEdge(ctx: CanvasRenderingContext2D, image: CanvasImageSource, w:number,h:number,style:FrameStyle,g:ReturnType<typeof frameGeometry>,settings:FilmEdgeOptions) {
  const W=g.width,H=g.height,L=g.x,T=g.y,R=L+w,B=T+h,bottom=H-B;
  const frame=Math.max(1,Math.min(99,Math.trunc(settings.frameNumber ?? 18)));
  const label=edgeLabel(settings);
  ctx.fillStyle=style==="minimal"?"#f0ece4":"#080908";ctx.fillRect(0,0,W,H);ctx.drawImage(image,L,T,w,h);
  const text=(value:string,x:number,y:number,size:number,color="#e87e2c",bold=true)=>{ctx.font=`${bold?"bold ":""}${size}px ${bold?"monospace":"sans-serif"}`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
  const measure=(value:string,size:number,bold=true)=>{ctx.font=`${bold?"bold ":""}${size}px ${bold?"monospace":"sans-serif"}`;return ctx.measureText(value).width;};
  const perfs=(center:number,ph:number)=>{
    const pw=ph*1.3,gap=pw*1.02,span=w,count=Math.max(2,Math.trunc((span+gap)/(pw+gap))),total=count*pw+(count-1)*gap,start=L+(span-total)/2;
    for(let i=0;i<count;i++){const x=start+i*(pw+gap);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,center-ph/2,pw,ph,pw*.16);else ctx.rect(x,center-ph/2,pw,ph);ctx.fillStyle="#ffffff";ctx.fill();ctx.strokeStyle="#b6a8a8";ctx.lineWidth=Math.max(ph*.05,1);ctx.stroke();}
  };
  if(style==="135"||style==="film"){
    const size=Math.max(T*.24,9),ph=T*.30,mid=`${frame}A`,next=String(frame+1);
    text(label,L+W*.006,T*.28,size);text(mid,(W-measure(mid,size))/2,T*.28,size);text(next,W-L-measure(next,size),T*.28,size);
    perfs(T*.68,ph);perfs(B+bottom*.22,ph);
    if(settings.frameBarcode!==false){
      const bcTop=B+bottom*.48,unit=W/190,pattern=[1,3,1,2,4,1,2,1,3,2,1,1,4,2,1,3];
      ctx.fillStyle="#d9a227";ctx.fillRect(0,bcTop,W,H-bcTop);ctx.fillStyle="#12100c";
      for(let x=0,i=0;x<W;i++){const n=pattern[i%pattern.length];ctx.fillRect(x,bcTop,unit*n,H-bcTop);x+=unit*(n+2);}
      const fs=bottom*.24,left=`→ ${frame}A`,right=String(frame+1),baseline=H-bottom*.16;
      ctx.fillStyle="#d9a227";ctx.fillRect(L,bcTop,measure(left,fs)+unit*5,H-bcTop);ctx.fillRect(W-L-measure(right,fs)-unit*5,bcTop,L+measure(right,fs)+unit*5,H-bcTop);
      text(left,L+W*.02,baseline,fs,"#12100c");text(right,W-L-W*.02-measure(right,fs),baseline,fs,"#12100c");
    }
    const stroke=Math.max(T*.04,1.5);ctx.strokeStyle="#fff";ctx.lineWidth=stroke;ctx.strokeRect(L-stroke/2,T-stroke/2,w+stroke,h+stroke);
  } else if(style==="120"){
    const fs=Math.max(T*.30,9),right=`${frame}A`;
    text(label,L+W*.01,T*.58,fs);text(right,W-L-W*.01-measure(right,fs),T*.58,fs);text(`120  ·  ${frame}A`,L+W*.01,H-bottom*.42,fs);
  } else {
    text(`${label}  ·  ${frame}A`,L+W*.012,H-bottom*.45,Math.max(bottom*.28,8),"#1c1c1c99",false);
  }
  if(settings.frameDate?.trim()){
    const fs=Math.max(T*.26,10),pad=T*.26,date=settings.frameDate.trim();text(date,R-measure(date,fs)-pad,B-pad,fs,"#ff8a1e");
  }
}
