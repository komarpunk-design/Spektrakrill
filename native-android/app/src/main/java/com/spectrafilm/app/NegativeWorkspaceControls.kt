/* Project-owned virtual-negative workstation. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Available beside the image even when a different processing stage is open. */
@Composable
internal fun NegativeCanvasToolbar(s: ParamsState, onOpenScans: () -> Unit) {
    if(s.negativeWorkspaceJson.isBlank() || s.labString("workflow", "normal") != "normal") return
    if(s.labString("outputModel.mode") !in SCAN_RECEIVER_MODES + "negative") return
    if(StockCatalog.isReversalFilm(LocalContext.current, s.filmProfile) || LabCatalog.stock(s.filmProfile)?.optString("type") == "positive") return
    val negative = s.labString("outputModel.mode") == "negative"
    val work = s.negativeWorkspace()
    val variants = work.getJSONArray("variants")
    val name = variants.getJSONObject(work.getInt("active")).getString("name")
    var menu by remember { mutableStateOf(false) }
    FlowRow(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(negative, { s.showVirtualNegative(true) }, label = { Text("Негатив") }, modifier = Modifier.testTag("canvas-negative"))
        FilterChip(!negative, { s.showVirtualNegative(false) }, label = { Text("Скан") }, modifier = Modifier.testTag("canvas-positive"))
        Box {
            TextButton(onClick = { menu = true }, modifier = Modifier.testTag("canvas-scan-variants")) {
                Text("$name ▾", maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                for(i in 0 until variants.length()) DropdownMenuItem(
                    text = { Text(variants.getJSONObject(i).getString("name")) },
                    onClick = { s.selectScanVariant(i); menu = false }, modifier = Modifier.testTag("canvas-variant-$i"))
                if(variants.length() < MAX_SCAN_VARIANTS) DropdownMenuItem(
                    text = { Text("Создать копию скана") }, onClick = { s.addScanVariant(); menu = false; onOpenScans() })
                HorizontalDivider()
                DropdownMenuItem(text = { Text("Настройки скана") }, onClick = { menu = false; onOpenScans() })
            }
        }
    }
}

@Composable
internal fun NegativeWorkspaceControls(s: ParamsState) {
    val work = s.negativeWorkspace()
    if(work.length() == 0) {
        OutlinedButton(onClick = { s.startNegativeWorkspace() }, modifier = Modifier.fillMaxWidth().testTag("negative-start")) {
            Text("Работать с виртуальным негативом")
        }
        LabNote("Сравнивайте сканы одного негатива без сохранения и повторного импорта фотографии.")
        return
    }
    val frozen = s.negativeIsFrozen()
    var expanded by rememberSaveable(work.getString("id")) { mutableStateOf(!frozen) }
    LaunchedEffect(frozen, work.optBoolean("locked")) {
        if(frozen) expanded = false else if(work.optBoolean("locked")) expanded = true
    }
    CompositionLocalProvider(LocalFlatSections provides false) {
        SectionCard("Виртуальный негатив" + if(frozen) " · зафиксирован" else "", expanded, { expanded = !expanded },
            modifier = Modifier.testTag("negative-admin")) {
            NegativeWorkspaceDetails(s)
        }
    }
}

@Composable
private fun NegativeWorkspaceDetails(s: ParamsState) {
    val work = s.negativeWorkspace()
    val negative = s.labString("outputModel.mode") == "negative"
    val frozen = s.negativeIsFrozen()
    val navigate = LocalPhotoNavigate.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = negative, onClick = { s.showVirtualNegative(true) },
            label = { Text("Негатив") }, modifier = Modifier.weight(1f).testTag("negative-view"))
        FilterChip(selected = !negative, onClick = { s.showVirtualNegative(false) },
            label = { Text("Готовый скан") }, modifier = Modifier.weight(1f).testTag("negative-positive"))
    }
    LabNote(if(frozen) "Проявка зафиксирована. Меняйте сканер и его поправки: исходник, плёнка и съёмочные эффекты защищены. Плотности сохраняются внутри приложения по мере расчёта."
        else if(work.optBoolean("locked")) "Исходник или настройки плёнки изменились. Старая фиксация не применяется; зафиксируйте проявку заново."
        else "Плёнку и проявку можно менять. Все варианты используют их общие настройки; каждый скан хранит собственные тон, цвет и детализацию.")
    OutlinedButton(onClick = { if(frozen) s.unlockNegative() else s.freezeNegative() },
        enabled = frozen || s.negativeSourceKey != null,
        modifier = Modifier.fillMaxWidth().testTag("negative-freeze")) {
        Text(if(frozen) "Вернуться к проявке" else "Зафиксировать проявку")
    }
    if(!frozen) TextButton(onClick = { navigate(PhotoTool.DEVELOP) }) { Text("Открыть проявку") }
    Text("Варианты сканирования", style = MaterialTheme.typography.titleSmall)
    LabNote("Поправки сканера — свои у каждого варианта. Настройки раздела «Финиш» — общие.")
    val variants = work.getJSONArray("variants")
    val active = work.getInt("active")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for(i in 0 until variants.length()) FilterChip(selected = !negative && i == active,
            onClick = { s.selectScanVariant(i) },
            label = { Text(variants.getJSONObject(i).getString("name")) },
            modifier = Modifier.testTag("negative-variant-$i"))
        if(variants.length() < MAX_SCAN_VARIANTS) SuggestionChip(onClick = { s.addScanVariant() },
            label = { Text("+ Копия") }, modifier = Modifier.testTag("negative-add-variant"))
    }
    var rename by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var delete by remember { mutableStateOf(false) }
    var storageInfo by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var storageSummary by remember { mutableStateOf("") }
    var clearing by remember { mutableStateOf(false) }
    LaunchedEffect(storageInfo) {
        if(storageInfo) {
            val bytes = withContext(Dispatchers.IO) { negativeDensityBytes(negativeDensityDirectory(context)) }
            storageSummary = "Кэш плотностей всех проектов: ${bytes / (1024 * 1024)} МиБ."
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { name = variants.getJSONObject(active).getString("name"); rename = true }) { Text("Назвать вариант") }
        if(variants.length() > 1) TextButton(onClick = { delete = true }) { Text("Удалить вариант") }
    }
    TextButton(onClick = { storageInfo = true }) { Text("Как сохраняется негатив") }
    if(storageInfo) AlertDialog(onDismissRequest = { storageInfo = false },
        title = { Text("Сохранение негатива") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Проявка и варианты сохраняются вместе с обработкой фотографии. Плотности красителей хранятся без перевода в JPEG. Предпросмотр и полный размер рассчитываются отдельно; полный размер сохраняется после его расчёта, например при экспорте.\n\nСохраняйте исходник: он нужен для открытия проекта и восстановления плотностей. JSON-рецепт содержит настройки, но не пиксели негатива. При нехватке места обработка продолжается без сохранения плотностей.")
            Text(storageSummary)
            TextButton(enabled = !clearing, onClick = {
                clearing = true
                scope.launch {
                    val failures = withContext(Dispatchers.IO) { clearNegativeDensityCache(negativeDensityDirectory(context)) }
                    storageSummary = if(failures == 0) "Кэш очищен. Настройки и исходники сохранены; плотности будут рассчитаны заново."
                        else "Не удалось удалить файлов: $failures. Настройки и исходники сохранены."
                    clearing = false
                }
            }) { Text(if(clearing) "Очистка…" else "Очистить кэш плотностей всех проектов") }
        } },
        confirmButton = { TextButton(onClick = { storageInfo = false }) { Text("Понятно") } })
    if(rename) AlertDialog(onDismissRequest = { rename = false }, title = { Text("Название скана") },
        text = { OutlinedTextField(value = name, onValueChange = { if(it.length <= 40) name = it },
            singleLine = true, label = { Text("Название") }) },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { s.renameScanVariant(name); rename = false }) { Text("Сохранить") } },
        dismissButton = { TextButton(onClick = { rename = false }) { Text("Отмена") } })
    if(delete) AlertDialog(onDismissRequest = { delete = false }, title = { Text("Удалить вариант скана?") },
        text = { Text("Негатив и остальные варианты сохранятся. Действие можно отменить через историю.") },
        confirmButton = { TextButton(onClick = { s.deleteScanVariant(); delete = false }) { Text("Удалить") } },
        dismissButton = { TextButton(onClick = { delete = false }) { Text("Отмена") } })
    HorizontalDivider()
}
