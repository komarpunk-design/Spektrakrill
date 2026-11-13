/* Bounded JSON look import; shared by the file picker and text import. GPLv3. */
package com.spectrafilm.app

import org.json.JSONObject
import org.json.JSONArray

internal data class ImportedPreset(val name:String,val json:String,val note:String="")
internal object PresetImports {
    const val MAX_COUNT=128
    fun parse(text:String,fileName:String=""):List<ImportedPreset> {
        require(text.toByteArray(Charsets.UTF_8).size<=AtomicJsonStore.MAX_PRESET_BYTES){"JSON превышает 4 МБ"}
        var raw=text.removePrefix("\uFEFF").trim()
        if(raw.startsWith("```")) {
            require(raw.endsWith("```")){"Незакрытый блок JSON"}
            raw=raw.substringAfter('\n').removeSuffix("```").trim()
        }
        val root=AtomicJsonStore.parseObject(if(raw.startsWith("["))"{\"presets\":$raw}"else raw)
        root.opt("version")?.let { v ->
            require(v is Number){"Версия JSON должна быть целым числом"}
            val version=try{java.math.BigDecimal(v.toString()).toBigIntegerExact()}catch(e:ArithmeticException){throw IllegalArgumentException("Версия JSON должна быть целым числом")}
            require(version in java.math.BigInteger.ONE..java.math.BigInteger.valueOf(2)){"Неподдерживаемая версия JSON: $version"}
        }
        val pack=root.optJSONArray("presets")?:root.optJSONArray("looks")
        if(root.has("schema")&&root.optString("schema")!=PRESET_SCHEMA_ID)throw UnsupportedPresetDocumentException("Неизвестная схема: ${root.optString("schema")}")
        val rows=if(pack!=null){require(pack.length() in 1..MAX_COUNT){"В наборе должно быть от 1 до $MAX_COUNT пресетов"};(0 until pack.length()).map{require(pack.opt(it)is JSONObject){"Пресет ${it+1} должен быть объектом JSON"};pack.getJSONObject(it)}}else listOf(root)
        return rows.mapIndexed { index,entry ->
            try {
                val payload=entry.optJSONObject("params")?:entry
                val document=when {
                    payload.has("filmStock") -> importLegacyLabRecipe(entry)?:error("Неподдерживаемый рецепт Lab")
                    payload.has("schema") -> Presets.parseImportJson(payload.toString())
                    payload.has("io")||payload.has("settings")||payload.has("filmRender")||payload.has("film_render")||payload.has("printRender")||payload.has("simulation") -> PresetFormats.toNative(payload)
                    else -> payload
                }
                val keys=document.keys().asSequence().toSet()
                val meaningful=keys.intersect(setOf("filmProfile","printProfile","input","raw","camera","creativeWb","grade","enlarger","scanner","output","grain","halation","couplers","glare","experimental","toneCurve","masks","contrastMask","spektrafilmLab"))
                require(meaningful.isNotEmpty()){if(payload.has("info")&&payload.has("data"))"Это профиль плёнки, а не пресет. Импортируйте его в Плёнка → Каталог."else"В JSON не найдены параметры пресета"}
                val normalized=Presets.parseImportJson(document.toString())
                val missingFilm=if(normalized.optString("filmProfile")=="none") {
                    normalized.remove("filmProfile");"Плёнка не выбрана в исходном рецепте: при применении сохранится текущий материал."
                }else ""
                val unmapped=normalized.optJSONArray("unmappedImportFields")
                val note=listOf(missingFilm,normalized.optString("importNote"),if(unmapped!=null&&unmapped.length()>0)"Поля не применены: "+(0 until minOf(8,unmapped.length())).joinToString(", "){unmapped.getString(it)}+". Исходные значения сохранены в JSON рецепта."else "").filter{it.isNotBlank()}.distinct().joinToString(" ")
                if(unmapped!=null&&unmapped.length()>0)normalized.put("sourcePreset",payload)
                val stem=fileName.substringAfterLast('/').replace(Regex("\\.(json|txt|preset)$",RegexOption.IGNORE_CASE),"").trim()
                val name=entry.optString("name").ifBlank{entry.optString("title")}.ifBlank{if(rows.size==1)stem else ""}.ifBlank{normalized.optString("filmProfile")}.ifBlank{"Пресет ${index+1}"}.take(256)
                normalized.put("name",name)
                if(note.isNotBlank())normalized.put("importNote",note)
                ImportedPreset(name,normalized.toString(2),note)
            } catch(e:Exception){throw IllegalArgumentException("Пресет ${index+1}: ${e.message?:"некорректный JSON"}",e)}
        }
    }
    /** Never overwrite an existing preset. Roll back only files this import created. */
    @Synchronized fun store(repo:PresetRepository,entries:List<ImportedPreset>):List<String> {
        val made=mutableListOf<Pair<String,String>>()
        try {
            for(entry in entries){
                var i=1
                while(true){
                    val suffix=if(i==1)""else" - $i"
                    val candidate=repo.resolveName(entry.name.take(96-suffix.length)+suffix)
                    if(repo.saveNewJson(candidate,entry.json)){made+=candidate to entry.json;break}
                    require(++i<=10000){"Слишком много пресетов с именем ${entry.name}"}
                }
            }
            return made.map{it.first}
        }catch(e:Exception){
            for((name,json)in made.asReversed())try {
                if(AtomicJsonStore.parseObject(repo.read(name)).toString()==AtomicJsonStore.parseObject(json).toString())repo.delete(name)
            }catch(rollback:Exception){e.addSuppressed(rollback)}
            throw e
        }
    }
}
