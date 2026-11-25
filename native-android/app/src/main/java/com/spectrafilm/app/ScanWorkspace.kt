/* Paperless scan workstation using the native editor controls. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlin.math.abs

internal val SCAN_RECEIVER_MODES = listOf("lab-scan", "noritsu-ls600", "digital", "auto-levels", "nikon-scan")
internal val NORITSU_GRADATION_KEYS = listOf("noritsuGamma", "noritsuLow", "noritsuMid", "noritsuHigh", "noritsuUo")
internal val NORITSU_INTEGER_KEYS = setOf("noritsuLow", "noritsuMid", "noritsuHigh", "noritsuUo")
internal val NORITSU_COLOUR_KEYS = listOf("noritsuSaturation", "noritsuRed", "noritsuGreen", "noritsuBlue")
internal val NORITSU_CORRECTION_KEYS = NORITSU_GRADATION_KEYS + NORITSU_COLOUR_KEYS + NORITSU_JOB_KEYS
internal val SCAN_CORRECTION_DEFAULTS: Map<String, Any> = linkedMapOf(
    "autoSetup" to true, "look" to 1.0, "exposure" to 0.0,
    "cyan" to 0.0, "magenta" to 0.0, "yellow" to 0.0,
    "contrast" to 1.0, "blackPoint" to 0.0, "whitePoint" to 1.0,
    "noritsuGamma" to 1.0, "noritsuSaturation" to 1.0,
    "noritsuRed" to 1.0, "noritsuGreen" to 1.0, "noritsuBlue" to 1.0,
    "noritsuLow" to 100, "noritsuMid" to 100, "noritsuHigh" to 100, "noritsuUo" to 0,
    "noritsuJobEnabled" to false, "noritsuLocalContrast" to false, "noritsuFilmSharp" to false, "noritsuHueSat" to false,
    "noritsuJobNormalize" to false,
)
private val toneKeys = listOf("contrast", "blackPoint", "whitePoint")
private val colourKeys = listOf("cyan", "magenta", "yellow")

internal fun ParamsState.chooseScanReceiver(mode: String) {
    require(mode in SCAN_RECEIVER_MODES)
    setLab("outputModel.mode", mode)
}

internal fun ParamsState.clearScanValues(keys: Collection<String>) {
    val next = labObject()
    next.optJSONObject("outputModel")?.let { model ->
        keys.forEach(model::remove)
        if (model.length() == 0) next.remove("outputModel")
    }
    labJson = next.toString()
}

internal fun ParamsState.resetScanCorrections() {
    clearScanValues(SCAN_CORRECTION_DEFAULTS.keys)
    scanLensBlur = PARAM_DEFAULTS.scanLensBlur
    scanUnsharpMask = PARAM_DEFAULTS.scanUnsharpMask
}

private fun ParamsState.scanValueChanged(key: String): Boolean {
    val value = labOverrideValue("outputModel.$key") ?: return false
    val baseline = SCAN_CORRECTION_DEFAULTS.getValue(key)
    val tolerance = if (key in NORITSU_COLOUR_KEYS) 1e-4 else 1e-7
    return if (value is Number && baseline is Number) abs((if (key in NORITSU_INTEGER_KEYS) value.toInt().toDouble() else value.toDouble())-baseline.toDouble()) > tolerance
        else value != baseline
}

internal fun ParamsState.scanCorrectionsChanged(): Boolean =
    SCAN_CORRECTION_DEFAULTS.keys.any { scanValueChanged(it) } ||
        scanLensBlur != PARAM_DEFAULTS.scanLensBlur || scanUnsharpMask != PARAM_DEFAULTS.scanUnsharpMask

@Composable
private fun ScanSlider(s: ParamsState, key: String, label: String? = null) {
    val ctx = LocalContext.current
    val row = remember(ctx, key) { LabCatalog.controls(ctx, "output").first { it.getString("path") == "outputModel.$key" } }
    val step = row.getDouble("step").toFloat()
    val neutral = row.getDouble("default").toFloat()
    val limits = row.getDouble("min").toFloat()..row.getDouble("max").toFloat()
    val current = s.labNumber("outputModel.$key").coerceIn(limits).let { if (step >= 1f) it.toInt().toFloat() else it }
    Column(Modifier.parameterSearchTarget("outputModel.$key")) {
    EnhancedSlider(
        label ?: row.getString("label"), current,
        limits,
        { s.setLab("outputModel.$key", if (step >= 1f) it.toInt() else if (abs(it-neutral) < step/100f) neutral else it) }, step = step,
        decimals = if (step >= 1f) 0 else if (step < .01f) 3 else 2,
        tooltip = row.getString("help"), default = row.getDouble("default").toFloat(),
        modifier = Modifier.testTag("scan-control-$key"),
    )
    }
}

@Composable
private fun ScanGroup(id: String, title: String, changed: Boolean, content: @Composable () -> Unit) {
    if(LocalQuietEditor.current) {
        QuietParameterGroup("scan-$id",title,summary=when(id){
            "noritsu-job"->"Заводской профиль · Film Sharp · Auto Contrast · Hue/Saturation"
            "tone"->"Контраст · чёрная и белая точки"
            "colour"->"Устранение цветного оттенка"
            "noritsu-gradation"->"Гамма · тени · средние тона · света"
            "noritsu-colour"->"Насыщенность и усиление RGB"
            "character"->"Сила характера минилаба"
            "detail"->"Оптическая мягкость и резкость"
            else->"Происхождение алгоритмов и ограничения"
        },changed=changed,content=content)
        return
    }
    var expanded by rememberSaveable(id) { mutableStateOf(false) }
    // These are peer groups, not an outer tool wrapper. Preserve their collapsible
    // headers inside the native panel's otherwise flat section presentation.
    CompositionLocalProvider(LocalFlatSections provides false) {
        SectionCard(
            title + if (changed) " · изменено" else "", expanded, { expanded = it },
            modifier = Modifier.testTag("scan-group-$id"), content = content,
        )
    }

}

@Composable
internal fun ScanWorkspace(s: ParamsState) {
    val ctx = LocalContext.current
    val stock = remember(ctx, s.filmProfile) { LabCatalog.initialize(ctx); LabCatalog.stock(s.filmProfile) }
    val navigate = LocalPhotoNavigate.current
    val workflow = s.labString("workflow", "normal")
    val mode = s.labString("outputModel.mode", "paper")
    val noritsu = mode == "noritsu-ls600"
    val profileActive = noritsu && stock?.optBoolean("monochrome") != true && s.labBoolean("outputModel.noritsuJobEnabled")
    val monochrome = stock?.optBoolean("monochrome") == true
    val automatic = s.labValue("outputModel.autoSetup") as? Boolean ?: true
    val reversal = StockCatalog.isReversalFilm(ctx, s.filmProfile) || stock?.optString("type") == "positive"
    val modes = listOf(
        "lab-scan" to "Lab Scan · характер минилаба",
        "noritsu-ls600" to "Noritsu LS-600 · реконструкция",
        "nikon-scan" to "Nikon Scan · модель v2 (эксперимент)",
        "digital" to "Digital Reference · фиксированный",
        "auto-levels" to "Auto Levels · автоподбор кадра",
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if(workflow == "normal" && !reversal) {
            if(!LocalQuietEditor.current||mode=="negative")NegativeWorkspaceControls(s)
            if(mode == "negative" && s.negativeWorkspaceJson.isNotBlank()) {
                LabNote("Негатив на просвет. При сохранении будет выведен этот негатив; для позитива нажмите «Готовый скан». Режим настоящего негатива включать не нужно.")
                return@Column
            }
        }
        if (mode !in SCAN_RECEIVER_MODES || reversal || workflow in listOf("negative-print", "negative-clear"))
            Text("Цифровой позитив без фотобумаги", style = MaterialTheme.typography.titleMedium)
        if (workflow in listOf("negative-print", "negative-clear")) {
            LabNote("Сейчас выбран другой маршрут настоящего негатива. Для цифрового позитива выберите «Настоящий негатив → скан» в его настройках. Текущие параметры сохраняются.")
            OutlinedButton(onClick = { navigate(PhotoTool.NEGATIVE) }) { Text("Открыть настоящий негатив") }
            return@Column
        }
        if (reversal) {
            LabNote("Выбран слайд: цифровые приёмники и их операторские поправки предназначены для инверсии негативной плёнки. Слайд просматривается напрямую через соседний «Спектральный скан».")
            OutlinedButton(onClick = { navigate(PhotoTool.FILMS) }) { Text("Выбрать негативную плёнку") }
            return@Column
        }
        if (workflow == "negative-scan") {
            LabNote("Источник — настоящий негатив. Маска и калибровка находятся на вкладке «Настоящий негатив»; здесь настраивается получаемый цифровой позитив.")
        }
        if (mode !in SCAN_RECEIVER_MODES) {
            LabNote("Сейчас используется ${if (mode == "negative") "негатив на просвет" else if (s.scanFilm) "исходный спектральный сканер" else "фотобумага"}. Включите цифровой приёмник, чтобы настраивать позитив здесь.")
            Button(onClick = { s.chooseScanReceiver("lab-scan") }, modifier = Modifier.fillMaxWidth().testTag("scan-enable")) {
                Text("Включить Lab Scan без бумаги")
            }
            LabNote("Сохранятся плёнка, проявка и параметры бумаги. Сменить маршрут обратно можно в Печать → Вывод.")
            if(LocalQuietEditor.current&&workflow=="normal")NegativeWorkspaceControls(s)
            return@Column
        }
        Dropdown("Режим сканирования", mode, modes.map { it.first }, { key -> modes.first { it.first == key }.second }, { s.chooseScanReceiver(it) })
        ScanSlider(s, "exposure", "Яркость скана · EV")
        if (profileActive) LabNote("Используется цветовой тракт задания. Старый автоподбор адаптера сохранён, но не применяется. EV и CMY здесь работают после выхода из профильного RGB.")
        else if (mode == "lab-scan" || mode == "nikon-scan" && !monochrome || (noritsu && !monochrome)) {
            SwitchRow(if (mode=="nikon-scan") "Автоэкспозиция Nikon" else if (noritsu) "Автоподбор адаптера" else "Автоподбор кадра", automatic, { s.setLab("outputModel.autoSetup", it) },
                if(mode=="nikon-scan")"Подбор общей яркости виртуального скана. Баланс каналов согласован с выбранной плёнкой; оценка RGB-усилений для реального Coolscan к виртуальному входу не применяется."
                else if (noritsu) "Медиана и запас светов. Выключите для серии; автоэкспозиция камеры независима."
                else if (automatic) "Подбор плотности и контраста для каждого кадра. Выключите для серии."
                else "Фиксированный сканер для серии. Автоэкспозиция камеры настраивается независимо.")
        } else if(mode!="nikon-scan")LabNote(if (noritsu && monochrome) "Для ч/б сейчас работает Digital Reference: восстановлены только цветные таблицы NEGA135. Автоподбор Noritsu не применяется."
            else if (mode == "digital") "Фиксированный нейтральный приёмник. Автоподбора и характера минилаба здесь нет; ручные поправки ниже работают."
            else "Автоподбор включён в этом режиме всегда. Для фиксированной серии выберите Digital Reference или выключите автоподбор в Lab Scan.")
        if(mode=="nikon-scan")LabNote(if(monochrome)"Для ч/б применяется нейтральный Digital Reference: модель Nikon обучена на цветном негативе." else "Открытая модель Nikonlook-v2: матрица и поканальные кривые; вход согласован с выбранной плёнкой по всей нейтральной тоновой шкале, включая тени и света. Вход виртуальной плёнки — адаптация Spektrafilm, не измеренный сенсор Coolscan. Не точная копия Nikon Scan и не управление физическим сканером. Автоэкспозиция меняет только общую яркость.")
        if (noritsu) {
            LabNote("Частичная реконструкция LS-600: таблицы Noritsu; приёмник и автоподбор — наша адаптация.")
            if (monochrome) OutlinedButton(onClick = { s.chooseScanReceiver("lab-scan") }) { Text("Использовать Lab Scan для ч/б") }
        }
        if (noritsu && !monochrome) ScanGroup("noritsu-job", "Профильные стадии Noritsu", NORITSU_JOB_KEYS.any { s.scanValueChanged(it) }) { NoritsuJobControls(s) }
        ScanGroup("tone", "Тон и уровни", toneKeys.any { s.scanValueChanged(it) }) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                toneKeys.forEach { ScanSlider(s, it) }
                TextButton(onClick = { s.clearScanValues(toneKeys) }) { Text("Сбросить тон и уровни") }
            }
        }
        ScanGroup("colour", "Цветовой баланс · CMY", colourKeys.any { s.scanValueChanged(it) }) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (stock?.optBoolean("monochrome") == true)
                    LabNote("Ч/б материал остаётся серым: ключи могут менять плотность, но не окрашивают изображение.")
                LabNote("Добавляйте циан против красного оттенка, мадженту против зелёного, жёлтый против синего. Отрицательные значения действуют наоборот.")
                ScanSlider(s, "cyan", "Красный ↔ циан")
                ScanSlider(s, "magenta", "Зелёный ↔ маджента")
                ScanSlider(s, "yellow", "Синий ↔ жёлтый")
                TextButton(onClick = { s.clearScanValues(colourKeys) }) { Text("Сбросить цветовой баланс") }
            }
        }
        if (noritsu && !monochrome) {
            ScanGroup("noritsu-gradation", "Градация Noritsu", NORITSU_GRADATION_KEYS.any { s.scanValueChanged(it) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabNote("Три участка кривой регулируются независимо. 100% сохраняет наклон; гамма меняет полутона. Это правки готового позитива — параметры проявки сохраняются.")
                    ScanSlider(s, "noritsuGamma")
                    listOf("noritsuLow", "noritsuMid", "noritsuHigh").forEach { ScanSlider(s, it) }
                    val uo = s.labNumber("outputModel.noritsuUo").coerceIn(0f, 3f).toInt()
                    Dropdown("Таблица U/O", uo, listOf(0,1,2,3), { if (it == 0) "Выключена" else "Исходная таблица $it" }, { s.setLab("outputModel.noritsuUo", it) })
                    LabNote("U/O изменяет нижнюю часть кривой. Автоподбор кадра и экспозицию плёнки не переключает.")
                    TextButton(onClick = { s.clearScanValues(NORITSU_GRADATION_KEYS) }) { Text("Сбросить градацию Noritsu") }
                }
            }
            ScanGroup("noritsu-colour", "Цвет Noritsu", NORITSU_COLOUR_KEYS.any { s.scanValueChanged(it) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabNote(if(profileActive) "EV, CMY и RGB-множители правят результат после цветового тракта задания. Эти операторские поправки не меняют импортированные таблицы." else "RGB-множители меняют цвет готового позитива; CMY выше изменяет приёмник до тональной кривой. Поправки применяются последовательно.")
                    NORITSU_COLOUR_KEYS.forEach { ScanSlider(s, it) }
                    TextButton(onClick = { s.clearScanValues(NORITSU_COLOUR_KEYS) }) { Text("Сбросить цвет Noritsu") }
                }
            }
        } else if (NORITSU_CORRECTION_KEYS.any { s.scanValueChanged(it) }) {
            LabNote("Сохранены поправки Noritsu. Они применятся при выборе Noritsu с цветным негативом; текущий приёмник их не использует.")
        }
        if (mode == "lab-scan") ScanGroup("character", "Характер минилаба", s.scanValueChanged("look")) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                LabNote("Глубокий чёрный, прохладные нейтральные тени и характерные смещения оттенков. Ноль выключает эту отделку, сохраняя автоподбор и ручные поправки.")
                ScanSlider(s, "look")
            }
        }
        ScanGroup("detail", "Детализация", s.scanLensBlur != PARAM_DEFAULTS.scanLensBlur || s.scanUnsharpMask != PARAM_DEFAULTS.scanUnsharpMask) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                EnhancedSlider("Размытие сканера · px", s.scanLensBlur, 0f..20f, { s.scanLensBlur = it },
                    step = .05f, default = PARAM_DEFAULTS.scanLensBlur,
                    tooltip = "Оптическая мягкость после получения позитива. Не меняет размытие объектива камеры.")
                if(profileActive && s.labBoolean("outputModel.noritsuFilmSharp")) LabNote("Film Sharp включён: обычная нерезкая маска обходится. Её значения сохранены и вернутся при отключении Film Sharp.")
                else PairSlider("Нерезкая маска", s.scanUnsharpMask, 0f..5f, { s.scanUnsharpMask = it },
                    step = .05f, decimals = 2, componentLabels = "Радиус" to "Сила", default = PARAM_DEFAULTS.scanUnsharpMask,
                    tooltip = "Повышает локальную резкость готового скана. Сила 0 выключает эффект; разрешение изображения при этом не увеличивается.")
                TextButton(onClick = { s.scanLensBlur = PARAM_DEFAULTS.scanLensBlur; s.scanUnsharpMask = PARAM_DEFAULTS.scanUnsharpMask }) { Text("Сбросить детализацию") }
            }
        }
        if (noritsu) ScanGroup("noritsu-info", "О реконструкции Noritsu", false) {
            LabNote("FilmLUT и CommonCalcPara NEGA135 взяты из открытого noritsu-tool (MIT). Согласование с виртуальной плёнкой, нормализация и автоподбор — Spektrafilm Lab. Полный OEM-тракт и ICE не восстановлены; точное совпадение с физическим LS-600 не проверено. Таблицы предназначены для цветного негатива. Градация и U/O перенесены из make_nega_tone2 / make_gamma_curve2; RGB, гамма и насыщенность — из render.py того же проекта. Для операторской градации используется нейтральная кривая, а не калибровка аппаратного задания.")
        }
        LabNote("Нажмите число для точного ввода; двойное нажатие сбрасывает изменённое значение.")
        if (mode != "lab-scan" && (s.scanValueChanged("look") || (!noritsu && s.scanValueChanged("autoSetup"))))
            LabNote("Сохранены отдельные настройки Lab Scan. Они возобновятся при возврате в этот режим.")
        OutlinedButton(onClick = { s.resetScanCorrections() }, enabled = s.scanCorrectionsChanged(), modifier = Modifier.fillMaxWidth()) {
            Text("Сбросить поправки скана")
        }
        if(LocalQuietEditor.current&&workflow=="normal")NegativeWorkspaceControls(s)
        TextButton(onClick = { navigate(PhotoTool.FILE) }, modifier = Modifier.fillMaxWidth()) { Text("Перейти к сохранению") }
    }
}
