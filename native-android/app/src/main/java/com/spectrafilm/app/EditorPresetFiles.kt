/*
 * Spektrafilm for Android — the editor's preset and LUT file launchers. GPLv3.
 * Film modeling powered by spektrafilm (GPLv3).
 */
package com.spectrafilm.app

import android.content.Context
import android.net.Uri
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import android.provider.OpenableColumns
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.withContext

/** The four document launchers [rememberEditorPresetFiles] registers. */
internal class EditorPresetFiles(
    val presetImporter: ManagedActivityResultLauncher<Array<String>, Uri?>,
    val presetExporter: ManagedActivityResultLauncher<String, Uri?>,
    val savedPresetExporter: ManagedActivityResultLauncher<String, Uri?>,
    val lutExporter: ManagedActivityResultLauncher<String, Uri?>,
    val importText:(String)->Unit,
)

/**
 * Preset import, live-state and saved-preset export, and the baked LUT's save. Split out of
 * [EditorScreen] (#273). [pendingPresetExportState] and [pendingLutTextState] are the editor's:
 * the panel sets them just before launching the matching exporter.
 */
@Composable
internal fun rememberEditorPresetFiles(
    ctx: Context,
    scope: CoroutineScope,
    dispatchers: AppDispatchers,
    state: ParamsState,
    presetRepo: PresetRepository,
    pendingPresetExportState: MutableState<String?>,
    pendingLutTextState: MutableState<String?>,
    presetVm:PresetViewModel,
    onImported: (List<String>) -> Unit,
    setStatus: (String) -> Unit,
): EditorPresetFiles {
    var pendingLutText by pendingLutTextState
    var importing by remember { mutableStateOf(false) }
    fun startImport(load:suspend ()->Pair<String,String>) {
        if(importing)return
        importing=true;presetVm.onAction(PresetAction.ImportStatus(true,"Читаю и проверяю JSON…"))
        scope.launch {
            try {
                val (names,notes)=withContext(dispatchers.io) {
                    val (text,fileName)=load()
                    val entries=PresetImports.parse(text,fileName)
                    PresetImports.store(presetRepo,entries) to entries.map{it.note}.filter{it.isNotBlank()}.distinct()
                }
                onImported(names)
                val message="Добавлено в Мои: ${names.size}. Нажмите карточку, чтобы применить."+notes.take(2).joinToString(" ",prefix=if(notes.isEmpty())""else" ")+(if(notes.size>2)" Полные особенности сохранены в JSON каждого рецепта."else"")
                presetVm.onAction(PresetAction.ImportStatus(false,message));setStatus(message)
            }catch(e:CancellationException){throw e}
            catch(e:Exception){
                val message="Не удалось импортировать JSON: ${e.message?:"ошибка чтения файла"}"
                presetVm.onAction(PresetAction.ImportStatus(false,message));setStatus(message)
            }finally{importing=false;if(presetVm.current.importing)presetVm.onAction(PresetAction.ImportStatus(false,"Импорт прерван"))}
        }
    }
    val presetImporter = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if(uri!=null)startImport {
            val name=runCatching {
                ctx.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())c.getString(0)else""}
            }.getOrNull().orEmpty().take(256)
            presetRepo.readImport(uri) to name
        }
    }
    val presetExporter = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri != null) {
            scope.launch {
                // Serialize on main (live Compose-state read); write off-main.
                val json = runCatching { Presets.toJsonString(state) }.getOrNull()
                if (json == null) { setStatus(ctx.getString(R.string.editor_status_preset_export_failed)); return@launch }
                val r = withContext(dispatchers.io) { runCatching { presetRepo.exportJson(uri, json) } }
                r.onSuccess { setStatus(ctx.getString(R.string.editor_status_preset_exported)) }
                    .onFailure { setStatus(ctx.getString(R.string.editor_status_preset_export_failed_reason, it.message)) }
            }
        }
    }
    // Exports the SELECTED SAVED preset, byte-for-byte as stored. Distinct from
    // [presetExporter] above, which serialises live editor state — that one sat under
    // the saved-preset dropdown and looked like it exported the selection.
    var pendingPresetExport by pendingPresetExportState
    val savedPresetExporter = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val name = pendingPresetExport
        pendingPresetExport = null
        if (uri != null && name != null) {
            scope.launch {
                val r = withContext(dispatchers.io) {
                    runCatching { presetRepo.exportJson(uri, presetRepo.read(name)) }
                }
                r.onSuccess { setStatus(ctx.getString(R.string.editor_status_preset_exported)) }
                    .onFailure {
                        setStatus(
                            ctx.getString(R.string.editor_status_preset_export_failed_reason, it.message),
                        )
                    }
            }
        }
    }
    val lutExporter = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("*/*")
    ) { uri ->
        val text = pendingLutText
        if (uri != null && text != null) {
            scope.launch {
                // SAF write off-main; status (Compose state) lands back on main.
                val r = withContext(dispatchers.io) { runCatching { saveTextToUri(ctx, uri, text) } }
                r.onSuccess { setStatus(ctx.getString(R.string.editor_status_lut_saved)) }
                    .onFailure { setStatus(ctx.getString(R.string.editor_status_lut_save_failed, it.message)) }
            }
        }
        pendingLutText = null
    }
    return EditorPresetFiles(presetImporter, presetExporter, savedPresetExporter, lutExporter, importText={text->startImport{text to ""}})
}
