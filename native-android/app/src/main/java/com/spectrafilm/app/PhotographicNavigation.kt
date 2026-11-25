/* Navigation order from Lab 9.56; original native Material controls/theme. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable internal fun PhotoStageNavigation(
    page:PhotoTool, open:Boolean, dirty:Set<PhotoTool>,wide:Boolean,
    onStage:(PhotoStage)->Unit,onTool:(PhotoTool)->Unit,
    exportVisible:Boolean=false,exporting:Boolean=false,onExport:()->Unit={},onShare:()->Unit={},
) {
    var menu by remember{mutableStateOf(false)}
    val services:@Composable ()->Unit={
        Box {
            IconButton(onClick={menu=true},modifier=Modifier.testTag("workflow-services")) {
                Icon(categoryIcon(Category.PRESETS),contentDescription="Рецепты, маски и предпросмотр")
            }
            DropdownMenu(expanded=menu,onDismissRequest={menu=false}) {
                for(tool in listOf(PhotoTool.PRESETS,PhotoTool.MASKS,PhotoTool.DISPLAY))DropdownMenuItem(text={Text(tool.title)},onClick={menu=false;onTool(tool)})
            }
        }
    }
    if(wide)NavigationRail(
        modifier=Modifier.fillMaxHeight().helpSpot(LocalQuickHelp.current,HelpSpot.MODES),containerColor=MaterialTheme.colorScheme.surface,
        header={if(exportVisible){ExportFab(exporting,onExport);ExportShareSmallFab(exporting,onShare)}},
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()),horizontalAlignment=Alignment.CenterHorizontally) {
            for(stage in PhotoStage.entries)NavigationRailItem(
                selected=open&&page.stage==stage,onClick={onStage(stage)},
                modifier=Modifier.testTag("workflow-stage-${stage.name}"),
                icon={BadgedBox(badge={if(dirty.any{it.stage==stage})Badge()}){Icon(categoryIcon(stage.iconCategory),null)}},
                label={Text(stage.displayTitle(),maxLines=1,overflow=TextOverflow.Ellipsis)},
            )
            services()
        }
    } else BoxWithConstraints(Modifier.fillMaxWidth().helpSpot(LocalQuickHelp.current,HelpSpot.MODES)) {
        val density=LocalDensity.current
        val itemWidth=56.dp*density.fontScale.coerceAtLeast(1f)
        val barWidth=maxOf(maxWidth,itemWidth*PhotoStage.entries.size)
        val scroll=rememberScrollState()
        LaunchedEffect(page.stage,barWidth,maxWidth){
            if(barWidth>maxWidth) {
                val index=page.stage?.ordinal?:0
                val itemPx=with(density){(barWidth/PhotoStage.entries.size).toPx()}
                val viewport=with(density){maxWidth.toPx()}
                scroll.animateScrollTo(((index+.5f)*itemPx-viewport/2).toInt().coerceAtLeast(0))
            }
        }
        Box(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
            NavigationBar(modifier=Modifier.width(barWidth).navigationBarsPadding(),
                containerColor=MaterialTheme.colorScheme.surfaceContainer,
                windowInsets=WindowInsets(0,0,0,0)) {
                for(stage in PhotoStage.entries)NavigationBarItem(
                    selected=open&&page.stage==stage,onClick={onStage(stage)},
                    modifier=Modifier.testTag("workflow-stage-${stage.name}"),
                    icon={BadgedBox(badge={if(dirty.any{it.stage==stage})Badge(Modifier.size(6.dp))}){Icon(categoryIcon(stage.iconCategory),null,Modifier.size(22.dp))}},
                    label={Text(stage.displayTitle(),fontSize=11.sp,lineHeight=14.sp,letterSpacing=0.sp,maxLines=1,textAlign=TextAlign.Center,modifier=Modifier.requiredWidth(itemWidth))},
                )
            }
        }
    }
}

@Composable internal fun PhotoToolTabs(page:PhotoTool,dirty:Set<PhotoTool>,onReset:(()->Unit)?=null,onParameter:(ParameterSearchTarget)->Unit={},onSelect:(PhotoTool)->Unit) {
    var directory by rememberSaveable { mutableStateOf<Boolean?>(null) }
    var batchQueue by rememberSaveable { mutableStateOf(false) }
    if(batchQueue)BatchQueueSheet{batchQueue=false}
    Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically) {
        Row(Modifier.weight(1f).heightIn(min=56.dp).testTag("tool-directory-open")
            .clickable(role=Role.Button){directory=false}.padding(horizontal=4.dp),verticalAlignment=Alignment.CenterVertically) {
            Column(Modifier.weight(1f),horizontalAlignment=Alignment.Start) {
                Text("Инструменты · ${page.stage?.title?:"Рабочая среда"}",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=1,overflow=TextOverflow.Ellipsis)
                Text(page.displayTitle(),style=MaterialTheme.typography.titleSmall,color=MaterialTheme.colorScheme.primary,maxLines=1,overflow=TextOverflow.Ellipsis)
            }
            Icon(SpectraIcons.ChevronDown,null)
        }
        IconButton(onClick={onReset?.invoke()},enabled=onReset!=null,modifier=Modifier.testTag("tool-reset")) {
            Icon(SpectraIcons.Reset,"Сбросить инструмент: ${page.title}")
        }
        IconButton(onClick={batchQueue=true},modifier=Modifier.testTag("batch-queue-open")){Icon(categoryIcon(Category.OUTPUT),"Пакетный экспорт и отчёты")}
        IconButton(onClick={directory=true},modifier=Modifier.testTag("tool-directory-global")) {
            Icon(SpectraIcons.Search,"Найти любой инструмент")
        }
    }
    directory?.let { global->ToolDirectory(page,dirty,global,{directory=null},onParameter=onParameter,onSelect=onSelect) }
}
