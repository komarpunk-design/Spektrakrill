/*
 * Spektrafilm for Android — preset "amount" blending. GPLv3.
 * Film modeling powered by spektrafilm.
 *
 * Lightroom-style preset amount: dial how strongly an applied preset/recipe is mixed
 * over the look that was active just before it was applied. amount = 0 reproduces the
 * pre-apply state, amount = 1 the full preset, and values in between linearly cross-fade
 * every continuous parameter.
 *
 * Blending operates on the shared flat preset JSON (Presets.encode / Presets.decode), so
 * it covers exactly the same field set that round-trips through a saved preset — both
 * built-in and user presets feed it the same schema. Continuous leaves (floats and
 * float arrays such as the per-channel Triples) are linearly interpolated; categorical
 * leaves (booleans, strings, and integer counts like nSubLayers / nBounces) cannot be
 * partially applied, so they snap to the preset value once amount crosses 0.5 and stay
 * at the base value below it.
 *
 * Which leaves are categorical is decided by KEY, not by runtime type. The anchors are
 * re-parsed from text on every drag frame (MainActivity's onAmountChange does
 * JSONObject(presetBaseJson), and the anchors are Presets.toJsonString output), and
 * org.json writes an integral Double without its ".0" — so 0.0 comes back as an
 * Integer and 0.5 comes back as a BigDecimal. Typing off that made every continuous
 * parameter whose endpoints happened to be whole numbers snap at 50% instead of
 * cross-fading: exposure compensation 0 -> 1, the enlarger filter shifts 0 -> -2, the
 * coupler amounts 20 -> 18. See PresetAmountTest.
 */
package com.spectrafilm.app

import org.json.JSONArray
import org.json.JSONObject

object PresetAmount {

    /**
     * Cross-fade [base] (the pre-apply look) toward [full] (the applied preset) by
     * [amount] in [0, 1]. Both objects must use the [Presets] flat schema; [base]
     * always carries the full field set (it is an encode of live state), so blending
     * walks [base]'s keys and is robust to a sparser [full].
     */
    fun blend(base: JSONObject, full: JSONObject, amount: Float): JSONObject {
        val t = amount.coerceIn(0f, 1f)
        if(t==0f)return JSONObject(base.toString())
        val complete=full.optString("schema")==PRESET_SCHEMA_ID && full.has("filmProfile")
        if(t==1f&&complete)return JSONObject(full.toString())
        val out=blendObject(base, full, t)
        if(complete) {
            // Optional blocks absent from a complete recipe mean defaults, not a sparse patch.
            val lab=blendCompleteLab(base.optJSONObject("spektrafilmLab"),full.optJSONObject("spektrafilmLab"),t)
            if(lab==null)out.remove("spektrafilmLab")else out.put("spektrafilmLab",lab)
            val chosen=if(t<.5f)base else full
            if(chosen.has("negativeWorkspace"))out.put("negativeWorkspace",JSONObject(chosen.getJSONObject("negativeWorkspace").toString()))else out.remove("negativeWorkspace")
        }
        val b=base.optJSONObject("spektrafilmLab");val f=full.optJSONObject("spektrafilmLab")
        if(b==null&&f!=null&&t>=.5f)out.put("spektrafilmLab",JSONObject(f.toString()))
        fun source(j:JSONObject?)=j?.has("noritsuJob")==true||j?.has("noritsuJobId")==true
        if((source(b)||source(f))&&(complete||source(f))) {
            val selected=if(t<.5f)b else f
            val lab=JSONObject(out.optJSONObject("spektrafilmLab")?.toString()?:"{}")
            lab.remove("noritsuJob");lab.remove("noritsuJobId")
            selected?.optJSONObject("noritsuJob")?.let{lab.put("noritsuJob",JSONObject(it.toString()))}
            selected?.optString("noritsuJobId")?.takeIf{it.isNotBlank()}?.let{lab.put("noritsuJobId",it)}
            val model=lab.optJSONObject("outputModel")?:JSONObject()
            val selectedModel=selected?.optJSONObject("outputModel")
            for(key in NORITSU_JOB_KEYS+"mode") {
                if(selectedModel?.has(key)==true)model.put(key,selectedModel.get(key))else model.remove(key)
            }
            if(model.length()>0)lab.put("outputModel",model)else lab.remove("outputModel")
            if(lab.length()>0)out.put("spektrafilmLab",lab)else out.remove("spektrafilmLab")
        }
        return out
    }

    private fun blendCompleteLab(base:JSONObject?,full:JSONObject?,t:Float):JSONObject? {
        if(base==null||full==null)return (if(t<.5f)base else full)?.let{JSONObject(it.toString())}
        val out=JSONObject()
        for(key in (base.keys().asSequence().toList()+full.keys().asSequence().toList()).distinct()) {
            if(!base.has(key)||!full.has(key)) {
                val chosen=if(t<.5f)base else full
                if(chosen.has(key))out.put(key,chosen.get(key))
            } else if(key!="noritsuJob"&&base.opt(key) is JSONObject && full.opt(key) is JSONObject) {
                out.put(key,blendCompleteLab(base.getJSONObject(key),full.getJSONObject(key),t))
            } else out.put(key,blendValue(key,base.get(key),full.get(key),t))
        }
        return out
    }

    /**
     * The only genuinely categorical numeric leaves in the flat schema: a document
     * version, a grain sub-layer count and a halation bounce count. These are exactly
     * the three keys [Presets] reads back with its integer reader; every other numeric
     * leaf is read as a float and is therefore continuous, whatever type org.json
     * happened to give it after the text round-trip.
     */
    private val CATEGORICAL_NUMERIC_KEYS = setOf("version", "nSubLayers", "nBounces")

    private fun blendObject(base: JSONObject, full: JSONObject, t: Float): JSONObject {
        val out = JSONObject()
        val keys = base.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val b = base.get(k)
            // A field absent from [full] has no preset target — keep the base value.
            if (!full.has(k)) { out.put(k, b); continue }
            out.put(k, blendValue(k, b, full.get(k), t))
        }
        return out
    }

    private fun blendValue(key: String, b: Any, f: Any, t: Float): Any = when {
        // Project identity, lock and saved scan variants are one indivisible document.
        key == "negativeWorkspace" || key == "noritsuJob" -> if(t < .5f) b else f
        b is JSONObject && f is JSONObject -> blendObject(b, f, t)
        b is JSONArray && f is JSONArray -> blendArray(key, b, f, t)
        b is Boolean && f is Boolean -> if (t < 0.5f) b else f
        b is String && f is String -> if (t < 0.5f) b else f
        // Counts cannot be partially applied. Keyed, not typed — see the file header.
        key in CATEGORICAL_NUMERIC_KEYS && b is Number && f is Number ->
            if (t < 0.5f) b else f
        b is Number && f is Number -> b.toDouble() + (f.toDouble() - b.toDouble()) * t
        else -> if (t < 0.5f) b else f
    }

    private fun blendArray(key: String, b: JSONArray, f: JSONArray, t: Float): JSONArray {
        // Channel Triples / pairs are equal-length numeric arrays; interpolate element-
        // wise. On any shape mismatch fall back to a hard switch at the midpoint. The
        // parent key rides along so an array under a categorical key would still snap;
        // none of the three are arrays today, which keeps this a no-op safeguard.
        if (b.length() != f.length()) return if (t < 0.5f) b else f
        val out = JSONArray()
        for (i in 0 until b.length()) {
            out.put(blendValue(key, b.get(i), f.get(i), t))
        }
        return out
    }
}
