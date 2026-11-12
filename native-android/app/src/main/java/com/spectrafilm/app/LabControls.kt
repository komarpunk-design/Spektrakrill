/* Spektrafilm Lab tools, rendered with the original application's Compose widgets. GPLv3. */
package com.spectrafilm.app

import android.net.Uri
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.spectrafilm.engine.SpektraEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray

@Composable internal fun LabNote(text: String) { Text(text, style=MaterialTheme.typography.bodySmall, color=MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable internal fun LabGroup(s: ParamsState, group: String) {
    val ctx=LocalContext.current
    val rows=remember(group) { LabCatalog.controls(ctx,group) }
    val monochrome=LabCatalog.stock(s.filmProfile)?.optBoolean("monochrome")==true
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        for(row in rows) {
            val path=row.getString("path")
            if(monochrome && group=="grain" && (path.endsWith("Green")||path.endsWith("Blue")))continue
            if(group=="dir" && (if(LabCatalog.stock(s.filmProfile)?.optString("type")=="positive") path.startsWith("dirDonor") else path.startsWith("dirReceiver")))continue
            val label=row.getString("label")
            if(row.getString("kind")=="switch") SwitchRow(label,s.labBoolean(path),{s.setLab(path,it)},row.optString("help").ifBlank { null })
            else EnhancedSlider(label,s.labNumber(path),row.getDouble("min").toFloat()..row.getDouble("max").toFloat(),{s.setLab(path,it)},step=row.getDouble("step").toFloat(),decimals=if(row.getDouble("step")<.01)3 else if(row.getDouble("step")<1)2 else 0,tooltip=row.optString("help").ifBlank { null },default=row.getDouble("default").toFloat())
        }
        TextButton(onClick={s.resetLab(ctx,group)}) { Text("Сбросить параметры этой группы") }
    }
}
@Composable internal fun LabChoice(s: ParamsState,path:String,title:String,options:List<Pair<String,String>>,fallback:String) {
    Dropdown(title,if(path in listOf("grainRms","dirLangmuir"))s.labBoolean(path).toString() else s.labString(path,fallback),options.map { it.first },{key->options.firstOrNull { it.first==key }?.second?:key},{s.setLab(path,if(path in listOf("grainRms","dirLangmuir"))it=="true" else it);if(path=="outputModel.mode"&&it=="paper")s.scanFilm=false})
}
@Composable internal fun LabGrainSection(s: ParamsState) {
    SwitchRow("Зерно",s.grainActive,{s.grainActive=it})
    LabNote("RMS задаёт измеренную гранулярность эмульсии. Физический размер кадра задаётся в Film format. Модель Spektrafilm доступна в выборе выше.")
    LabGroup(s,"grain")
    EnhancedSlider("Размытие зерна",s.grainBlur,0f..1.4f,{s.grainBlur=it},step=.05f,default=.65f)
    EnhancedSlider("Облака красителя, мкм",s.grainBlurDyeCloudsUm,0f..4f,{s.grainBlurDyeCloudsUm=it},step=.1f,default=.75f)
    TextButton(onClick={s.applyLabStock(s.filmProfile,dir=false)}) { Text("Восстановить зерно из выбранного профиля") }
}
@Composable internal fun LabHalationSection(s: ParamsState) {
    SwitchRow("Галяция",s.halationActive,{s.halationActive=it})
    LabNote("Layered Transport рассчитывает возврат света через слои плёнки. Антигаляционный слой и прижимная пластина зависят от материала; это модель конструкции, а не измерение конкретного рулона.")
    EnhancedSlider("Сила гало",s.halHalationAmount,0f..3f,{s.halHalationAmount=it},step=.05f,default=1f)
    EnhancedSlider("Размер гало",s.halHalationSpatialScale,.2f..3f,{s.halHalationSpatialScale=it},step=.1f,default=1f)
    LabGroup(s,"transport")
}
@Composable internal fun LabOutputSection(s: ParamsState) {
    LabChoice(s,"outputModel.mode","Получение изображения",listOf("paper" to "Фотобумага / кинопозитив","digital" to "Digital Reference · нейтральный позитив","auto-levels" to "Auto Levels · автоматический позитив","lab-scan" to "Lab Scan · минилаб","negative" to "Негатив на просвет"),"paper")
    val mode=s.labString("outputModel.mode","paper")
    if(mode!="paper") LabNote("Этот маршрут обходит фотобумагу. Яркость и цвет ниже — операторские поправки готового скана, независимо от экспозиции съёмки.")
    if(mode in listOf("digital","auto-levels","lab-scan")) LabGroup(s,"output")
}
@Composable internal fun LabFilmFormat(s:ParamsState) {
    val formats=listOf(17f to "110 · 17 мм",24f to "Полукадр · 24 мм",35f to "135 · 35 мм",56f to "6×4.5 / 6×6 · 56 мм",70f to "6×7 · 70 мм",84f to "6×9 · 84 мм",120f to "4×5 · 120 мм")
    Dropdown("Готовый формат кадра",s.filmFormatMm,formats.map{it.first}.let{if(s.filmFormatMm in it)it else it+s.filmFormatMm},{v->formats.firstOrNull{it.first==v}?.second?:"Свой · $v мм"},{s.filmFormatMm=it})
}
@Composable internal fun LabTimeFamily(s:ParamsState,paper:Boolean=false) {
    val ctx=LocalContext.current
    val groups=remember { listOf("experimental-families","negs-families").flatMap { name-> val a=JSONArray(ctx.assets.open("lab/$name.json").bufferedReader().use{it.readText()});(0 until a.length()).map{a.getJSONObject(it)} } }
    val id=if(paper)s.printProfile else s.filmProfile
    val family=groups.firstOrNull { f-> val a=f.getJSONArray("members");(0 until a.length()).any{a.getJSONObject(it).getString("id")==id} }
    family?.let{f->val a=f.getJSONArray("members");val members=(0 until a.length()).map{a.getJSONObject(it)}
        Dropdown("Время проявки из профиля",id,members.map{it.getString("id")},{key->members.first{it.getString("id")==key}.let{"${it.getDouble("minutes")} мин"+if(it.optBoolean("estimated"))" · оценка" else ""}},{if(paper)s.printProfile=it else s.filmProfile=it})
    }
}
@Composable internal fun LabPaperBase(s:ParamsState) {
    LabNote("Основа печатного материала участвует только в маршруте на фотобумагу. Цифровые режимы её обходят.")
    LabTimeFamily(s,true);LabGroup(s,"paper-base")
}
@Composable internal fun LabAdvancedSection(s:ParamsState,sourceUri:Uri?,isRaw:Boolean) {
    var page by remember { mutableStateOf("spectrum") }
    val sections=listOf("spectrum" to "Спектр и фильтр","chemistry" to "Химия плёнки","film-base" to "Основа и маска","negative" to "Настоящий негатив", "test-print" to "Пробная печать")
    HorizontalDivider();Text("Spektrafilm Lab",style=MaterialTheme.typography.titleMedium)
    Dropdown("Инструмент",page,sections.map{it.first},{p->sections.first{it.first==p}.second},{page=it})
    when(page) {
        "spectrum" -> {
            LabChoice(s,"spectralMethod","Спектральная реконструкция",listOf("legacy" to "Авто · профиль / базовый метод","hanatos2025" to "Hanatos 2025 · Experimental","mallett2019" to "Mallett & Yuksel 2019","otsu2018" to "Otsu 2018","jakob2019" to "Jakob & Hanika 2019","arctic2026beta04" to "Arctic 2026 beta04","gauss-lasers" to "Gauss lasers"),"legacy")
            LabChoice(s,"colorFilter","Съёмочный цветной фильтр",listOf("none" to "Без фильтра","hoya_x0" to "Hoya X0 · жёлто-зелёный","hoya_x1" to "Hoya X1 · зелёный","hoya_y2" to "Hoya Y2 · жёлтый","hoya_ya3" to "Hoya YA3 · насыщенный жёлтый","hoya_r1" to "Hoya R1 · красный"),"none")
            LabNote("Фильтр меняет свет до экспонирования виртуальной плёнки. Базовые настройки Hanatos и гамута находятся в исходных разделах Input / Output.")
        }
        "chemistry" -> {LabTimeFamily(s);LabNote("Послойные коэффициенты меняют кривые негатива. Общая γ выше используется совместно с ними; это не количество ступеней EV.");LabGroup(s,"chemistry")}
        "film-base" -> {LabNote("Плотность и цвет подложки. Для негатива это оранжевая маска; настройки используются также при восстановлении настоящего скана.");LabGroup(s,"film-base")}
        "negative" -> LabNegativeSection(s,sourceUri,isRaw)
        "test-print" -> LabPrintTrials(s,sourceUri,isRaw)
    }
}
@Composable internal fun LabNegativeSection(s:ParamsState,sourceUri:Uri?,isRaw:Boolean) {
    val ctx=LocalContext.current;val scope=rememberCoroutineScope();var busy by remember{mutableStateOf(false)};var message by remember{mutableStateOf("")}
    LabNote("Здесь нужен скан или пересъёмка настоящего цветного негатива. Съёмочные эффекты и Prep при этом обходятся. Выберите соответствующую плёнку в общем каталоге.")
    LabChoice(s,"workflow","Источник изображения",listOf("normal" to "Обычная фотография · эмуляция","negative-print" to "Настоящий негатив → отпечаток","negative-scan" to "Настоящий негатив → скан","negative-clear" to "Настоящий негатив → без маски основы"),"normal")
    if(s.labString("workflow","normal")!="normal") {
        val illuminants=remember{val a=JSONArray(ctx.assets.open("lab/experimental-illuminants.json").bufferedReader().use{it.readText()});(0 until a.length()).map{a.getString(it)}}
        Dropdown("Свет сканера / пересъёмки",s.labString("scanIlluminant","D55"),illuminants,{it},{s.setLab("scanIlluminant",it)})
        LabGroup(s,"negative")
        OutlinedTextField(value=s.labString("scanCalibration"),onValueChange={if(it.length<=512)s.setLab("scanCalibration",it)},label={Text("Матрица сканера · 9 чисел")},modifier=Modifier.fillMaxWidth())
        fun calibrate(base:Boolean) {
            val profile=s.filmProfile;val before=s.labJson;val snapshot=s.snapshot();busy=true;message="Калибровка…"
            scope.launch {
                try {
                    val result=withContext(Dispatchers.Default) {
                        val request=SourceDecodeRequest(ctx.applicationContext,sourceUri,if(isRaw)SourceKind.RAW else SourceKind.PHOTO,false,snapshot.rawImport.rawWhiteBalance,snapshot.rawImport.rawTemperature,snapshot.rawImport.rawTint,SourceRotation.NONE,snapshot.look.creativeWbTemp,snapshot.look.creativeWbTint,false,profile)
                        decodeSourceRequest(request,640,Dispatchers.IO).image.use { image->image.acquireDataLease().use{lease->
                            val f=lease.data.asFloatBuffer();val n=minOf(1500,image.width*image.height);val samples=FloatArray(n*3)
                            for(i in 0 until n) {val at=(i.toLong()*image.width*image.height/n).toInt()*3;for(c in 0..2)samples[i*3+c]=f.get(at+c)}
                            val json=LabProfiles.profileText(ctx,profile)
                            JSONObject(SpektraEngine.nativeCalibrateNegative(json,before.ifBlank{"{}"},samples,base))
                        }}
                    }
                    if(profile!=s.filmProfile||before!=s.labJson){message="Параметры изменились. Повторите калибровку.";return@launch}
                    val next=s.labObject()
                    if(base){val v=result.getJSONArray("base");next.put("filmBaseActive",true);for((i,key)in listOf("filmBaseCyan","filmBaseMagenta","filmBaseYellow").withIndex())next.put(key,v.getDouble(i));next.put("scanExposure",result.getDouble("exposure"))}
                    else next.put("scanCalibration",(0 until result.getJSONArray("matrix").length()).joinToString(" "){result.getJSONArray("matrix").getDouble(it).toString()})
                    s.labJson=next.toString();message="Калибровка применена. Можно отменить через историю."
                }catch(e:Exception){message=e.message?:"Не удалось выполнить калибровку"}finally{busy=false}
            }
        }
        Button(onClick={calibrate(true)},enabled=!busy&&sourceUri!=null){Text("Определить маску негатива")}
        OutlinedButton(onClick={calibrate(false)},enabled=!busy&&sourceUri!=null){Text("Подобрать матрицу сканера")}
        if(message.isNotBlank())LabNote(message)
        LabNote("Для определения маски оставьте в скане незасвеченный край. Подбор матрицы экспериментальный; нужны разнообразные цвета. Используются линейные данные исходника, а не готовый позитив.")
    }
}

@Composable internal fun LabLegacyFrame(s:ParamsState,options:ExportOptions,onChange:(ExportOptions)->Unit) {
    val frame=s.labObject().optJSONObject("legacyFrame")?:return
    LabNote("В рецепте 9.56 сохранено оформление края. Оно доступно как рамка нового приложения.")
    TextButton(onClick={
        val style=when(frame.optString("style")){"135"->FilmBorder.STRIP_135;"120"->FilmBorder.ROLL_120;"minimal"->FilmBorder.PRINT_WHITE;"white"->FilmBorder.PRINT_WHITE;else->FilmBorder.NONE}
        val date=frame.optString("date")
        onChange(options.withFrame(FrameSpec(style,FrameLook(frameNumber=frame.optInt("number",1).coerceIn(1,99),dxBarcode=frame.optBoolean("barcode"),edgeLabel=date,caption=if(date.isNotBlank()&&!style.isStrip)CaptionKind.CUSTOM else CaptionKind.NONE,captionText=date))))
    }){Text("Применить рамку из рецепта 9.56")}
}
