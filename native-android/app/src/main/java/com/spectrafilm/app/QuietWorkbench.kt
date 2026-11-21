/* Progressive disclosure for the photographic workspace. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** Presentation only. Never stores or changes processing parameters. */
internal val LocalQuietEditor = staticCompositionLocalOf { false }
internal val LocalQuietSectionChanged = staticCompositionLocalOf { false }
internal class ParameterFocus(initial:String?=null) {
    var selected by mutableStateOf(initial)
    companion object {
        val saver=Saver<ParameterFocus,String>(save={it.selected.orEmpty()},restore={ParameterFocus(it.ifEmpty{null})})
    }
}
internal val LocalParameterFocus = staticCompositionLocalOf<ParameterFocus?> { null }

@Composable internal fun QuietParameterGroup(
    id:String, title:String, summary:String="", changed:Boolean=false,
    content:@Composable ()->Unit,
) {
    val focus=LocalParameterFocus.current
    var independent by rememberSaveable(id){mutableStateOf(false)}
    val expanded=if(focus==null)independent else focus.selected==id
    Column(Modifier.fillMaxWidth().testTag("parameter-group-$id")) {
        Row(Modifier.fillMaxWidth().heightIn(min=56.dp)
            .clickable(role=Role.Button){if(focus==null)independent=!independent else focus.selected=if(expanded)null else id}
            .semantics{stateDescription=if(expanded)"Раскрыто" else "Свёрнуто"}
            .padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title,style=MaterialTheme.typography.titleSmall)
                if(summary.isNotBlank())Text(summary,style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=2,overflow=TextOverflow.Ellipsis)
            }
            if(changed)Text("Изменено",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary,
                modifier=Modifier.padding(horizontal=8.dp))
            Icon(SpectraIcons.ChevronDown,if(expanded)"Свернуть $title" else "Раскрыть $title",Modifier.rotate(if(expanded)180f else 0f))
        }
        if(expanded)Column(Modifier.fillMaxWidth().padding(bottom=12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            // Nested groups remain independent; a child must never close its parent.
            CompositionLocalProvider(LocalParameterFocus provides null){content()}
        }
        HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant.copy(alpha=.45f))
    }
}

@Composable internal fun QuietNote(text:String) {
    var open by remember(text){mutableStateOf(false)}
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
        Text(text,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
        IconButton(onClick={open=true}){Icon(SpectraIcons.Info,"Читать пояснение: $text",Modifier.size(20.dp))}
    }
    if(open)AlertDialog(onDismissRequest={open=false},title={Text("Как это работает")},text={Text(text,Modifier.heightIn(max=400.dp).verticalScroll(rememberScrollState()))},
        confirmButton={TextButton(onClick={open=false}){Text("Понятно")}})
}
