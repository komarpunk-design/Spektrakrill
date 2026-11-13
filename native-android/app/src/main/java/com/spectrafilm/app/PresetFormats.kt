/* Native-authored and Python GUI JSON -> strict, canonical Android recipe. GPLv3. */
package com.spectrafilm.app
import org.json.JSONObject
import org.json.JSONArray
import java.math.BigDecimal
import java.util.Locale

internal object PresetFormats {
 private fun key(s:String)=s.replace("_","").lowercase(Locale.ROOT)
 private fun get(o:JSONObject?,name:String):Any?=o?.keys()?.asSequence()?.firstOrNull{key(it)==key(name)}?.let{o.opt(it)}?.takeUnless{it===JSONObject.NULL}
 private fun obj(o:JSONObject?,name:String)=get(o,name) as? JSONObject
 fun toNative(p:JSONObject):JSONObject {
  val defaults=Presets.encode(PARAM_DEFAULTS);val out=JSONObject();val lab=JSONObject()
  val used=java.util.IdentityHashMap<JSONObject,MutableSet<String>>()
  fun get(o:JSONObject?,name:String):Any? {
   if(o==null)return null
   val consumed=used.getOrPut(o){mutableSetOf()}
   val k=o.keys().asSequence().firstOrNull{key(it)==key(name)}?:return null
   consumed.add(k)
   return o.opt(k)?.takeUnless{it===JSONObject.NULL}
  }
  fun obj(o:JSONObject?,name:String)=get(o,name) as? JSONObject
  fun set(path:String,value:Any?) {
   if(value==null)return
   val baseline=defaults.valueAt(path)
   when(baseline){
    is Boolean -> require(value is Boolean){"$path: требуется true/false"}
    is Number -> require(value is Number){"$path: требуется число"}
    is String -> require(value is String){"$path: требуется текст"}
   }
   out.setAt(path,value)
  }
  fun copy(o:JSONObject?,source:String,target:String)=set(target,get(o,source))
  fun fields(o:JSONObject?,group:String) {
   val template=defaults.optJSONObject(group)?:return
   for(k in template.keys())copy(o,k,"$group.$k")
  }
  fun enum(o:JSONObject?,source:String,path:String,allowed:List<String>,aliases:Map<String,String> = emptyMap()) {
   val v=get(o,source)?:return;require(v is String){"$path: требуется название"}
   val alias=aliases[key(v)]?:v
   set(path,allowed.firstOrNull{key(it)==key(alias)}?:throw IllegalArgumentException("$path: неизвестное значение $v"))
  }
  copy(p,"filmProfile","filmProfile");copy(p,"printProfile","printProfile");copy(p,"masks","masks")
  obj(p,"simulation")?.let{sim->
   copy(sim,"filmStock","filmProfile");copy(sim,"filmProfile","filmProfile");copy(sim,"printPaper","printProfile");copy(sim,"printProfile","printProfile")
   fields(sim,"enlarger")
  }
  for(group in listOf("camera","enlarger","scanner","raw","grade","creativeWb","toneCurve","contrastMask","glare","experimental","output"))fields(obj(p,group),group)
  for(group in listOf("camera","enlarger")) {
   val o=obj(p,group);obj(o,"diffusionFilter")?.let{d->
    val mapped=JSONObject();for(k in listOf("active","strength","spatialScale","haloWarmth","coreIntensity","coreSize","haloIntensity","haloSize","bloomIntensity","bloomSize"))get(d,k)?.let{mapped.put(k,it)}
    (get(d,"filterFamily")?:get(d,"family"))?.let{mapped.put("family",it)};set("$group.diffusion",mapped)
   }
  }
  val input=obj(p,"input");fields(input,"input")
  val io=obj(p,"io")?:input
  for(k in listOf("inputColorSpace","inputCctfDecoding","crop","cropCenter","cropSize","upscaleFactor"))copy(io,k,"input.$k")
  for((a,b)in listOf("outputCctfEncoding" to "savingCctfEncoding","scanFilm" to "scanFilm"))copy(io,a,"output.$b")
  enum(io,"outputColorSpace","output.outputColorSpace",com.spectrafilm.engine.ColorSpace.entries.map{it.name})
  val settings=obj(p,"settings")
  enum(settings,"rgbToRawMethod","input.spectralUpsampling",com.spectrafilm.engine.Rgb2Raw.entries.map{it.name})
  for((a,b)in listOf("applyHanatos2025AdaptationWindow" to "adaptationWindow","applyHanatos2025AdaptationSurface" to "adaptationSurface","spectralGaussianBlur" to "spectralGaussianBlur"))copy(settings,a,"input.$b")
  val camera=obj(p,"camera");for(k in listOf("filterUv","filterIr"))copy(camera,k,"input.$k")
  fields(obj(p,"preflashing"),"enlarger")
  val film=obj(p,"filmRender");val print=obj(p,"printRender")
  copy(film,"densityCurveGamma","experimental.filmGammaFactor");copy(print,"densityCurveGamma","experimental.printGammaFactor")
  val grain=obj(film,"grain")?:obj(p,"grain");fields(grain,"grain")
  for((a,b)in listOf("agxParticleAreaUm2" to "particleAreaUm2","agxParticleScale" to "particleScale","agxParticleScaleLayers" to "particleScaleLayers"))copy(grain,a,"grain.$b")
  val hal=obj(film,"halation")?:obj(p,"halation");fields(hal,"halation")
  copy(hal,"halationFirstSigmaUm","halation.firstSigmaUm")
  for((a,b)in listOf("scatterTailWeight" to "scatterTailWeightPct","halationStrength" to "halationStrengthPct"))get(hal,a)?.let{value->
   require(value is JSONArray&&value.length()==3){"halation.$a: нужны три числа"}
   val arr=JSONArray();for(i in 0..2){val n=value.get(i);require(n is Number);arr.put(BigDecimal(n.toString()).multiply(BigDecimal(100)))};set("halation.$b",arr)
  }
  val dir=obj(film,"dirCouplers")?:obj(p,"dirCouplers")?:obj(p,"couplers");fields(dir,"couplers")
  for((a,b)in listOf("gammaSamelayerRgb" to "gammaSamelayer","gammaInterlayerRToGb" to "gammaRtoGb","gammaInterlayerGToRb" to "gammaGtoRb","gammaInterlayerBToRg" to "gammaBtoRg"))copy(dir,a,"couplers.$b")
  fields(obj(film,"glare")?:obj(print,"glare"),"glare")
  obj(print,"densityCurvesMorph")?.let{m->
   for((a,b)in listOf("active" to "morphActive","gammaFactor" to "morphGammaFactor","gammaFactorFast" to "morphGammaFactorFast","gammaFactorSlow" to "morphGammaFactorSlow","gammaFactorRed" to "morphGammaFactorRed","gammaFactorGreen" to "morphGammaFactorGreen","gammaFactorBlue" to "morphGammaFactorBlue","developerExhaustion" to "morphDeveloperExhaustion"))copy(m,a,"experimental.$b")
  }
  obj(film,"chemistry")?.let{c->
   get(c,"active")?.let{lab.put("filmChemistry",it)};copy(c,"gammaFactor","experimental.filmGammaFactor")
   for((a,b)in listOf("gammaFactorFast" to "filmFast","gammaFactorSlow" to "filmSlow","gammaFactorRed" to "filmRed","gammaFactorGreen" to "filmGreen","gammaFactorBlue" to "filmBlue","developerExhaustion" to "filmExhaustion"))get(c,a)?.let{lab.put(b,it)}
  }
  for((o,prefix)in listOf(film to "film",print to "print"))obj(o,"base")?.let{b->
   for(k in listOf("active","scale","tilt","cyan","magenta","yellow"))get(b,k)?.let{lab.put(prefix+"Base"+k.replaceFirstChar{it.uppercase()},it)}
  }
  get(grain,"useRmsModel")?.let{lab.put("grainRms",it)};get(dir,"useLangmuirModel")?.let{lab.put("dirLangmuir",it)}
  for((o,source,prefix)in listOf(Triple(grain,"rmsGranularity","grainRms"),Triple(grain,"densityMin","grainFloor"),Triple(grain,"uniformity","grainUniformity"),Triple(dir,"langmuirDonorKRgb","dirDonor"),Triple(dir,"langmuirReceiverKRgb","dirReceiver")))get(o,source)?.let{v->
   if(v is JSONArray&&v.length()==3 && (prefix !in listOf("grainFloor","grainUniformity") || get(grain,"useRmsModel")==true || get(grain,"rmsGranularity")!=null))for((i,c)in listOf("Red","Green","Blue").withIndex())lab.put(prefix+c,v.get(i))
  }
  obj(p,"spektrafilmLab")?.let{for(k in it.keys())lab.put(k,it.get(k))}
  if(lab.length()>0)out.put("spektrafilmLab",lab)
  val unknown=mutableListOf<String>()
  fun unmapped(o:JSONObject,prefix:String="") {
   for(k in o.keys()) {
    val path=if(prefix.isEmpty())k else "$prefix.$k"
    if(prefix.isEmpty()&&key(k) in setOf("name","id","description","group","title","schema","version"))continue
    if(k !in used[o].orEmpty())unknown+=path
    else (o.opt(k) as? JSONObject)?.let{if(used.containsKey(it))unmapped(it,path)}
   }
  }
  unmapped(p)
  if(unknown.isNotEmpty())out.put("unmappedImportFields",JSONArray(unknown))
  require(out.keys().asSequence().any{it!="unmappedImportFields"}){"Не найдены параметры Spektrafilm"}
  return out
 }
}
