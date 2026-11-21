/* Spektrafilm Lab native additions. GPLv3; integrates 9.56 tools into upstream v1.0.0. */
package com.spectrafilm.app

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import org.json.JSONObject
import org.json.JSONArray

internal object LabCatalog {
    @Volatile private var document: JSONObject? = null
    @Volatile private var stocks: JSONObject? = null
    fun initialize(ctx: Context) {
        if (document == null) document = JSONObject(ctx.assets.open("lab/controls.json").bufferedReader().use { it.readText() })
        if (stocks == null) stocks = JSONObject(ctx.assets.open("lab/stocks.json").bufferedReader().use { it.readText() })
    }
    fun controls(ctx: Context, group: String): List<JSONObject> {
        initialize(ctx)
        val rows = document!!.getJSONArray("controls")
        return (0 until rows.length()).map { rows.getJSONObject(it) }.filter { it.optString("group") == group }
    }
    fun default(path: String): Any? = document?.optJSONObject("defaults")?.valueAt(path)
    fun stock(id: String): JSONObject? = stocks?.optJSONObject(id)
}

internal fun JSONObject.valueAt(path: String): Any? {
    val keys = path.split('.'); var parent = this
    for (key in keys.dropLast(1)) parent = parent.optJSONObject(key) ?: return null
    return parent.opt(keys.last())?.takeUnless { it === JSONObject.NULL }
}
internal fun JSONObject.setAt(path: String, value: Any?) {
    val keys = path.split('.'); var parent = this
    for (key in keys.dropLast(1)) {
        parent = parent.optJSONObject(key) ?: JSONObject().also { parent.put(key, it) }
    }
    if (value == null) parent.remove(keys.last()) else parent.put(keys.last(), value)
}
private fun JSONObject.pruneEmpty(): JSONObject {
    for (key in keys().asSequence().toList()) optJSONObject(key)?.let {
        it.pruneEmpty(); if (it.length() == 0) remove(key)
    }
    return this
}
internal fun ParamsState.labObject() = if (labJson.isBlank()) JSONObject() else JSONObject(labJson)
private data class LabReadSnapshot(val text: String,val json: JSONObject)
private val labReadSnapshot = ThreadLocal<LabReadSnapshot>()
internal fun ParamsState.labOverrideValue(path: String): Any? {
    val text=labJson;val old=labReadSnapshot.get()
    val root=if(old?.text==text)old.json else (if(text.isBlank())JSONObject()else JSONObject(text)).also { labReadSnapshot.set(LabReadSnapshot(text,it)) }
    // Never expose mutable cached containers to callers.
    return when(val value=root.valueAt(path)) { is JSONObject -> JSONObject(value.toString());is JSONArray -> JSONArray(value.toString());else -> value }
}
internal fun ParamsState.labValue(path: String): Any? = labOverrideValue(path) ?: LabCatalog.default(path)
internal fun ParamsState.labNumber(path: String) = (labValue(path) as? Number)?.toFloat() ?: 0f
internal fun ParamsState.labBoolean(path: String) = labValue(path) as? Boolean ?: false
internal fun ParamsState.labString(path: String, default: String = "") = labValue(path) as? String ?: default
internal fun ParamsState.setLab(path: String, value: Any?) {
    val next = labObject(); val baseline=LabCatalog.default(path)
    val same = if(value is Number && baseline is Number) kotlin.math.abs(value.toDouble()-baseline.toDouble())<1e-9 else value==baseline
    next.setAt(path,if(same)null else value); labJson = next.pruneEmpty().toString()
}
internal fun ParamsState.resetLab(ctx: Context, group: String) {
    val next = labObject()
    for (row in LabCatalog.controls(ctx, group)) next.setAt(row.getString("path"), null)
    labJson = next.pruneEmpty().toString()
}
internal fun ParamsState.applyLabStock(id: String, grain: Boolean = true, dir: Boolean = true) {
    val stock = LabCatalog.stock(id) ?: return
    val next = labObject()
    if (grain) stock.optJSONObject("grain")?.let { preset ->
        preset.optJSONObject("experimental")?.let { e -> for (k in e.keys()) if (k.startsWith("grain")) next.put(k, e.get(k)) }
        grainActive = true
        grainBlur = preset.optDouble("grainBlur", .89).toFloat()
        grainBlurDyeCloudsUm = preset.optDouble("grainDyeCloudsUm", 2.0).toFloat()
    }
    if (dir) stock.optJSONObject("dir")?.let { preset ->
        preset.optJSONObject("experimental")?.let { e -> for (k in e.keys()) if (k.startsWith("dir")) next.put(k, e.get(k)) }
        couplersActive = true
        fun triple(key: String, old: Triple<Float,Float,Float>): Triple<Float,Float,Float> = preset.optJSONArray(key)?.let { Triple(it.getDouble(0).toFloat(),it.getDouble(1).toFloat(),it.getDouble(2).toFloat()) } ?: old
        fun pair(key: String, old: Pair<Float,Float>) = preset.optJSONArray(key)?.let { it.getDouble(0).toFloat() to it.getDouble(1).toFloat() } ?: old
        couplersGammaSamelayer = triple("gammaSamelayer", couplersGammaSamelayer)
        couplersGammaRtoGb = pair("gammaRtoGB",couplersGammaRtoGb)
        couplersGammaGtoRb = pair("gammaGtoRB",couplersGammaGtoRb)
        couplersGammaBtoRg = pair("gammaBtoRG",couplersGammaBtoRg)
        couplersDiffusionSizeUm = preset.optDouble("couplerDiffusionUm",20.0).toFloat()
    }
    labJson = next.pruneEmpty().toString()
}

/** Default is the author's untouched engine. Only explicit Lab overrides cross JNI. */
internal fun ParamsState.labEngineJson(): String {
    val key = frozenNegativeCacheKey()
    if(labJson.isBlank()&&key==null)return ""
    val value=labObject()
    val output=value.optJSONObject("outputModel")
    val mode=output?.optString("mode","paper")?:"paper"
    val receiverAllowed=labString("workflow","normal") in listOf("normal","negative-scan")
    if(!receiverAllowed||mode!="noritsu-ls600"||output?.opt("noritsuJobEnabled")!=true) {
        value.remove("noritsuJob");value.remove("noritsuJobId")
        NORITSU_JOB_KEYS.forEach{output?.remove(it)}
    }
    // Dormant scanner metadata must not disable the engine's bounded paper-export route.
    if(!receiverAllowed||mode=="paper"||mode=="negative"||output?.length()==0)value.remove("outputModel")
    if(key!=null)value.put("virtualNegative",key)
    return if(value.length()==0)"" else value.toString()
}
internal fun ParamsState.labScanFilm(): Boolean = when (labString("workflow","normal")) {
    "negative-print" -> false
    "negative-scan", "negative-clear" -> true
    else -> if (labString("outputModel.mode","paper") != "paper") true else scanFilm
}

/** Reject malformed imported extensions before they can partly update a live recipe. */
internal fun validateLabJson(text: String): String {
    if (text.isBlank()) return ""
    require(text.length <= NORITSU_JOB_LIMIT) { "Lab settings exceed 512 KB" }
    val j=JSONObject(text)
    require(!j.has("virtualNegative")) { "Идентификатор сохранённого негатива назначается приложением" }
    if(j.has("noritsuJob"))validateNoritsuJob(j.getJSONObject("noritsuJob"))
    else require(text.length<=32768) { "Lab settings exceed 32 KB" }
    fun check(o: JSONObject, depth: Int) {
        require(depth <= 4 && o.length() <= 128) { "Lab settings are too deeply nested" }
        for (key in o.keys()) {
            if(depth==0 && key=="noritsuJob")continue
            when (val v=o.get(key)) {
            is JSONObject -> check(v,depth+1)
            is Number -> require(v.toDouble().isFinite()) { "$key must be finite" }
            is String -> require(v.length <= 512) { "$key is too long" }
            is Boolean -> Unit
            else -> throw IllegalArgumentException("Unsupported Lab setting: $key")
            }
        }
    }
    check(j,0)
    if (j.has("outputModel")) {
        val output = j.optJSONObject("outputModel")
        require(output != null) { "outputModel должен быть объектом настроек" }
        if (output.has("mode")) require(output.opt("mode") is String && output.getString("mode") in SCAN_RECEIVER_MODES + listOf("paper", "negative")) { "Неизвестный режим вывода" }
        SCAN_CORRECTION_DEFAULTS.forEach { (key, baseline) ->
            if (output.has(key)) {
                val value = output.get(key)
                require(if (baseline is Number) value is Number else value is Boolean) { "Неверный тип параметра outputModel.$key" }
            }
        }
    }
    val output=j.optJSONObject("outputModel")
    val builtinJob=j.opt("noritsuJobId")
    if(builtinJob!=null)require(builtinJob is String && builtinJob==NORITSU_FACTORY_ID && !j.has("noritsuJob")) { "Неизвестный или неоднозначный встроенный профиль Noritsu" }
    if(output?.opt("noritsuJobEnabled")==true) {
        val job=j.optJSONObject("noritsuJob");require(job!=null||builtinJob==NORITSU_FACTORY_ID) { "Для цветового тракта Noritsu нужен профиль задания" }
        listOf("noritsuLocalContrast" to "autoContrast","noritsuFilmSharp" to "filmSharpHex","noritsuHueSat" to "hueLatticeHex").forEach { (flag,section) -> require(output.opt(flag)!=true || builtinJob==NORITSU_FACTORY_ID || job?.has(section)==true) { "Для $flag нет исходных данных в профиле" } }
    }
    require(j.optString("workflow","normal") in listOf("normal","negative-print","negative-scan","negative-clear"))
    return j.toString()
}

internal fun labCategoryKey(category: Category): List<String> = when(category) {
    Category.GRAIN -> listOf("grain")
    Category.HALATION -> listOf("layeredTransport")
    Category.COUPLERS -> listOf("dir")
    Category.EXPOSURE -> listOf("negsPrep")
    Category.PAPER -> listOf("printBase")
    Category.SCANNER -> listOf("outputModel")
    Category.EXPERIMENTAL -> listOf("film", "scan", "workflow", "spectralMethod", "colorFilter")
    else -> emptyList()
}
internal fun ParamsState.resetLabCategory(category:Category) {
    val j=labObject(); val prefixes=labCategoryKey(category)
    for(k in j.keys().asSequence().toList())if(prefixes.any{k.startsWith(it)})j.remove(k)
    labJson=j.pruneEmpty().toString()
}
internal fun ParamsState.dirtyLabCategories(): Set<Category> {
    val j=labObject()
    fun changed(value:Any?):Boolean=when(value){is JSONObject->value.keys().asSequence().any{changed(value.opt(it))};null->false;else->true}
    return Category.entries.filterTo(mutableSetOf()) { c->val prefixes=labCategoryKey(c);j.keys().asSequence().any{k->prefixes.any{k.startsWith(it)} && changed(j.opt(k))} }
}
