/* A virtual negative is film density, never a JPEG round-trip. GPLv3. */
package com.spectrafilm.app

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

internal const val MAX_SCAN_VARIANTS = 6
private val negativeKeyPattern = Regex("[0-9a-f]{64}")
private fun digestNegative(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }

/** Stable across JSON key order, numeric spelling and all downstream-only adjustments. */
private fun canonicalNegative(value: Any?): String = when(value) {
    is JSONObject -> value.keys().asSequence().sorted().joinToString(",", "{", "}") {
        JSONObject.quote(it) + ":" + canonicalNegative(value.get(it))
    }
    is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonicalNegative(value.get(it)) }
    is Number -> java.math.BigDecimal(value.toString()).stripTrailingZeros().toPlainString()
    is String -> JSONObject.quote(value)
    else -> value?.toString() ?: "null"
}

internal fun ParamsState.negativeFilmFingerprint(): String {
    val params = snapshot()
    negativeFingerprintMemo?.let { if(it.first == params) return it.second }
    val recipe = Presets.encode(this)
    listOf("negativeWorkspace", "schema", "version", "printProfile", "enlarger", "scanner",
        "toneCurve", "masks", "contrastMask", "grade", "glare").forEach(recipe::remove)
    // Input gamut compression is in the Output UI but acts BEFORE film exposure.
    val inputGamut = recipe.optJSONObject("output")?.opt("inputGamutCompress")
    recipe.remove("output")
    recipe.put("inputGamutCompress", inputGamut)
    recipe.optJSONObject("experimental")?.let { old ->
        recipe.put("experimental", JSONObject().put("filmGammaFactor", old.get("filmGammaFactor")))
    }
    recipe.optJSONObject("spektrafilmLab")?.let { lab ->
        lab.keys().asSequence().toList().filter {
            it == "outputModel" || it == "noritsuJob" || it == "virtualNegative" ||
                it.startsWith("print") || it.startsWith("testPrint")
        }.forEach(lab::remove)
        if(lab.length() == 0) recipe.remove("spektrafilmLab")
    }
    return digestNegative(canonicalNegative(recipe)).also { negativeFingerprintMemo = params to it }
}

internal fun ParamsState.negativeWorkspace(): JSONObject =
    if(negativeWorkspaceJson.isBlank()) JSONObject() else JSONObject(negativeWorkspaceJson)

internal fun ParamsState.frozenNegativeCacheKey(): String? {
    if(negativeWorkspaceJson.isBlank()) return null
    val work = negativeWorkspace()
    if(!work.optBoolean("locked") || labString("workflow", "normal") != "normal") return null
    if(labString("outputModel.mode") !in SCAN_RECEIVER_MODES + "negative") return null
    val source = negativeSourceKey ?: return null
    if(work.optString("source") != digestNegative(source)) return null
    val fingerprint = negativeFilmFingerprint()
    if(work.optString("film") != fingerprint) return null
    return digestNegative(work.getString("id") + fingerprint + digestNegative(source))
}

internal fun ParamsState.negativeIsFrozen(): Boolean = frozenNegativeCacheKey() != null

internal fun ParamsState.startNegativeWorkspace() {
    require(labString("workflow", "normal") == "normal") { "Сначала выберите обычную фотографию · эмуляцию" }
    if(negativeWorkspaceJson.isNotBlank()) return
    val mode = labString("outputModel.mode", "paper").takeIf { it in SCAN_RECEIVER_MODES } ?: "noritsu-ls600"
    setLab("outputModel.mode", mode)
    val work = JSONObject().put("version", 1).put("id", digestNegative(UUID.randomUUID().toString()))
        .put("locked", false).put("active", 0).put("positiveMode", mode)
        .put("variants", JSONArray().put(captureScanVariant("Скан 1", mode)))
    negativeWorkspaceJson = work.toString()
}

private fun ParamsState.captureScanVariant(name: String, positiveMode: String): JSONObject {
    val output = labObject().optJSONObject("outputModel") ?: JSONObject()
    output.put("mode", positiveMode)
    return JSONObject().put("name", name).put("outputModel", output)
        .put("scanner", Presets.encode(this).getJSONObject("scanner"))
}

private fun ParamsState.storeCurrentScan(work: JSONObject) {
    val variants = work.getJSONArray("variants")
    val index = work.getInt("active")
    val mode = labString("outputModel.mode", "lab-scan").takeIf { it in SCAN_RECEIVER_MODES }
        ?: work.getString("positiveMode")
    work.put("positiveMode", mode)
    variants.put(index, captureScanVariant(variants.getJSONObject(index).getString("name"), mode))
}

internal fun ParamsState.freezeNegative() {
    require(negativeSourceKey != null) { "Дождитесь загрузки исходника" }
    startNegativeWorkspace()
    val work = negativeWorkspace()
    storeCurrentScan(work)
    work.put("locked", true).put("source", digestNegative(negativeSourceKey!!))
        .put("film", negativeFilmFingerprint())
    negativeWorkspaceJson = work.toString()
}

internal fun ParamsState.unlockNegative() {
    if(negativeWorkspaceJson.isBlank()) return
    negativeWorkspaceJson = negativeWorkspace().put("locked", false).toString()
}

internal fun ParamsState.showVirtualNegative(show: Boolean) {
    startNegativeWorkspace()
    val work = negativeWorkspace()
    storeCurrentScan(work)
    setLab("outputModel.mode", if(show) "negative" else work.getString("positiveMode"))
    negativeWorkspaceJson = work.toString()
}

internal fun ParamsState.selectScanVariant(index: Int) {
    val work = negativeWorkspace()
    val variants = work.getJSONArray("variants")
    require(index in 0 until variants.length())
    storeCurrentScan(work)
    val variant = variants.getJSONObject(index)
    val lab = labObject().put("outputModel", JSONObject(variant.getJSONObject("outputModel").toString()))
    val positiveMode = variant.getJSONObject("outputModel").getString("mode")
    // Selecting a variant always shows its positive, so the comparison is immediately visible.
    val patch = JSONObject().put("scanner", variant.getJSONObject("scanner")).put("spektrafilmLab", lab)
    Presets.decode(patch, this)
    negativeWorkspaceJson = work.put("active", index).put("positiveMode", positiveMode).toString()
}

internal fun ParamsState.addScanVariant() {
    startNegativeWorkspace()
    val work = negativeWorkspace()
    storeCurrentScan(work)
    val variants = work.getJSONArray("variants")
    require(variants.length() < MAX_SCAN_VARIANTS)
    val index = variants.length()
    val names = (0 until index).map { variants.getJSONObject(it).getString("name") }.toSet()
    val name = (1..MAX_SCAN_VARIANTS + 1).map { "Скан $it" }.first { it !in names }
    variants.put(captureScanVariant(name, work.getString("positiveMode")))
    negativeWorkspaceJson = work.put("active", index).toString()
    showVirtualNegative(false)
}

internal fun ParamsState.renameScanVariant(name: String) {
    require(name.isNotBlank() && name.length <= 40)
    val work = negativeWorkspace()
    storeCurrentScan(work)
    work.getJSONArray("variants").getJSONObject(work.getInt("active")).put("name", name.trim())
    negativeWorkspaceJson = work.toString()
}

internal fun ParamsState.deleteScanVariant() {
    val work = negativeWorkspace()
    val variants = work.getJSONArray("variants")
    require(variants.length() > 1)
    variants.remove(work.getInt("active"))
    work.put("active", 0)
    negativeWorkspaceJson = work.toString()
    // Do not overwrite the surviving first variant with the deleted one's controls.
    val first = variants.getJSONObject(0)
    val lab = labObject().put("outputModel", JSONObject(first.getJSONObject("outputModel").toString()))
    Presets.decode(JSONObject().put("scanner", first.getJSONObject("scanner")).put("spektrafilmLab", lab), this)
    negativeWorkspaceJson = work.put("positiveMode", first.getJSONObject("outputModel").getString("mode")).toString()
}

/** Validate before Presets' atomic apply; variants must be as safe as ordinary scanner controls. */
internal fun validateNegativeWorkspace(work: JSONObject, parentLab: JSONObject = JSONObject()): JSONObject {
    require(work.toString().length <= 32768 && work.get("version") is Number && work.getDouble("version") == 1.0)
    require(negativeKeyPattern.matches(work.getString("id")))
    require(work.get("locked") is Boolean)
    require(work.getString("positiveMode") in SCAN_RECEIVER_MODES)
    if(work.getBoolean("locked")) {
        require(negativeKeyPattern.matches(work.getString("source")))
        require(negativeKeyPattern.matches(work.getString("film")))
    }
    val variants = work.getJSONArray("variants")
    require(variants.length() in 1..MAX_SCAN_VARIANTS)
    require(work.get("active") is Number && work.getDouble("active") == work.getInt("active").toDouble())
    require(work.getInt("active") in 0 until variants.length())
    for(i in 0 until variants.length()) {
        val variant = variants.getJSONObject(i)
        require(variant.getString("name").isNotBlank() && variant.getString("name").length <= 40)
        val output = variant.getJSONObject("outputModel")
        require(output.getString("mode") in SCAN_RECEIVER_MODES)
        val lab = JSONObject(parentLab.toString()).put("outputModel", JSONObject(output.toString()))
        Presets.decode(JSONObject().put("scanner", variant.getJSONObject("scanner"))
            .put("spektrafilmLab", lab), ParamsState())
    }
    return work
}

internal fun PhotoTool.lockedByNegative(s: ParamsState): Boolean = s.negativeIsFrozen() && (
    stage in listOf(PhotoStage.CAMERA, PhotoStage.FILM, PhotoStage.DEVELOPMENT, PhotoStage.EFFECTS) ||
        this in listOf(PhotoTool.CROP, PhotoTool.OUTPUT, PhotoTool.NEGATIVE)) && this != PhotoTool.SOURCE
