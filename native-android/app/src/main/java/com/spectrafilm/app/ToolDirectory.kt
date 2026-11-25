/* One discoverable directory for every existing editor tool. GPLv3. */
package com.spectrafilm.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.util.Locale

internal val PhotoTool.purpose:String get()=when(this){
    PhotoTool.EXPOSURE->"Свет, попадающий на виртуальную плёнку"
    PhotoTool.BALANCE->"Температура и оттенок исходного изображения"
    PhotoTool.PREP->"Света, тени и цвет перед экспонированием плёнки"
    PhotoTool.LENS->"Размытие объектива, диффузия, UV и IR"
    PhotoTool.FILTER->"Съёмочные цветные фильтры перед плёнкой"
    PhotoTool.INPUT_COLOR->"Цветовое пространство, гамма и входной гамут"
    PhotoTool.RAW_CLEANUP->"Удаление дефектов сенсора и шума RAW"
    PhotoTool.SOURCE->"Импорт и параметры декодирования исходника"
    PhotoTool.FILMS->"Все плёнки в одном каталоге"
    PhotoTool.FORMAT->"Размер кадра: масштаб зерна и оптических эффектов"
    PhotoTool.SPECTRUM->"Восстановление спектра из RGB"
    PhotoTool.FILM_BASE->"Плотность подложки и оранжевая маска"
    PhotoTool.PROFILE->"Сведения и данные выбранной эмульсии"
    PhotoTool.DEVELOP->"Push / Pull, экспозиция и контраст проявки"
    PhotoTool.CHEMISTRY->"Химия, γ слоёв и истощение проявителя"
    PhotoTool.DIR->"Межслойное влияние: классическая модель или Langmuir"
    PhotoTool.GRAIN->"Фактура эмульсии: Spektrafilm или RMS"
    PhotoTool.HALATION->"Световое гало: Spektrafilm или Layered Transport"
    PhotoTool.DATE->"Впечатанная дата на виртуальной плёнке"
    PhotoTool.OUTPUT->"Выбор результата: бумага, цифровой скан или негатив"
    PhotoTool.PAPER->"Материал, экспозиция, фильтры и оптика печати"
    PhotoTool.PAPER_BASE->"Плотность и цвет подложки фотобумаги"
    PhotoTool.TEST_PRINT->"Сравнение экспозиций и цветовых фильтров печати"
    PhotoTool.SCAN->"Lab Scan, Noritsu, Nikon Scan, Digital Reference, Auto Levels: тон, цвет и резкость"
    PhotoTool.NEGATIVE->"Маска, калибровка и конвертация настоящего негатива"
    PhotoTool.SPECTRAL_SCAN->"Прямой спектральный скан и блики"
    PhotoTool.CROP->"Обрезка, пропорции, поворот и выравнивание"
    PhotoTool.FRAME->"Кромка, перфорация, надписи и DX-код"
    PhotoTool.TONE->"Кривые, насыщенность, динамический диапазон и контрастная маска"
    PhotoTool.OUTPUT_COLOR->"Выходное цветовое пространство, гамут и масштаб"
    PhotoTool.FILE->"Формат файла и сохранение результата"
    PhotoTool.PRESETS->"Каталог рецептов, сохранение и импорт JSON"
    PhotoTool.MASKS->"Локальная обработка выбранных областей"
    PhotoTool.DISPLAY->"Качество предпросмотра и сравнение результата"
}
internal fun toolDirectoryResults(query:String,stage:PhotoStage?,dirtyOnly:Boolean,dirty:Set<PhotoTool>,extra:Map<PhotoTool,String> = emptyMap()):List<PhotoTool> {
    val words=query.trim().lowercase(Locale.ROOT).replace('ё','е').replace("норитсу","noritsu").replace("норицу","noritsu").replace("никон","nikon").split(Regex("\\s+")).filter{it.isNotEmpty()}
    return PhotoTool.entries.filter{tool->
        (stage==null||tool.stage==stage)&&(!dirtyOnly||tool in dirty)&&
        words.all{word->("${tool.title} ${tool.purpose} ${tool.stage?.title.orEmpty()} ${extra[tool].orEmpty()}").lowercase(Locale.ROOT).replace('ё','е').contains(word)}
    }
}

internal fun parameterSearchIndex(ctx:android.content.Context):List<ParameterSearchTarget> {
    val mapping=mapOf("prep" to PhotoTool.PREP,"grain" to PhotoTool.GRAIN,"transport" to PhotoTool.HALATION,
        "dir" to PhotoTool.DIR,"chemistry" to PhotoTool.CHEMISTRY,"film-base" to PhotoTool.FILM_BASE,
        "paper-base" to PhotoTool.PAPER_BASE,"negative" to PhotoTool.NEGATIVE,"output" to PhotoTool.SCAN)
    return mapping.flatMap{(group,tool)->
        val rows=LabCatalog.controls(ctx,group)
        val buckets=labParameterBuckets(group,rows.filter{it.getString("kind")!="switch"}).filter{it.second.isNotEmpty()}
        rows.map { row->
            val path=row.getString("path")
            val bucket=buckets.indexOfFirst{(_,controls)->controls.any{it.getString("path")==path}}
            val subgroup=if(group in listOf("grain","chemistry","prep")&&bucket>0)"lab-$group-$bucket" else if(group=="output") when(path.substringAfter("outputModel.")) {
                "contrast","blackPoint","whitePoint"->"scan-tone"
                "cyan","magenta","yellow"->"scan-colour"
                "noritsuGamma","noritsuLow","noritsuMid","noritsuHigh"->"scan-noritsu-gradation"
                "noritsuSaturation","noritsuRed","noritsuGreen","noritsuBlue"->"scan-noritsu-colour"
                "look"->"scan-character"
                else->null
            } else null
            ParameterSearchTarget(tool,path,row.getString("label"),subgroup)
        }
    }
}
internal fun parameterSearchMatches(target:ParameterSearchTarget,query:String):Boolean {
    val text="${target.label} ${target.path}".lowercase(Locale.ROOT).replace('ё','е')
    return query.trim().lowercase(Locale.ROOT).replace('ё','е').split(Regex("\\s+")).all{it in text}
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable internal fun ToolDirectory(page:PhotoTool,dirty:Set<PhotoTool>,global:Boolean,onDismiss:()->Unit,onParameter:(ParameterSearchTarget)->Unit={},onSelect:(PhotoTool)->Unit) {
    var query by rememberSaveable{mutableStateOf("")}
    var scope by rememberSaveable{mutableStateOf(if(global)"all" else "stage")}
    var changedOnly by rememberSaveable{mutableStateOf(false)}
    val ctx=LocalContext.current
    val extra=remember(ctx){
        PhotoTool.entries.associateWith{tool->
            val groups=when(tool){
                PhotoTool.PREP->listOf("prep");PhotoTool.GRAIN->listOf("grain");PhotoTool.HALATION->listOf("transport")
                PhotoTool.DIR->listOf("dir");PhotoTool.CHEMISTRY->listOf("chemistry");PhotoTool.FILM_BASE->listOf("film-base")
                PhotoTool.PAPER_BASE->listOf("paper-base");PhotoTool.NEGATIVE->listOf("negative");PhotoTool.SCAN->listOf("output")
                else->emptyList()
            }
            (groups.flatMap{LabCatalog.controls(ctx,it)}.map{it.getString("label")}+tool.nativePaths()).joinToString(" ")
        }
    }
    // A search is global by default: a newcomer need not know the stage in advance.
    val selectedStage=if(query.isNotBlank()||scope=="all")null else page.stage
    val results=toolDirectoryResults(query,selectedStage,changedOnly,dirty,extra)
    val parameterIndex=remember(ctx){parameterSearchIndex(ctx)}
    val parameters=if(query.isBlank())emptyList() else parameterIndex.filter{parameterSearchMatches(it,query)&&(!changedOnly||it.tool in dirty)}
    ModalBottomSheet(onDismissRequest=onDismiss,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)){
        Column(Modifier.fillMaxWidth().fillMaxHeight(.85f).imePadding().padding(horizontal=16.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                Text("Инструменты",style=MaterialTheme.typography.titleLarge,modifier=Modifier.weight(1f))
                TextButton(onClick=onDismiss){Text("Закрыть")}
            }
            OutlinedTextField(value=query,onValueChange={query=it},label={Text("Найти инструмент")},
                placeholder={Text("Например: зерно, гамут, Noritsu")},singleLine=true,
                leadingIcon={Icon(SpectraIcons.Search,null)},modifier=Modifier.fillMaxWidth().testTag("tool-directory-search"))
            FlowRow(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                if(page.stage!=null)FilterChip(selected=scope=="stage"&&query.isBlank(),onClick={scope="stage";query=""},label={Text(page.stage.title)})
                FilterChip(selected=scope=="all"||query.isNotBlank(),onClick={scope="all"},label={Text("Все инструменты")})
                FilterChip(selected=changedOnly,onClick={changedOnly=!changedOnly},label={Text("Изменённые · ${dirty.size}")})
            }
            if(results.isEmpty()&&parameters.isEmpty())Text(if(changedOnly)"Изменённых инструментов не найдено. Отключите фильтр или измените запрос." else "Ничего не найдено. Попробуйте название эффекта или параметра.",Modifier.padding(vertical=16.dp))
            LazyColumn(Modifier.weight(1f).testTag("tool-directory-list"),contentPadding=PaddingValues(bottom=24.dp)){
                items(parameters,key={"parameter-${it.path}"}){target->
                    ListItem(headlineContent={Text(target.label)},supportingContent={Text("${target.tool.stage?.title} → ${target.tool.title}")},
                        modifier=Modifier.testTag("search-parameter-${target.path}").clickable(role=Role.Button){onParameter(target);onDismiss()})
                }
                items(results,key={it.id}){tool->
                    Row(Modifier.fillMaxWidth().testTag("workflow-tool-${tool.id}").clickable(role=Role.Button){onSelect(tool);onDismiss()}.padding(vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
                        Icon(categoryIcon(tool.category),null,Modifier.size(22.dp))
                        Column(Modifier.weight(1f).padding(horizontal=12.dp)){
                            Text(tool.title,style=MaterialTheme.typography.titleSmall,color=if(tool==page)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                            Text(tool.purpose,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=2,overflow=TextOverflow.Ellipsis)
                            if(selectedStage==null)Text(tool.stage?.title?:"Рабочие инструменты",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
                        }
                        if(tool in dirty)Badge{Text("Изменено")}
                    }
                    HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant.copy(alpha=.4f))
                }
            }
        }
    }
}
