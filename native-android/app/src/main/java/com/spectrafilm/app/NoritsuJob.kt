/* Noritsu job-bundle transport. GPLv3; captured tables remain external data. */
package com.spectrafilm.app

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal const val NORITSU_JOB_LIMIT = 512 * 1024
internal const val NORITSU_FACTORY_ID = "ls600-g0t1-neutral-v1"
internal val NORITSU_JOB_KEYS = listOf("noritsuJobEnabled", "noritsuLocalContrast", "noritsuFilmSharp", "noritsuHueSat", "noritsuJobNormalize")

/** Validate before a profile can mutate live parameters; binary chunks also obey json_min ceilings. */
internal fun validateNoritsuJob(j: JSONObject): JSONObject {
    require(j.toString().length <= NORITSU_JOB_LIMIT - 32768) { "Профиль Noritsu слишком большой" }
    fun integer(v: Any?, lo: Long, hi: Long): Int {
        require(v is Number && v.toDouble().isFinite() && v.toDouble() == kotlin.math.truncate(v.toDouble()) && v.toDouble() >= lo && v.toDouble() <= hi) { "Noritsu: неверное целое значение" }
        return v.toLong().toInt()
    }
    fun words(a: JSONArray?, count: Int, lo: Long = 0, hi: Long = 65535): List<Int> {
        require(a != null && a.length() == count) { "Noritsu: неверный размер массива" }
        return (0 until count).map { integer(a.get(it), lo, hi) }
    }
    fun field(o: JSONObject, key: String, lo: Long, hi: Long) = integer(o.opt(key),lo,hi)
    fun chunks(key: String, bytes: Int): ByteArray {
        val a=j.getJSONArray(key);require(a.length() in 1..512) { "Noritsu: неверное число блоков" }
        val out=java.io.ByteArrayOutputStream(bytes)
        for(i in 0 until a.length()) {
            val text=a.get(i);require(text is String && text.length <= 4096 && text.length % 2 == 0 && text.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) { "Noritsu: повреждён бинарный блок" }
            var p=0;while(p<text.length) { val b=text.substring(p,p+2).toIntOrNull(16);require(b!=null && b in 0..255) { "Noritsu: неверные hex-данные" };out.write(b);p+=2;require(out.size()<=bytes) { "Noritsu: лишние бинарные данные" } }
        }
        return out.toByteArray().also { require(it.size==bytes) { "Noritsu: бинарные данные обрезаны" } }
    }
    val known=setOf("schema","name","origin","sourceSha256","latticeSha256","encoding","outputBits","rgbToYcc","inverseMatrix","gammaBgrHex","yccCorrection","autoContrast","filmSharpHex","hueLatticeHex","saturation","balance","context")
    require(j.keys().asSequence().all { it in known }) { "Неизвестное поле профиля Noritsu" }
    require(field(j,"schema",1,1)==1)
    require(j.opt("name") is String && j.getString("name").isNotBlank() && j.getString("name").length<=120) { "Нужно короткое имя профиля" }
    require(j.optString("origin") in listOf("capture","synthetic-test","user","factory-calculated")) { "Укажите происхождение данных" }
    if(j.has("context"))require(j.opt("context") is String && j.getString("context").length<=512)
    require(j.optString("sourceSha256").matches(Regex("[0-9a-fA-F]{64}"))) { "Нет SHA-256 исходного блока" }
    if(j.has("latticeSha256"))require(j.getString("latticeSha256").matches(Regex("[0-9a-fA-F]{64}")))
    require(j.optString("encoding") in listOf("srgb","linear")) { "Укажите кодирование RGB профиля" }
    val bits=field(j,"outputBits",8,16);require(bits==8||bits==16)
    fun keys(o:JSONObject, allowed:Set<String>) { require(o.keys().asSequence().all { it in allowed }) { "Неизвестное поле блока Noritsu" } }
    val rgb=j.getJSONObject("rgbToYcc");keys(rgb,setOf("matrix","offsets","counts","x","y"));val forward=words(rgb.getJSONArray("matrix"),9,-32768);val inputOffsets=words(rgb.getJSONArray("offsets"),3,-32768)
    val counts=words(rgb.getJSONArray("counts"),3,1,20);val xx=rgb.getJSONArray("x");val yy=rgb.getJSONArray("y");require(xx.length()==3&&yy.length()==3)
    fun increasing(a: List<Int>, count: Int) { require((1 until count).all { a[it]>a[it-1] }) { "Координаты кривой должны возрастать" } }
    for(c in 0..2) { increasing(words(xx.getJSONArray(c),20),counts[c]);words(yy.getJSONArray(c),20) }
    words(j.getJSONArray("inverseMatrix"),9,-32768)
    val gamma=chunks("gammaBgrHex",3*4096*2)
    if(bits==8)for(i in gamma.indices step 2)require(((gamma[i].toInt()and 255)or((gamma[i+1].toInt()and 255)shl 8))%257==0) { "Профиль 8 бит содержит значения другой точности" }
    val cc=j.getJSONObject("yccCorrection");keys(cc,setOf("yX","y","yCount","chromaX","offsets","scale","chromaCount"));val yc=field(cc,"yCount",1,20);val nc=field(cc,"chromaCount",1,20)
    increasing(words(cc.getJSONArray("yX"),20),yc);words(cc.getJSONArray("y"),20)
    increasing(words(cc.getJSONArray("chromaX"),20),nc);words(cc.getJSONArray("scale"),20)
    val off=cc.getJSONArray("offsets");require(off.length()==2);for(c in 0..1)words(off.getJSONArray(c),20,-32768)
    if(j.has("autoContrast")) {
        val a=j.getJSONObject("autoContrast");keys(a,setOf("factor","size","strength","clamp","quadrant","x","y","blend"));val factor=field(a,"factor",2,16);require(factor%2==0);val size=field(a,"size",5,9);require(size in listOf(5,7,9))
        field(a,"strength",0,255);field(a,"clamp",0,65535)
        val quadrant=words(a.getJSONArray("quadrant"),(size/2+1)*(size/2+1),0,127)
        val total=(0 until size).sumOf { y -> (0 until size).sumOf { x -> quadrant[minOf(y,size-1-y)*(size/2+1)+minOf(x,size-1-x)] } }
        fun signed(value:Int)=if(value>32767)value-65536 else value
        val upperY=kotlin.math.ceil(4.0+(0..2).sumOf { c -> val coefficient=(signed(forward[c])*.0001f).toDouble();signed(inputOffsets[c])*coefficient+maxOf(0.0,coefficient)*65535 }).coerceIn(0.0,65535.0)
        require(total>=1 && (total<=256 || field(a,"strength",0,255)<=128 && total*upperY<=16777216.0)) { "Auto Contrast: сумма весов выходит за проверенный диапазон float32" }
        increasing(words(a.getJSONArray("x"),5),5);words(a.getJSONArray("y"),5,Int.MIN_VALUE.toLong(),Int.MAX_VALUE.toLong());words(a.getJSONArray("blend"),4,-32768)
    }
    if(j.has("filmSharpHex")) {
        val b=chunks("filmSharpHex",0x154);fun u16(off:Int)=(b[off].toInt()and 255)or((b[off+1].toInt()and 255)shl 8)
        val sizes=listOf(0 to 5,0x16 to 5,0x2c to 13,0x92 to 11,0xde to 9)
        sizes.forEach { (offset,max) -> val size=b[offset].toInt()and 255;require(size in 1..max && size%2==1) { "Film Sharp: неверный размер ядра" } }
        listOf(0x14,0x2a,0x90,0xdc,0x112).forEach { require(u16(it)>0) { "Film Sharp: нулевой делитель" } }
        require((b[0x116].toInt()and 255)<=4 && (b[0x117].toInt()and 255)<=4)
        require(u16(0x120)-u16(0x124)<=32768) { "Film Sharp: недопустимая таблица отклика" }
    }
    if(j.has("hueLatticeHex")) { chunks("hueLatticeHex",9*33*33*3*2);field(j,"saturation",0,255);words(j.getJSONArray("balance"),2,-32768) }
    return j
}

internal fun ParamsState.installNoritsuJob(text: String) {
    require(text.length<=NORITSU_JOB_LIMIT) { "Профиль превышает 512 КиБ" }
    val job=validateNoritsuJob(JSONObject(text));installValidatedNoritsuJob(job)
}
private fun ParamsState.installValidatedNoritsuJob(job: JSONObject) {
    val next=labObject();next.remove("noritsuJobId");next.put("noritsuJob",job)
    val out=next.optJSONObject("outputModel")
    // An imported acquisition is a different input/calibration contract. Never inherit
    // enabled stages or factory normalization from the previous dataset.
    NORITSU_JOB_KEYS.forEach{out?.remove(it)}
    val result=next.toString();require(result.length<=NORITSU_JOB_LIMIT) { "Рецепт с профилем превышает 512 КиБ" }
    val workspace=negativeWorkspaceWithInactiveJobs()
    labJson=result
    if(workspace!=null)negativeWorkspaceJson=workspace
}

internal fun ParamsState.useFactoryNoritsuJob(text: String) {
    val job=validateNoritsuJob(JSONObject(text))
    require(job.getString("origin")=="factory-calculated")
    installValidatedNoritsuJob(job)
    chooseScanReceiver("noritsu-ls600")
    setLab("outputModel.noritsuJobEnabled",true)
    setLab("outputModel.noritsuJobNormalize",true)
    setLab("outputModel.noritsuLocalContrast",job.has("autoContrast"))
    setLab("outputModel.noritsuFilmSharp",job.has("filmSharpHex"))
    setLab("outputModel.noritsuHueSat",job.has("hueLatticeHex"))
}

private fun ParamsState.negativeWorkspaceWithInactiveJobs():String? {
    if(negativeWorkspaceJson.isBlank())return null
    val workspace=negativeWorkspace()
    val variants=workspace.getJSONArray("variants")
    for(i in 0 until variants.length()) {
        val model=variants.getJSONObject(i).getJSONObject("outputModel")
        NORITSU_JOB_KEYS.forEach{model.remove(it)}
    }
    return workspace.toString()
}

/** A stable built-in ID keeps sliders/history small; the complete tables remain exportable. */
internal fun ParamsState.useBuiltinFactoryNoritsuJob() {
    val next=labObject()
    val workspace=if(next.optString("noritsuJobId")!=NORITSU_FACTORY_ID)negativeWorkspaceWithInactiveJobs() else null
    next.remove("noritsuJob");next.put("noritsuJobId",NORITSU_FACTORY_ID)
    val model=next.optJSONObject("outputModel")?:JSONObject().also{next.put("outputModel",it)}
    model.put("mode","noritsu-ls600")
    NORITSU_JOB_KEYS.forEach{model.put(it,true)}
    labJson=next.toString()
    if(workspace!=null)negativeWorkspaceJson=workspace
}

@Composable
internal fun NoritsuJobControls(s: ParamsState) {
    val ctx=LocalContext.current;val scope=rememberCoroutineScope();var busy by remember { mutableStateOf(false) };var message by remember { mutableStateOf("") }
    val stored=remember(s.labJson){s.labObject()}
    val builtin=stored.optString("noritsuJobId")==NORITSU_FACTORY_ID
    var factoryJob by remember{mutableStateOf<JSONObject?>(null)}
    LaunchedEffect(builtin) {
        if(builtin&&factoryJob==null)try {
            factoryJob=withContext(Dispatchers.IO){validateNoritsuJob(JSONObject(ctx.assets.open("lab/noritsu-factory-experimental.json").bufferedReader().use{it.readText()}))}
        }catch(e:CancellationException){throw e}catch(e:Exception){message="Не удалось прочитать встроенный профиль: ${e.message}"}
    }
    val job=if(builtin)factoryJob else stored.optJSONObject("noritsuJob")
    val enabled=s.labBoolean("outputModel.noritsuJobEnabled")
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if(uri!=null&&!busy){busy=true;scope.launch {try {
            val text=withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { input ->
                val out=java.io.ByteArrayOutputStream();val buf=ByteArray(8192);while(true){val n=input.read(buf);if(n<0)break;require(out.size()+n<=NORITSU_JOB_LIMIT) { "Профиль превышает 512 КиБ" };out.write(buf,0,n)};out.toString("UTF-8")
            } ?: error("Не удалось прочитать файл") }
            // Full validation happens off the UI thread; live assignment is atomic on return.
            val valid=withContext(Dispatchers.Default) { validateNoritsuJob(JSONObject(text)) }
            s.installValidatedNoritsuJob(valid);message="Профиль загружен. Включение цветового тракта — отдельным переключателем."
        }catch(e:CancellationException){throw e}catch(e:Exception){message="Профиль не загружен: ${e.message}"}finally{busy=false} }}
    }
    val exporter=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri:Uri? ->
        val text=job?.toString()
        if(uri!=null&&text!=null)scope.launch {try { withContext(Dispatchers.IO){writeVerifiedNewDocument(ctx,uri,text.toByteArray(Charsets.UTF_8),NORITSU_JOB_LIMIT)};message="Профиль сохранён" }catch(e:CancellationException){throw e}catch(e:Exception){message="Ошибка сохранения: ${e.message}"} }
    }
    @Composable fun factoryButton() {
        OutlinedButton(enabled=!busy,onClick={busy=true;scope.launch {try {
            val text=withContext(Dispatchers.IO){ctx.assets.open("lab/noritsu-factory-experimental.json").bufferedReader().use{it.readText()}}
            val valid=withContext(Dispatchers.Default){validateNoritsuJob(JSONObject(text))}
            factoryJob=valid;s.useBuiltinFactoryNoritsuJob();message="Заводские блоки включены: цвет, Local Auto Contrast, Film Sharp и Hue/Saturation. Используется постоянный нейтральный опорный контекст, а не захваченное задание физического сканера."
        }catch(e:CancellationException){throw e}catch(e:Exception){message="Не удалось включить профиль: ${e.message}"}finally{busy=false}}},modifier=Modifier.fillMaxWidth().testTag("noritsu-factory-profile")) {Text("Включить заводской профиль · эксперимент")}
    }
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
        if(!builtin||!enabled)factoryButton()
        else Text("Заводской профиль · эксперимент · включён",style=MaterialTheme.typography.labelLarge,color=MaterialTheme.colorScheme.primary)
        @Composable fun profileInfo() {
        if(builtin&&enabled)factoryButton()
        if(job==null)LabNote("Заводской экспериментальный профиль уже встроен: цветовой тракт, Local Auto Contrast, Film Sharp и Hue/Saturation. Можно также импортировать собственный комплект задания.")
        else {
            Text(job.optString("name"),style=MaterialTheme.typography.titleSmall)
            LabNote("${job.optInt("outputBits")} бит · ${job.optString("encoding")} · ${job.optString("sourceSha256").take(12)}")
            if(job.optString("origin")=="synthetic-test")LabNote("Тестовые данные. Это не калибровка реального сканера.")
            if(job.optString("origin")=="factory-calculated")LabNote(job.optString("context"))
            LabNote("Проверен формат комплекта. Совпадение с физическим сканером и переносимость калибровки на другие кадры не подтверждены.")
        }
        OutlinedButton(onClick={importer.launch(arrayOf("application/json","text/plain","application/octet-stream"))},enabled=!busy,modifier=Modifier.fillMaxWidth().testTag("noritsu-job-import")) { Text(if(busy)"Проверяю комплект…"else"Импортировать профиль задания") }
        if(job!=null)OutlinedButton(onClick={exporter.launch("Noritsu-job.json")},enabled=!busy) { Text("Экспортировать профиль") }
        }
        if(builtin&&job==null) {
            Text("Загружаю данные встроенного профиля…",style=MaterialTheme.typography.bodySmall)
            return@Column
        }
        if(!LocalQuietEditor.current)profileInfo()
        if(message.isNotBlank())LabNote(message)
        if(job==null) {
            Text("Цветовой тракт RGB ↔ YCC · нужен профиль",style=MaterialTheme.typography.titleSmall)
            LabNote("Local Auto Contrast · нужны параметры пространственного фильтра\nFilm Sharp · нужен блок 0x154 байт\nHue/Saturation S0 · нужна исходная цветовая решётка")
        } else {
            SwitchRow("Цветовой тракт RGB ↔ YCC",enabled,{s.setLab("outputModel.noritsuJobEnabled",it);if(it&&job.optString("origin")=="factory-calculated")s.setLab("outputModel.noritsuJobNormalize",true)},"Профиль получает коды FilmLUT. YCC-коррекция и выходная гамма берутся из комплекта; прежний адаптер автоподбора обходится.")
            if(enabled) SwitchRow("Согласовать вход с виртуальной плёнкой",s.labBoolean("outputModel.noritsuJobNormalize"),{s.setLab("outputModel.noritsuJobNormalize",it)},"Совмещает средний серый и локальный наклон выбранной плёнки с рабочим диапазоном профиля. Фиксировано для серии. Это адаптация Spektrafilm, а не измеренная калибровка физического LS-600.")
            val stages=listOf(Triple("noritsuLocalContrast","autoContrast","Local Auto Contrast"),Triple("noritsuFilmSharp","filmSharpHex","Film Sharp"),Triple("noritsuHueSat","hueLatticeHex","Hue/Saturation S0"))
            stages.forEach { (flag,section,title) ->
                if(job.has(section)&&enabled)SwitchRow(title,s.labBoolean("outputModel.$flag"),{s.setLab("outputModel.$flag",it)},when(flag){"noritsuLocalContrast"->"Локальная коррекция яркости по параметрам задания.";"noritsuFilmSharp"->"Полный пространственный алгоритм. Обычная нерезкая маска временно обходится.";else->"Коррекция цвета по исходной решётке. Нейтральная насыщенность не делает эту стадию тождественной."})
                else LabNote("$title · ${if(!job.has(section))"в комплекте нет необходимых данных"else"включите цветовой тракт выше"}")
            }
            TextButton(onClick={s.clearScanValues(NORITSU_JOB_KEYS)}) { Text("Отключить профильные стадии") }
        }
        if(LocalQuietEditor.current)QuietParameterGroup("noritsu-profile-info","Данные профиля и файлы","Происхождение · совместимость · импорт и экспорт") { profileInfo() }
    }
}
