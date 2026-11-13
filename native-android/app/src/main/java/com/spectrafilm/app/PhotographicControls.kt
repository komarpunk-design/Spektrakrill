/* Native controls used by the 9.56 photographic navigation. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource

internal data class PhotoExportAction(val enabled:Boolean,val open:()->Unit)
internal val LocalPhotoExport=staticCompositionLocalOf{PhotoExportAction(false,{})}

@Composable internal fun PhotoProfileDefaults(s:ParamsState) {
    val ctx=LocalContext.current
    Text(StockCatalog.displayName(ctx,s.filmProfile),style=MaterialTheme.typography.titleMedium)
    LabNote("Исходные настройки зерна и DIR выбранного материала. Ручные параметры: Эффекты → Зерно и Проявка → DIR.")
    val available=LabCatalog.stock(s.filmProfile)!=null
    if(!available)LabNote("Для этого материала дополнительные RMS / Langmuir-пресеты не заданы. Ручные модели доступны в соответствующих инструментах.")
    OutlinedButton(enabled=available,onClick={s.applyLabStock(s.filmProfile,dir=false)}){Text("Восстановить зерно из профиля")}
    OutlinedButton(enabled=available,onClick={s.applyLabStock(s.filmProfile,grain=false)}){Text("Восстановить DIR из профиля")}
}

@Composable internal fun PhotoFileControls(options:ExportOptions,onChange:(ExportOptions)->Unit) {
    val ctx=LocalContext.current;val action=LocalPhotoExport.current
    Dropdown("Формат файла",options.format,ExportFormat.entries,{ctx.getString(it.labelRes)},{onChange(options.copy(format=it))})
    if(options.format==ExportFormat.JPEG||options.format==ExportFormat.ULTRA_HDR)
        IntSlider("Качество JPEG",options.jpegQuality,1..100,{onChange(options.copy(jpegQuality=it))},default=95)
    if(!options.format.isHighBitDepth()) {
        Dropdown("Размер файла",options.size,ExportSize.entries,{ctx.getString(it.labelRes)},{onChange(options.copy(size=it,customLongEdge=if(it==ExportSize.CUSTOM && options.customLongEdge !in ExportOptions.MIN_CUSTOM_EDGE..ExportOptions.MAX_CUSTOM_EDGE)4096 else options.customLongEdge))})
        if(options.size==ExportSize.CUSTOM && options.customLongEdge in ExportOptions.MIN_CUSTOM_EDGE..ExportOptions.MAX_CUSTOM_EDGE)IntSlider("Длинная сторона, пикс.",options.customLongEdge.coerceIn(ExportOptions.MIN_CUSTOM_EDGE,ExportOptions.MAX_CUSTOM_EDGE),ExportOptions.MIN_CUSTOM_EDGE..ExportOptions.MAX_CUSTOM_EDGE,{onChange(options.copy(customLongEdge=it))},default=4096)
        if(options.size==ExportSize.CUSTOM && options.customLongEdge !in ExportOptions.MIN_CUSTOM_EDGE..ExportOptions.MAX_CUSTOM_EDGE) {
            LabNote("Длина стороны не задана: сохранится полный размер.")
            OutlinedButton(onClick={onChange(options.copy(customLongEdge=4096))}){Text("Задать длинную сторону · 4096 пикс.")}
        }
    } else LabNote("Этот формат сохраняет полный размер и разрядность исходного расчёта. Рамка и уменьшение не применяются.")
    OutlinedTextField(options.customName,{onChange(options.copy(customName=it))},label={Text("Имя файла")},singleLine=true,modifier=Modifier.fillMaxWidth())
    LabNote("Сохранение, метаданные, резкость экспорта, пакетная обработка и варианты файла доступны в исходной панели экспорта приложения.")
    Button(enabled=action.enabled,onClick=action.open,modifier=Modifier.fillMaxWidth()){Text("Открыть сохранение")}
    if(!action.enabled)LabNote("Дождитесь загрузки фотографии и окончания текущего экспорта.")
}

internal fun PhotoTool.bypassReason(s:ParamsState):String? {
    val negative=s.labString("workflow","normal")!="normal"
    if(negative&&this in listOf(PhotoTool.EXPOSURE,PhotoTool.PREP,PhotoTool.LENS,PhotoTool.FILTER,PhotoTool.DEVELOP,PhotoTool.CHEMISTRY,PhotoTool.DIR,PhotoTool.GRAIN,PhotoTool.HALATION))
        return "Сейчас конвертируется настоящий негатив: съёмочные эффекты и виртуальная проявка обходятся. Настройки сохраняются для обычной фотографии."
    if(negative&&this==PhotoTool.OUTPUT)return "Для настоящего негатива маршрут выбирается в Скан → Настоящий негатив. Этот выбор вывода относится к эмуляции плёнки."
    if(s.labScanFilm()&&this in listOf(PhotoTool.PAPER,PhotoTool.PAPER_BASE,PhotoTool.TEST_PRINT))
        return "Фотобумага обходится выбранным цифровым маршрутом. Выберите фотобумагу в Печать → Вывод или печать настоящего негатива в Скан."
    return null
}
