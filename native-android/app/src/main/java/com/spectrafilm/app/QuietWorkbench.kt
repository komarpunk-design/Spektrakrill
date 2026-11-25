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
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.composed
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.border
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

internal data class ParameterSearchTarget(val tool:PhotoTool,val path:String,val label:String,val groupId:String?=null,val native:Boolean=false,val requestSerial:Long=0)
internal val ParameterSearchSaver=Saver<ParameterSearchTarget?,List<String>>(
    save={target->target?.let{listOf(it.tool.id,it.path,it.label,it.groupId.orEmpty(),it.native.toString(),it.requestSerial.toString())}?:emptyList()},
    restore={parts->if(parts.size !in 5..6)null else PhotoTool.entries.firstOrNull{it.id==parts[0]}?.let{
        ParameterSearchTarget(it,parts[1],parts[2],parts[3].ifEmpty{null},parts[4]=="true",parts.getOrNull(5)?.toLongOrNull()?:0)
    }},
)
internal val LocalParameterSearch=staticCompositionLocalOf<ParameterSearchTarget?> { null }
/** Retains exact control identity across navigation, then scrolls the rendered row. */
internal fun Modifier.parameterSearchTarget(path:String):Modifier=composed {
    val target=LocalParameterSearch.current
    val requester=remember { BringIntoViewRequester() }
    val selected=target?.path==path
    var placed by remember { mutableStateOf(false) }
    LaunchedEffect(selected,placed,target?.requestSerial){if(selected&&placed)requester.bringIntoView()}
    val highlight=if(selected)Modifier.border(1.dp,MaterialTheme.colorScheme.primary,MaterialTheme.shapes.small).padding(8.dp) else Modifier
    this.then(highlight).bringIntoViewRequester(requester).onGloballyPositioned{placed=true}.testTag("parameter-$path")
}

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
    val requested=LocalParameterSearch.current
    val requestedGroup=requested?.resolvedGroupId(LocalContext.current)
    var independent by rememberSaveable(id){mutableStateOf(false)}
    LaunchedEffect(requested?.path,requested?.requestSerial,requestedGroup,id){if(requestedGroup==id){if(focus==null)independent=true else focus.selected=id}}
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
