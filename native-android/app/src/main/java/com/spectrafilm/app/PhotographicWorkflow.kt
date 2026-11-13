/* Spektrafilm Lab. GPLv3. Navigation from 9.56, original native widgets and engine. */
package com.spectrafilm.app

import androidx.compose.runtime.staticCompositionLocalOf
import org.json.JSONObject

internal enum class PhotoStage(val title:String, val iconCategory:Category) {
    CAMERA("Камера",Category.EXPOSURE), FILM("Плёнка",Category.SIMULATION),
    DEVELOPMENT("Проявка",Category.EXPERIMENTAL), EFFECTS("Эффекты",Category.GRAIN),
    PRINT("Печать",Category.PAPER), SCAN("Скан",Category.SCANNER), FINISH("Финиш",Category.FRAME)
}
internal enum class PhotoTool(val id:String,val title:String,val stage:PhotoStage?,vararg val categories:Category) {
    EXPOSURE("exposure","Экспозиция",PhotoStage.CAMERA,Category.EXPOSURE),
    BALANCE("balance","Баланс белого",PhotoStage.CAMERA,Category.RAW_WB),
    PREP("prep","Подготовка",PhotoStage.CAMERA,Category.EXPOSURE),
    LENS("lens","Оптика",PhotoStage.CAMERA,Category.LENS_BLUR,Category.CAMERA_DIFFUSION,Category.INPUT),
    FILTER("taking-filter","Цветной фильтр",PhotoStage.CAMERA,Category.EXPERIMENTAL),
    INPUT_COLOR("input-color","Входной цвет",PhotoStage.CAMERA,Category.INPUT),
    RAW_CLEANUP("raw-cleanup","Очистка RAW",PhotoStage.CAMERA,Category.RAW_CLEANUP),
    SOURCE("source","Исходник",PhotoStage.CAMERA,Category.SOURCE),
    FILMS("films","Каталог",PhotoStage.FILM,Category.SIMULATION),
    FORMAT("format","Формат",PhotoStage.FILM,Category.FILM_FORMAT),
    SPECTRUM("spectrum","Спектр",PhotoStage.FILM,Category.INPUT),
    FILM_BASE("film-base","Основа и маска",PhotoStage.FILM,Category.EXPERIMENTAL),
    PROFILE("profile","Профиль",PhotoStage.FILM,Category.SIMULATION),
    DEVELOP("develop","Push / Pull",PhotoStage.DEVELOPMENT,Category.EXPERIMENTAL),
    CHEMISTRY("chemistry","Химия",PhotoStage.DEVELOPMENT,Category.EXPERIMENTAL),
    DIR("dir","DIR",PhotoStage.DEVELOPMENT,Category.COUPLERS),
    GRAIN("grain","Зерно",PhotoStage.EFFECTS,Category.GRAIN),
    HALATION("halation","Галяция",PhotoStage.EFFECTS,Category.HALATION),
    DATE("date","Дата на плёнке",PhotoStage.EFFECTS,Category.DATE_STAMP),
    OUTPUT("output","Вывод",PhotoStage.PRINT,Category.SCANNER),
    PAPER("paper","Бумага и печать",PhotoStage.PRINT,Category.PAPER,Category.PRINT_EXPOSURE,Category.PRINT_COLOR,Category.ENLARGER,Category.PREFLASH,Category.EXPERIMENTAL),
    PAPER_BASE("paper-base","Основа бумаги",PhotoStage.PRINT,Category.PAPER),
    TEST_PRINT("test-print","Пробная печать",PhotoStage.PRINT,Category.EXPERIMENTAL),
    SCAN("scan","Скан без бумаги",PhotoStage.SCAN,Category.SCANNER),
    NEGATIVE("negative","Настоящий негатив",PhotoStage.SCAN,Category.EXPERIMENTAL),
    SPECTRAL_SCAN("spectral-scan","Спектральный скан",PhotoStage.SCAN,Category.SCANNER,Category.GLARE),
    CROP("crop","Кадрирование",PhotoStage.FINISH,Category.INPUT),
    FRAME("frame","Рамка",PhotoStage.FINISH,Category.FRAME),
    TONE("tone","Цифровой тон",PhotoStage.FINISH,Category.TONE_CURVE,Category.SAT_VIB,Category.SCENE_LATITUDE,Category.CONTRAST_MASK),
    OUTPUT_COLOR("output-color","Цвет и размер",PhotoStage.FINISH,Category.OUTPUT,Category.INPUT),
    FILE("export","Файл",PhotoStage.FINISH,Category.OUTPUT),
    PRESETS("presets","Рецепты",null,Category.PRESETS),
    MASKS("masks","Маски",null,Category.MASKS),
    DISPLAY("display","Предпросмотр",null,Category.DISPLAY);
    val category:Category get()=categories.first()
}
internal val LocalPhotoNavigate=staticCompositionLocalOf<(PhotoTool)->Unit>{{}}
internal val LocalPhotoTool=staticCompositionLocalOf<PhotoTool?>{null}
internal fun photoTools(stage:PhotoStage)=PhotoTool.entries.filter{it.stage==stage}
internal fun photoToolFor(category:Category):PhotoTool = when(category) {
    Category.INPUT -> PhotoTool.SPECTRUM
    Category.EXPERIMENTAL -> PhotoTool.DEVELOP
    Category.SCANNER -> PhotoTool.SCAN
    Category.PAPER -> PhotoTool.PAPER
    else -> PhotoTool.entries.first{category in it.categories && it !in listOf(PhotoTool.PREP,PhotoTool.PROFILE,PhotoTool.FILE,PhotoTool.CROP)}
}
internal fun resolvePhotoTool(saved:String?,category:Category?):PhotoTool {
    val page=PhotoTool.entries.firstOrNull{it.id==saved}
    return page?.takeIf{category==null||it.category==category} ?: category?.let(::photoToolFor) ?: PhotoTool.FILMS
}

/** Scope is by photographic task, so resetting Prep cannot reset camera exposure. */
internal fun PhotoTool.nativePaths():List<String> = when(this) {
    PhotoTool.PREP,PhotoTool.FILTER,PhotoTool.FILM_BASE,PhotoTool.PROFILE,PhotoTool.CHEMISTRY,
    PhotoTool.PAPER_BASE,PhotoTool.TEST_PRINT,PhotoTool.NEGATIVE,PhotoTool.FILE -> emptyList()
    PhotoTool.OUTPUT -> listOf("output.scanFilm")
    PhotoTool.SCAN -> listOf("scanner.lensBlur","scanner.unsharpMask")
    PhotoTool.LENS -> listOf("camera.lensBlurUm","camera.diffusion","input.filterUv","input.filterIr")
    PhotoTool.INPUT_COLOR -> listOf("input.inputColorSpace","input.inputCctfDecoding","output.inputGamutCompress")
    PhotoTool.SPECTRUM -> listOf("input.spectralUpsampling","input.adaptationWindow","input.adaptationSurface","input.spectralGaussianBlur")
    PhotoTool.DEVELOP -> listOf("experimental.filmGammaFactor")
    PhotoTool.PAPER -> categories.filter{it!=Category.EXPERIMENTAL}.flatMap{CATEGORY_SECTIONS[it].orEmpty()} + listOf("experimental.printGammaFactor","experimental.morphActive","experimental.morphGammaFactor","experimental.morphGammaFactorFast","experimental.morphGammaFactorSlow","experimental.morphGammaFactorRed","experimental.morphGammaFactorGreen","experimental.morphGammaFactorBlue","experimental.morphDeveloperExhaustion")
    PhotoTool.CROP -> listOf("input.crop","input.cropCenter","input.cropSize","input.straighten")
    PhotoTool.OUTPUT_COLOR -> CATEGORY_SECTIONS[Category.OUTPUT].orEmpty().filter{it!="output.inputGamutCompress"} + "input.upscaleFactor"
    else -> categories.flatMap{CATEGORY_SECTIONS[it].orEmpty()}
}
internal fun PhotoTool.labPrefixes():List<String> = when(this) {
    PhotoTool.PREP -> listOf("negsPrep")
    PhotoTool.FILTER -> listOf("colorFilter")
    PhotoTool.SPECTRUM -> listOf("spectralMethod")
    PhotoTool.FILM_BASE -> listOf("filmBase")
    PhotoTool.CHEMISTRY -> listOf("filmChemistry","filmFast","filmSlow","filmRed","filmGreen","filmBlue","filmExhaustion")
    PhotoTool.DIR -> listOf("dir")
    PhotoTool.GRAIN -> listOf("grain")
    PhotoTool.HALATION -> listOf("layeredTransport")
    PhotoTool.PAPER_BASE -> listOf("printBase")
    PhotoTool.OUTPUT -> listOf("outputModel.mode")
    PhotoTool.SCAN -> listOf("outputModel")
    PhotoTool.NEGATIVE -> listOf("scan","workflow")
    else -> emptyList()
}
private fun samePhotoValue(a:Any?,b:Any?):Boolean = when {
    a is Number && b is Number -> kotlin.math.abs(a.toDouble()-b.toDouble())<1e-7
    a is JSONObject && b is JSONObject -> (a.keys().asSequence().toSet()+b.keys().asSequence().toSet()).all{samePhotoValue(a.opt(it),b.opt(it))}
    else -> a?.toString()==b?.toString()
}
private val photoDefaults:JSONObject by lazy { Presets.encode(PARAM_DEFAULTS) }
internal fun photoDirtyTools(s:ParamsState):Set<PhotoTool> {
    val current=Presets.encode(s);val lab=s.labObject()
    return PhotoTool.entries.filterTo(mutableSetOf()){it.changed(s,current,photoDefaults,lab)}
}
internal fun PhotoTool.changed(s:ParamsState,current:JSONObject=Presets.encode(s),defaults:JSONObject=photoDefaults,lab:JSONObject=s.labObject()):Boolean {
    if(this==PhotoTool.OUTPUT)return s.scanFilm!=PARAM_DEFAULTS.scanFilm || s.labString("outputModel.mode","paper")!="paper"
    if(this==PhotoTool.SCAN)return s.scanCorrectionsChanged()
    if(nativePaths().any{!samePhotoValue(current.valueAt(it),defaults.valueAt(it))})return true
    fun changed(v:Any?,path:String):Boolean=if(v is JSONObject)v.keys().asSequence().any{changed(v.opt(it),"$path.$it")}else!samePhotoValue(v,LabCatalog.default(path))
    return lab.keys().asSequence().any{k->labPrefixes().any{k.startsWith(it)}&&changed(lab.opt(k),k)}
}
internal fun PhotoTool.reset(s:ParamsState) {
    if(this==PhotoTool.OUTPUT){s.setLab("outputModel.mode",null);s.scanFilm=PARAM_DEFAULTS.scanFilm;return}
    if(this==PhotoTool.SCAN){s.resetScanCorrections();return}
    val defaults=Presets.encode(PARAM_DEFAULTS);val partial=JSONObject()
    for(path in nativePaths())partial.setAt(path,defaults.valueAt(path))
    if(partial.length()>0)Presets.decode(partial,s)
    val lab=s.labObject()
    for(k in lab.keys().asSequence().toList())if(labPrefixes().any{k.startsWith(it)})lab.remove(k)
    s.labJson=lab.toString()
}
