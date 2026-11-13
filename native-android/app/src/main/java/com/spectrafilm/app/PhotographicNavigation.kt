/* Navigation order from Lab 9.56; original native Material controls/theme. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
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
                label={Text(stage.title,maxLines=1,overflow=TextOverflow.Ellipsis)},
            )
            services()
        }
    } else BoxWithConstraints(Modifier.fillMaxWidth().helpSpot(LocalQuickHelp.current,HelpSpot.MODES)) {
        val barWidth=maxOf(maxWidth,336.dp)
        // Seven 48dp targets remain visible on a normal phone, as in 9.56.
        // Only unusually narrow windows need horizontal scrolling.
        Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            NavigationBar(modifier=Modifier.width(barWidth).navigationBarsPadding(),
                containerColor=MaterialTheme.colorScheme.surfaceContainer,
                windowInsets=WindowInsets(0,0,0,0)) {
                for(stage in PhotoStage.entries)NavigationBarItem(
                    selected=open&&page.stage==stage,onClick={onStage(stage)},
                    modifier=Modifier.testTag("workflow-stage-${stage.name}"),
                    icon={BadgedBox(badge={if(dirty.any{it.stage==stage})Badge(Modifier.size(6.dp))}){Icon(categoryIcon(stage.iconCategory),null,Modifier.size(22.dp))}},
                    label={Text(stage.title,fontSize=10.sp,lineHeight=12.sp,letterSpacing=0.sp,maxLines=1,textAlign=TextAlign.Center,modifier=Modifier.requiredWidth(48.dp))},
                )
            }
        }
    }
}

@Composable internal fun PhotoToolTabs(page:PhotoTool,dirty:Set<PhotoTool>,onSelect:(PhotoTool)->Unit) {
    if(page.stage==null)return
    val tools=photoTools(page.stage)
    PrimaryScrollableTabRow(
        selectedTabIndex=tools.indexOf(page).coerceAtLeast(0),
        containerColor=MaterialTheme.colorScheme.surfaceContainer,
        edgePadding=12.dp,divider={},modifier=Modifier.fillMaxWidth(),
    ) {
        for(tool in tools)Tab(
            selected=tool==page,onClick={onSelect(tool)},
            modifier=Modifier.testTag("workflow-tool-${tool.id}"),
            text={BadgedBox(badge={if(tool in dirty)Badge(Modifier.size(6.dp))}){Text(tool.title,maxLines=1)}},
        )
    }
}
