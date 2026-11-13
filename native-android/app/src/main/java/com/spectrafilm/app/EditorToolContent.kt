/*
 * Spektrafilm for Android — one editor tool's controls: the per-category dispatch to every
 * section and panel. GPLv3. Film modeling powered by spektrafilm.
 *
 * Moved verbatim out of EditorScreen's layout (#273), where it was the toolContent lambda.
 */
package com.spectrafilm.app

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import com.spectrafilm.engine.SpektraEngine
import kotlinx.coroutines.CoroutineScope

@Composable
internal fun ColumnScope.EditorToolContent(
    screen: EditorScreenState,
    tool: Category,
    ctx: Context,
    scope: CoroutineScope,
    dispatchers: AppDispatchers,
    settings: AppSettings,
    session: EditorSession,
    toolVm: EditorToolViewModel,
    toolUi: EditorToolUiState,
    viewerVm: EditorViewerViewModel,
    viewerUi: EditorViewerUiState,
    presetVm: PresetViewModel,
    versionsVm: VersionsViewModel,
    filmPreviewVm: StockPreviewViewModel,
    printPreviewVm: StockPreviewViewModel,
    isRawSource: Boolean,
    preview: Bitmap?,
    previewBusy: Boolean,
    interacting: State<Boolean>,
    photoDateStamp: String?,
    filmGroups: List<DropdownGroup>,
    printGroups: List<DropdownGroup>,
    onOpenFilmCurves: (id: String, name: String) -> Unit,
    onOpenPrintCurves: (id: String, name: String) -> Unit,
    stockPreviewHost: (vm: StockPreviewViewModel, forFilm: Boolean) -> StockPreviewHost,
    presetPreviewHost: () -> StockPreviewHost?,
    checkpointEditorSession: () -> Boolean,
    sourceUri: Uri?,
    presetRepo: PresetRepository,
    recipeKey: String?,
    builtInGroups: Map<String, List<BuiltInPreset>>,
    presetUi: PresetUiState,
    presetImporter: ManagedActivityResultLauncher<Array<String>, Uri?>,
    importPresetText:(String)->Unit,
    presetExporter: ManagedActivityResultLauncher<String, Uri?>,
    savedPresetExporter: ManagedActivityResultLauncher<String, Uri?>,
    lutExporter: ManagedActivityResultLauncher<String, Uri?>,
    statusState: MutableState<String>,
    engineState: State<SpektraEngine?>,
    applyWithAmount: (baseOverride: String?, apply: () -> Unit) -> Unit,
    previousEdit: PreviousEdit?,
    applyPreviousEdit: (PreviousEdit) -> Unit,
    sourceRuntime: SourceAccessRuntime,
    recipeRepo: RecipeRepository,
    recipeEditEpoch: RecipeEditEpoch,
    photoPicker: ManagedActivityResultLauncher<PickVisualMediaRequest, Uri?>,
    rawPicker: ManagedActivityResultLauncher<Array<String>, Uri?>,
    recipeAccessState: MutableState<EditorRecipeAccess>,
    profilesState: State<List<String>>,
    retireSourceResources: () -> Unit,
    resetEditorCursorForSourceChange: () -> Unit,
    reconcileVisibleSourceAfterFailure: (SourceRestoreResult?) -> Unit,
    exportOptions: ExportOptions,
    onExportOptionsChange: (ExportOptions) -> Unit,
    /** The frame caption as worded for this photo (null: none, or nothing to word it with). */
    frameCaption: String? = null,
) {
    val snackbarHost = screen.snackbarHost
    val presetListState = screen.presetListState
    val presetBaselineJsonState = screen.presetBaselineJsonState
    val lastBuiltInOutputState = screen.lastBuiltInOutputState
    val lastBuiltInIdState = screen.lastBuiltInIdState
    val bakingLutState = screen.bakingLutState
    val pendingLutTextState = screen.pendingLutTextState
    val pendingPresetExportState = screen.pendingPresetExportState
    val previewTickState = screen.previewTickState
    val hasRecipeState = screen.hasRecipeState
    val state = session.params
    val page = LocalPhotoTool.current
    when(page) {
        PhotoTool.PREP -> { LabNote("Подготовка до виртуальной плёнки. Эта экспозиция не компенсируется при печати."); LabGroup(state,"prep"); return }
        PhotoTool.PROFILE -> { PhotoProfileDefaults(state); return }
        PhotoTool.OUTPUT -> { LabOutputSection(state); return }
        PhotoTool.PAPER_BASE -> { LabPaperBase(state); return }
        PhotoTool.DEVELOP -> {
            LabNote("Экспозиция при съёмке и проявка — разные действия. Поправка света задаётся в Камера → Экспозиция; γ ниже меняет характеристическую кривую. Push: недодержка и усиленная проявка, Pull: передержка и более мягкая проявка.")
            LabTimeFamily(state); ExperimentalSection(state,print=false); return
        }
        PhotoTool.FILTER, PhotoTool.FILM_BASE, PhotoTool.CHEMISTRY, PhotoTool.NEGATIVE, PhotoTool.TEST_PRINT -> {
            LabAdvancedSection(state,sourceUri,isRawSource,when(page){PhotoTool.FILTER->"filter";else->page.id}); return
        }
        PhotoTool.FILE -> { PhotoFileControls(exportOptions,onExportOptionsChange); return }
        else -> Unit
    }
    val rotationState = session.rotation
    val editHistory = session.history
    val sourceState = session.source
    val committedSnapshotState = session.committedSnapshot
    val restoringState = session.restoring
    val simPart: SimPart? = when (tool) {
        Category.SIMULATION -> SimPart.FILM_STOCK
        Category.PAPER -> SimPart.PAPER
        Category.EXPOSURE -> SimPart.EXPOSURE
        Category.SCENE_LATITUDE -> SimPart.SCENE_LATITUDE
        Category.SAT_VIB -> SimPart.SAT_VIB
        Category.PRINT_COLOR -> SimPart.PRINT_COLOR
        Category.FILM_FORMAT -> SimPart.FILM_FORMAT
        Category.CAMERA_DIFFUSION -> SimPart.CAMERA_DIFFUSION
        Category.PRINT_EXPOSURE -> SimPart.PRINT_EXPOSURE
        Category.ENLARGER -> SimPart.ENLARGER
        Category.LENS_BLUR -> SimPart.LENS_BLUR
        Category.DATE_STAMP -> SimPart.DATE_STAMP
        Category.SCANNER -> SimPart.SCANNER
        Category.OUTPUT -> SimPart.OUTPUT
        else -> null
    }
    when (tool) {
        Category.INPUT -> {
            if(page==PhotoTool.SPECTRUM)LabAdvancedSection(state,sourceUri,isRawSource,"spectrum")
            InputSection(state, onEditCrop = { toolVm.onAction(EditorToolAction.OpenCrop) }, part=when(page){
                PhotoTool.INPUT_COLOR->InputPart.COLOR;PhotoTool.SPECTRUM->InputPart.SPECTRUM
                PhotoTool.LENS->InputPart.LENS;PhotoTool.OUTPUT_COLOR->InputPart.SIZE;else->InputPart.ALL
            })
            if(page==PhotoTool.INPUT_COLOR)Dropdown("Входной гамут",state.inputGamutCompress,com.spectrafilm.engine.InputGamutCompress.entries,{it.name},{state.inputGamutCompress=it})
        }
        Category.RAW_WB -> ImportRawSection(state, isRaw = isRawSource,
            onPickNeutral = { toolVm.onAction(EditorToolAction.PickNeutral) })
        Category.RAW_CLEANUP -> RawCleanupSection(state)
        Category.SIMULATION, Category.PAPER, Category.EXPOSURE, Category.SCENE_LATITUDE,
        Category.SAT_VIB, Category.PRINT_COLOR, Category.FILM_FORMAT,
        Category.CAMERA_DIFFUSION, Category.PRINT_EXPOSURE, Category.ENLARGER,
        Category.LENS_BLUR, Category.DATE_STAMP, Category.SCANNER,
        Category.OUTPUT -> { EditorSimulationPanel(
            filmPreviewVm = filmPreviewVm,
            printPreviewVm = printPreviewVm,
            part = simPart ?: SimPart.FILM_STOCK,
            ctx = ctx,
            scope = scope,
            state = state,
            snackbarHost = snackbarHost,
            photoDateStamp = photoDateStamp,
            filmGroups = filmGroups,
            printGroups = printGroups,
            onOpenFilmCurves = onOpenFilmCurves,
            onOpenPrintCurves = onOpenPrintCurves,
            stockPreviewHost = stockPreviewHost,
            checkpointEditorSession = checkpointEditorSession,
            sourceKey = sourceUri,
            // A slider drag runs draft renders without setting previewBusy,
            // so the strip also waits for the drag to end.
            previewBusy = previewBusy || interacting.value,
        )
            when(tool) {
                Category.SIMULATION -> LabProfileImport(state)
                Category.EXPOSURE -> if(page==null) { LabNote("Prep · подготовка исходника до плёнки. Экспозиция подготовки не компенсируется печатью."); LabGroup(state,"prep") }
                Category.FILM_FORMAT -> LabFilmFormat(state)
                Category.SCANNER -> if(page==null) LabOutputSection(state)
                Category.PAPER -> if(page==null) LabPaperBase(state)
                else -> Unit
            }
        }
        Category.GRAIN -> {
            LabChoice(state,"grainRms","Модель зерна",listOf("false" to "Spektrafilm","true" to "RMS · Experimental / Negs"),"false")
            if(state.labBoolean("grainRms"))LabGrainSection(state) else GrainSection(state)
        }
        Category.PREFLASH -> PreflashSection(state)
        Category.CONTRAST_MASK -> ContrastMaskSection(state)
        Category.HALATION -> {
            LabChoice(state,"layeredTransport.model","Модель галяции",listOf("legacy" to "Spektrafilm","layered" to "Layered Transport"),"legacy")
            if(state.labString("layeredTransport.model","legacy")=="layered")LabHalationSection(state) else HalationSection(state)
        }
        Category.COUPLERS -> {
            LabChoice(state,"dirLangmuir","Модель DIR",listOf("false" to "Классическая","true" to "Langmuir"),"false")
            CouplersSection(state)
            if(state.labBoolean("dirLangmuir")){LabGroup(state,"dir"); androidx.compose.material3.TextButton(onClick={state.applyLabStock(state.filmProfile,grain=false)}) { androidx.compose.material3.Text("Восстановить DIR из профиля") }}
        }
        Category.GLARE -> GlareSection(state)
        Category.EXPERIMENTAL -> if(page==PhotoTool.PAPER) ExperimentalSection(state,film=false) else { ExperimentalSection(state);LabAdvancedSection(state,sourceUri,isRawSource) }
        Category.TONE_CURVE -> ToneCurveSection(state, preview)
        Category.MASKS -> MasksSection(
            state,
            selectedIndex = toolUi.maskIndex,
            onSelectedIndexChange = { toolVm.onAction(EditorToolAction.SelectMask(it)) },
            onEditOnPhoto = { idx ->
                toolVm.onAction(EditorToolAction.EditMaskOnPhoto(idx))
            },
            onSampleColor = { idx ->
                toolVm.onAction(EditorToolAction.SampleMask(idx, luminance = false))
            },
            onSampleLuminance = { idx ->
                toolVm.onAction(EditorToolAction.SampleMask(idx, luminance = true))
            },
        )
        Category.DISPLAY -> DisplaySection(state)
        Category.FRAME -> { LabLegacyFrame(state,exportOptions,onExportOptionsChange); FrameControls(
            spec = exportOptions.frameSpec,
            onChange = { onExportOptionsChange(exportOptions.withFrame(it)) },
            preview = preview,
            frameless = exportOptions.effectiveFrame().isNone && !exportOptions.frameSpec.isNone,
            caption = frameCaption,
            captionKnown = preview != null,
        )
        }
        Category.PRESETS -> EditorPresetPanel(
            dispatchers = dispatchers,
            presetVm = presetVm,
            versionsVm = versionsVm,
            ctx = ctx,
            scope = scope,
            state = state,
            presetRepo = presetRepo,
            snackbarHost = snackbarHost,
            recipeKey = recipeKey,
            builtInGroups = builtInGroups,
            presetUi = presetUi,
            presetImporter = presetImporter,
            importPresetText = importPresetText,
            presetExporter = presetExporter,
            savedPresetExporter = savedPresetExporter,
            lutExporter = lutExporter,
            presetListState = presetListState,
            presetBaselineJsonState = presetBaselineJsonState,
            lastBuiltInOutputState = lastBuiltInOutputState,
            lastBuiltInIdState = lastBuiltInIdState,
            presetPreviewHost = presetPreviewHost(),
            stripSourceKey = sourceUri,
            stripPaused = previewBusy || interacting.value,
            bakingLutState = bakingLutState,
            pendingLutTextState = pendingLutTextState,
            pendingPresetExportState = pendingPresetExportState,
            rotationState = rotationState,
            statusState = statusState,
            previewTickState = previewTickState,
            engineState = engineState,
            applyWithAmountFn = applyWithAmount,
            previousEdit = previousEdit,
            onApplyPrevious = { previousEdit?.let { applyPreviousEdit(it) } },
        )
        Category.SOURCE -> EditorSourcePanel(
            onToggleHistogram = { viewerVm.onAction(EditorViewerAction.ToggleHistogram) },
            onClearPresetAmount = { presetVm.onAction(PresetAction.ClearAmount) },
            ctx = ctx,
            scope = scope,
            state = state,
            settings = settings,
            snackbarHost = snackbarHost,
            sourceRuntime = sourceRuntime,
            recipeRepo = recipeRepo,
            recipeKey = recipeKey,
            recipeEditEpoch = recipeEditEpoch,
            editHistory = editHistory,
            photoPicker = photoPicker,
            rawPicker = rawPicker,
            showHistogram = viewerUi.histogram,
            sourceState = sourceState,
            showDemoSource = {
                session.showDemo(ctx.getString(R.string.editor_source_demo_name))
            },
            statusState = statusState,
            previewTickState = previewTickState,
            rotationState = rotationState,
            hasRecipeState = hasRecipeState,
            recipeAccessState = recipeAccessState,
            committedSnapshotState = committedSnapshotState,
            restoringState = restoringState,
            profilesState = profilesState,
            checkpointEditorSessionFn = checkpointEditorSession,
            retireSourceResourcesFn = retireSourceResources,
            resetEditorCursorForSourceChangeFn = resetEditorCursorForSourceChange,
            reconcileVisibleSourceAfterFailureFn = reconcileVisibleSourceAfterFailure,
        )
    }
}
