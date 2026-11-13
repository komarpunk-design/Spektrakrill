/*
 * Spektrafilm for Android. GPLv3.
 * Film modeling powered by spektrafilm (GPLv3).
 *
 * Preset, source and export panels (#273, third MainActivity split). Stateless over their
 * parameters; moved verbatim out of MainActivity.
 */
package com.spectrafilm.app

import android.graphics.Bitmap
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Panels that wrap existing functionality (preset/source) for the new layout
// ---------------------------------------------------------------------------

@Composable
internal fun PresetUtilities(
    onCopySettings: () -> Unit,
    canPasteSettings: Boolean,
    onPasteSettings: () -> Unit,
    previousEditName: String?,
    onApplyPrevious: () -> Unit,
    onExportLut: (size: Int, clf: Boolean) -> Unit,
    bakingLut: Boolean,
    versionsContent: @Composable () -> Unit = {},
) {
    // Copy the current edit and paste it onto another image (session clipboard).
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onCopySettings, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.editor_preset_copy_settings)) }
        OutlinedButton(
            onClick = onPasteSettings,
            enabled = canPasteSettings,
            modifier = Modifier.weight(1f),
        ) { Text(stringResource(R.string.editor_preset_paste_settings)) }
    }
    // The previous photo's look without a Copy first: the same whole-look replace as Paste.
    OutlinedButton(
        onClick = onApplyPrevious,
        enabled = previousEditName != null,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.editor_preset_apply_previous)) }
    Text(
        if (previousEditName != null) stringResource(R.string.editor_preset_previous_from, previousEditName)
        else stringResource(R.string.editor_preset_previous_none),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    Divider()
    versionsContent()
    Divider()
    var lutSize by remember { mutableIntStateOf(33) }
    var lutClf by remember { mutableStateOf(false) }
    Text(stringResource(R.string.editor_lut_size), style = MaterialTheme.typography.bodySmall)
    ConnectedChoiceRow(
        options = listOf(17, 33, 65).map { it to "$it³" },
        selected = lutSize,
        onSelect = { lutSize = it },
    )
    Text(stringResource(R.string.editor_lut_format), style = MaterialTheme.typography.bodySmall)
    ConnectedChoiceRow(
        options = listOf(false to ".cube", true to ".clf"),
        selected = lutClf,
        onSelect = { lutClf = it },
    )
    FilledTonalButton(
        onClick = { onExportLut(lutSize, lutClf) },
        enabled = !bakingLut,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (bakingLut) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp), strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.editor_lut_baking))
        } else {
            Text(stringResource(R.string.editor_lut_export, if (lutClf) ".clf" else ".cube", lutSize))
        }
    }
    Text(
        stringResource(R.string.editor_lut_explainer),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
internal fun SourcePanel(
    sourceName: String,
    status: String,
    showHistogram: Boolean,
    onToggleHistogram: () -> Unit,
    hasRecipe: Boolean,
    needsAuthorization: Boolean,
    onReauthorize: () -> Unit,
    onPickPhoto: () -> Unit,
    onOpenRaw: () -> Unit,
    onUseDemo: () -> Unit,
    onResetEdits: () -> Unit,
) {
    Text(stringResource(R.string.editor_source_label, sourceName), style = MaterialTheme.typography.bodySmall)
    Text(status, style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    if (needsAuthorization) {
        Button(onClick = onReauthorize, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.editor_source_choose_again))
        }
        Text(
            stringResource(R.string.editor_source_permission_expired),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = onPickPhoto, modifier = Modifier.weight(1f)) {
            ButtonIcon(SpectraIcons.OpenPhoto)
            Text(stringResource(R.string.editor_source_pick_photo))
        }
        // Tonal beside the filled Pick photo: two filled buttons side by side read as two
        // equal primaries.
        FilledTonalButton(onClick = onOpenRaw, modifier = Modifier.weight(1f)) {
            ButtonIcon(SpectraIcons.ImportRaw)
            Text(stringResource(R.string.editor_source_open_raw))
        }
    }
    OutlinedButton(onClick = onUseDemo, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.editor_source_use_demo)) }

    FilterChip(
        selected = showHistogram,
        onClick = onToggleHistogram,
        label = { Text(stringResource(R.string.editor_histogram)) },
    )
    Text(
        stringResource(R.string.editor_source_histogram_help),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    if (hasRecipe) {
        // The one editor action with no way back: onResetEdits clears the undo history
        // along with the edits, so a mis-tap here cannot be walked back the way every
        // other destructive thing in this screen can. Hence a dialog rather than the
        // Undo snackbar used for preset deletion.
        var confirmReset by remember { mutableStateOf(false) }
        Text(
            stringResource(R.string.editor_source_autosaved),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(
            onClick = { confirmReset = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.editor_source_reset_edits))
        }
        if (confirmReset) {
            AlertDialog(
                onDismissRequest = { confirmReset = false },
                title = { Text(stringResource(R.string.editor_reset_edits_confirm_title)) },
                text = { Text(stringResource(R.string.editor_reset_edits_confirm_body)) },
                confirmButton = {
                    TextButton(
                        onClick = { confirmReset = false; onResetEdits() },
                    ) {
                        Text(stringResource(R.string.editor_source_reset_edits))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { confirmReset = false }) {
                        Text(stringResource(R.string.editor_cancel))
                    }
                },
            )
        }
    }
    Text(
        stringResource(R.string.editor_source_tip),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
        "Film modeling powered by spektrafilm (GPLv3). Preview is downscaled for " +
            "interactivity; export renders at full resolution.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * The full-screen render mask. Rendering really is modal: the export reads the live edit
 * state, so this swallows every pointer event until it finishes or is cancelled. The result
 * is NOT shown here: the editor announces it with a Snackbar and the pill's check, and the
 * editor stays usable.
 */
@Composable
internal fun ExportMask(onCancel: () -> Unit, photo: Bitmap? = null) {
    // This overlay swallows every pointer event, so Back is the only system gesture that
    // can reach anything while it is up. Without a handler of its own it would fall
    // through to the editor root, where Back leaves the app -- so a stray Back during a
    // render could send the app away mid-export. Inert while rendering, because Cancel is
    // a deliberate press and not a reflex.
    BackHandler(enabled = true) { }
    // API 33+: the photo develops in a darkroom tray while the export runs (ExportDevelopTray.kt).
    // Null below 33, with animations off or without a preview: the plain scrim and indicator.
    val tray = rememberDevelopTray(photo)
    val darkroom = tray != null
    Box(
        Modifier
            .fillMaxSize()
            .background(if (darkroom) SpektraBrand.darkroomScrim else MaterialTheme.colorScheme.surface.copy(alpha = 0.94f))
            .pointerInput(Unit) {
                awaitPointerEventScope { while (true) awaitPointerEvent() }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (tray != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            DevelopTrayImage(
                tray,
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 144.dp),
            )
        }
        Column(
            Modifier
                .then(if (darkroom) Modifier.align(Alignment.BottomCenter).navigationBarsPadding() else Modifier)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // The export's progress as a filling pill, the same one the Export button showed
            // (no spinning circle, user 2026-11-08).
            ExportProgressPill(onDarkroom = darkroom)
            Button(onClick = onCancel) { Text(stringResource(R.string.editor_export_cancel)) }
            Text(
                stringResource(R.string.editor_export_rendering),
                color = if (darkroom) SpektraBrand.onDarkroom else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

