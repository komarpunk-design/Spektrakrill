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

internal val SCAN_RECEIVER_MODES = listOf("lab-scan", "digital", "auto-levels")
internal val SCAN_CORRECTION_DEFAULTS: Map<String, Any> = linkedMapOf(
    "autoSetup" to true, "look" to 1.0, "exposure" to 0.0,
    "cyan" to 0.0, "magenta" to 0.0, "yellow" to 0.0,
    "contrast" to 1.0, "blackPoint" to 0.0, "whitePoint" to 1.0,
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
    val value = labObject().valueAt("outputModel.$key") ?: return false
    val baseline = SCAN_CORRECTION_DEFAULTS.getValue(key)
    return if (value is Number && baseline is Number) abs(value.toDouble()-baseline.toDouble()) > 1e-7
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
    EnhancedSlider(
        label ?: row.getString("label"), s.labNumber("outputModel.$key").coerceIn(limits),
        limits,
        { s.setLab("outputModel.$key", if (abs(it-neutral) < step/100f) neutral else it) }, step = step,
        decimals = if (step < .01f) 3 else 2,
        tooltip = row.getString("help"), default = row.getDouble("default").toFloat(),
        modifier = Modifier.testTag("scan-control-$key"),
    )
}

@Composable
private fun ScanGroup(id: String, title: String, changed: Boolean, content: @Composable () -> Unit) {
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
    val automatic = s.labValue("outputModel.autoSetup") as? Boolean ?: true
    val reversal = StockCatalog.isReversalFilm(ctx, s.filmProfile) || stock?.optString("type") == "positive"
    val modes = listOf(
        "lab-scan" to "Lab Scan · характер минилаба",
        "digital" to "Digital Reference · фиксированный",
        "auto-levels" to "Auto Levels · автоподбор кадра",
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (mode !in SCAN_RECEIVER_MODES || reversal || workflow in listOf("negative-print", "negative-clear"))
            Text("Цифровой позитив без фотобумаги", style = MaterialTheme.typography.titleMedium)
        if (workflow in listOf("negative-print", "negative-clear")) {
            LabNote("Сейчас выбран другой маршрут настоящего негатива. Для цифрового позитива выберите «Настоящий негатив → скан» в его настройках. Текущие параметры сохраняются.")
            OutlinedButton(onClick = { navigate(PhotoTool.NEGATIVE) }) { Text("Открыть настоящий негатив") }
            return@Column
        }
        if (reversal) {
            LabNote("Выбран слайд: Lab Scan и его операторские поправки предназначены для инверсии негативной плёнки. Слайд просматривается напрямую через соседний «Спектральный скан».")
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
            return@Column
        }
        Dropdown("Режим сканирования", mode, modes.map { it.first }, { key -> modes.first { it.first == key }.second }, { s.chooseScanReceiver(it) })
        ScanSlider(s, "exposure", "Яркость скана · EV")
        if (mode == "lab-scan") {
            SwitchRow("Автоподбор кадра", automatic, { s.setLab("outputModel.autoSetup", it) },
                if (automatic) "Подбор плотности и контраста для каждого кадра. Выключите для серии."
                else "Фиксированный сканер для серии. Автоэкспозиция камеры настраивается независимо.")
        } else LabNote(if (mode == "digital") "Фиксированный нейтральный приёмник. Автоподбора и характера минилаба здесь нет; ручные поправки ниже работают."
            else "Автоподбор включён в этом режиме всегда. Для фиксированной серии выберите Digital Reference или выключите автоподбор в Lab Scan.")
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
                PairSlider("Нерезкая маска", s.scanUnsharpMask, 0f..5f, { s.scanUnsharpMask = it },
                    step = .05f, decimals = 2, componentLabels = "Радиус" to "Сила", default = PARAM_DEFAULTS.scanUnsharpMask,
                    tooltip = "Повышает локальную резкость готового скана. Сила 0 выключает эффект; разрешение изображения при этом не увеличивается.")
                TextButton(onClick = { s.scanLensBlur = PARAM_DEFAULTS.scanLensBlur; s.scanUnsharpMask = PARAM_DEFAULTS.scanUnsharpMask }) { Text("Сбросить детализацию") }
            }
        }
        LabNote("Нажмите число для точного ввода; двойное нажатие сбрасывает изменённое значение.")
        if (mode != "lab-scan" && (s.scanValueChanged("look") || s.scanValueChanged("autoSetup")))
            LabNote("Сохранены отдельные настройки Lab Scan. Они возобновятся при возврате в этот режим.")
        OutlinedButton(onClick = { s.resetScanCorrections() }, enabled = s.scanCorrectionsChanged(), modifier = Modifier.fillMaxWidth()) {
            Text("Сбросить поправки скана")
        }
        TextButton(onClick = { navigate(PhotoTool.FILE) }, modifier = Modifier.fillMaxWidth()) { Text("Перейти к сохранению") }
    }
}
