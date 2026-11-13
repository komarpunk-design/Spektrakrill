/* Explicit, bounded migration of Spektrafilm Lab 9.56 recipes. GPLv3. */
package com.spectrafilm.app
import org.json.JSONObject
import org.json.JSONArray

internal fun importLegacyLabRecipe(root:JSONObject):JSONObject? {
    if(root.has("schema") && root.optString("schema") != PRESET_SCHEMA_ID && root.optString("app") != "kirillkovaya-plenka")return null
    val p=root.optJSONObject("params")?:root
    if(!p.has("filmStock"))return null
    val out=JSONObject().put("schema",PRESET_SCHEMA_ID).put("version",PRESET_VERSION)
        .put("filmProfile",p.optString("filmStock","kodak_portra_400")).put("printProfile",p.optString("printPaper","kodak_portra_endura"))
    fun block(name:String,vararg map:Pair<String,String>) {
        val obj=out.optJSONObject(name)?:JSONObject().also{out.put(name,it)}
        for((old,new)in map)if(p.has(old))obj.put(new,p.get(old))
    }
    block("camera","exposureCompensationEv" to "exposureCompensationEv","autoExposure" to "autoExposure","autoExposureMethod" to "autoExposureMethod","filmFormatMm" to "filmFormatMm","cameraLensBlurUm" to "lensBlurUm")
    block("input","applyCctfDecoding" to "inputCctfDecoding","hanatosWindow" to "adaptationWindow","hanatosSurface" to "adaptationSurface","spectralBlur" to "spectralGaussianBlur","upscaleFactor" to "upscaleFactor","crop" to "crop")
    out.getJSONObject("input").put("spectralUpsampling",if(p.optString("rgbToRawMethod")=="mallett2019")"MALLETT2019" else "HANATOS2025")
    if(p.has("filterUvAmount"))out.getJSONObject("input").put("filterUv",JSONArray(listOf(p.getDouble("filterUvAmount"),410,8)))
    if(p.has("filterIrAmount"))out.getJSONObject("input").put("filterIr",JSONArray(listOf(p.getDouble("filterIrAmount"),675,15)))
    if(p.has("cropCenterX"))out.getJSONObject("input").put("cropCenter",JSONArray(listOf(p.getDouble("cropCenterX"),p.optDouble("cropCenterY",.5))))
    if(p.has("cropSizeX"))out.getJSONObject("input").put("cropSize",JSONArray(listOf(p.getDouble("cropSizeX"),p.optDouble("cropSizeY",.35))))
    block("grain","grainActive" to "active","grainParticleArea" to "particleAreaUm2","grainSublayers" to "sublayersActive","grainBlur" to "blur","grainDyeCloudsUm" to "blurDyeCloudsUm","grainSubLayersN" to "nSubLayers")
    val grain=out.getJSONObject("grain")
    if(p.has("grainScaleR"))grain.put("particleScale",JSONArray(listOf(p.getDouble("grainScaleR"),p.optDouble("grainScaleG",1.0),p.optDouble("grainScaleB",1.0))))
    for((old,new)in listOf("grainDensityMin" to "densityMin","grainUniformity" to "uniformity"))if(p.has(old))grain.put(new,JSONArray(List(3){p.getDouble(old)}))
    block("halation","halationActive" to "active","halationAmount" to "halationAmount","halationSpatialScale" to "halationSpatialScale","scatterAmount" to "scatterAmount","scatterSpatialScale" to "scatterSpatialScale","boostEv" to "boostEv","protectEv" to "protectEv","boostRange" to "boostRange","halationNBounces" to "nBounces","halationBounceDecay" to "bounceDecay","halationRenormalize" to "renormalize")
    block("couplers","couplersActive" to "active","couplersAmount" to "amount","inhibitionInterlayer" to "inhibitionInterlayer","inhibitionSamelayer" to "inhibitionSamelayer","couplerDiffusionUm" to "diffusionSizeUm","gammaSamelayer" to "gammaSamelayer","gammaRtoGB" to "gammaRtoGb","gammaGtoRB" to "gammaGtoRb","gammaBtoRG" to "gammaBtoRg")
    block("enlarger","printExposure" to "printExposure","printExposureCompensation" to "printExposureCompensation","printYFilterShift" to "yFilterShift","printMFilterShift" to "mFilterShift","printIlluminant" to "illuminant","preflashExposure" to "preflashExposure","preflashYShift" to "preflashYFilterShift","preflashMShift" to "preflashMFilterShift")
    block("scanner","scanLensBlur" to "lensBlur","scanWhiteCorrection" to "whiteCorrection","scanBlackCorrection" to "blackCorrection","scanWhiteLevel" to "whiteLevel","scanBlackLevel" to "blackLevel")
    if(p.has("scanUnsharpSigma"))out.getJSONObject("scanner").put("unsharpMask",JSONArray(listOf(p.getDouble("scanUnsharpSigma"),p.optDouble("scanUnsharpAmount",.7))))
    block("glare","glareActive" to "active","glarePercent" to "percent","glareRoughness" to "roughness","glareBlur" to "blur")
    block("experimental","filmGamma" to "filmGammaFactor","printGamma" to "printGammaFactor","chemistryActive" to "morphActive","printGammaFast" to "morphGammaFactorFast","printGammaSlow" to "morphGammaFactorSlow","printGammaR" to "morphGammaFactorRed","printGammaG" to "morphGammaFactorGreen","printGammaB" to "morphGammaFactorBlue","developerExhaustion" to "morphDeveloperExhaustion")
    for((old,new)in listOf("cameraDiffusion" to "camera","printDiffusion" to "enlarger"))p.optJSONObject(old)?.let{out.getJSONObject(new).put("diffusion",JSONObject(it.toString()))}
    block("output","scanFilm" to "scanFilm","outputCctf" to "savingCctfEncoding")
    val lab=JSONObject((p.optJSONObject("experimental")?:JSONObject()).toString())
    for((old,new)in listOf("prep" to "negsPrep","transport" to "layeredTransport","output" to "outputModel"))p.optJSONObject(old)?.let{lab.put(new,JSONObject(it.toString()))}
    if(p.has("frameStyle"))lab.put("legacyFrame",JSONObject().put("style",p.getString("frameStyle")).put("number",p.optInt("frameNumber",1)).put("barcode",p.optBoolean("frameBarcode",true)).put("date",p.optString("frameDate")))
    for((old,new)in listOf("scatterCoreUm" to "scatterCoreUm","scatterTailUm" to "scatterTailUm","halationFirstSigmaUm" to "firstSigmaUm"))p.optJSONArray(old)?.let{out.getJSONObject("halation").put(new,it)}
    for((old,new)in listOf("scatterTailWeight" to "scatterTailWeightPct","halationStrength" to "halationStrengthPct"))p.optJSONArray(old)?.let{a->
        require(a.length()==3);val arr=JSONArray();for(i in 0..2){val n=a.get(i);require(n is Number);arr.put(java.math.BigDecimal(n.toString()).multiply(java.math.BigDecimal(100)))};out.getJSONObject("halation").put(new,arr)
    }
    fun enumField(old:String,target:String,allowed:List<String>) {
        if(!p.has(old))return
        val value=p.getString(old)
        val resolved=allowed.firstOrNull{it.equals(value,ignoreCase=true)}?:throw IllegalArgumentException("$old: неизвестное значение $value")
        out.getJSONObject("output").put(target,resolved)
    }
    enumField("exportColorSpace","outputColorSpace",com.spectrafilm.engine.ColorSpace.entries.map{it.name})
    enumField("inputGamutCompress","inputGamutCompress",com.spectrafilm.engine.InputGamutCompress.entries.map{it.name})
    enumField("outputGamutCompress","outputGamutCompress",com.spectrafilm.engine.OutputGamutCompress.entries.map{it.name})
    out.put("spektrafilmLab",lab)
    return out
}
