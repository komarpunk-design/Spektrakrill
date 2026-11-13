/* Searchable, lazy native preset catalogue. GPLv3. */
package com.spectrafilm.app
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Locale

internal data class SavedPresetInfo(val film:String="",val paper:String="",val mode:String="paper",val error:String="",val note:String="")
internal data class PresetCatalogEntry(val id:String,val name:String,val group:String,val detail:String,val builtin:BuiltInPreset?=null,val saved:String?=null,val error:String="")
internal fun filterPresetCatalog(entries:List<PresetCatalogEntry>,query:String,source:String,favorites:Set<String>):List<PresetCatalogEntry> {
 val words=query.trim().lowercase(Locale.ROOT).split(Regex("\\s+")).filter{it.isNotEmpty()}
 return entries.filter { e ->
  (source!="mine"||e.saved!=null)&&(source!="builtin"||e.builtin!=null)&&(source!="favorites"||e.id in favorites)&&
   words.all{it in "${e.name} ${e.group} ${e.detail}".lowercase(Locale.ROOT)}
 }.sortedWith(compareBy<PresetCatalogEntry>{it.id !in favorites}.thenBy{it.saved==null}.thenBy{it.name.lowercase(Locale.ROOT)})
}

@Composable private fun PresetRecipeCard(e:PresetCatalogEntry,active:Boolean,favorite:Boolean,onFavorite:()->Unit,onApply:()->Unit,onExport:()->Unit,onDelete:()->Unit) {
 var menu by remember{mutableStateOf(false)};var deleting by remember{mutableStateOf(false)}
 Card(
  onClick=onApply,enabled=e.error.isBlank(),modifier=Modifier.fillMaxWidth().testTag("preset-card-${e.id}"),
  colors=CardDefaults.cardColors(containerColor=if(active)MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh),
  border=BorderStroke(1.dp,if(active)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
 ) {
  Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
   Row(verticalAlignment=Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
     Text(e.name,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
     Text(if(e.saved!=null)"Мой рецепт"else e.group,style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.primary)
    }
    IconToggleButton(checked=favorite,onCheckedChange={onFavorite()},modifier=Modifier.semantics{contentDescription=(if(favorite)"Убрать из избранного: "else"В избранное: ")+e.name}){Text(if(favorite)"★"else"☆",style=MaterialTheme.typography.titleLarge,modifier=Modifier.testTag("preset-favorite-${e.id}"))}
    if(e.saved!=null)Box {
     IconButton(onClick={menu=true}){Icon(SpectraIcons.More,"Действия: ${e.name}")}
     DropdownMenu(menu,{menu=false}) {
      DropdownMenuItem(text={Text("Экспортировать JSON")},onClick={menu=false;onExport()})
      DropdownMenuItem(text={Text("Удалить из каталога")},onClick={menu=false;deleting=true})
     }
    }
   }
   Text(e.error.ifBlank{e.detail},style=MaterialTheme.typography.bodySmall,color=if(e.error.isNotBlank())MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
    if(active)Text(if(e.builtin!=null)"Применён"else"Выбран",style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.primary)else Spacer(Modifier.width(1.dp))
    FilledTonalButton(enabled=e.error.isBlank(),onClick=onApply){Text("Применить")}
   }
  }
 }
 if(deleting)AlertDialog(onDismissRequest={deleting=false},title={Text("Удалить «${e.name}»?")},text={Text("Удаление можно отменить сообщением в редакторе.")},confirmButton={TextButton(onClick={deleting=false;onDelete()}){Text("Удалить")}},dismissButton={TextButton(onClick={deleting=false}){Text("Отмена")}})
}
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PresetPanel(
    builtInGroups: Map<String, List<BuiltInPreset>>,
    onApplyBuiltIn: (BuiltInPreset) -> Unit,
    /** The built-in look currently on the photo ("" when the photo has moved on from it). */
    appliedBuiltInId: String = "",
    /** Tiles of the photo through each look; null without a photo (no strip then). */
    previewHost: StockPreviewHost? = null,
    stripSourceKey: Any? = null,
    stripPaused: Boolean = false,
    amount: Float,
    amountEnabled: Boolean,
    onAmountChange: (Float) -> Unit,
    presets: List<String>,
    selected: String,
    name: String,
    onNameChange: (String) -> Unit,
    onSelect: (String) -> Unit,
    onSave: () -> Unit,
    nameExists: (String) -> Boolean,
    resolveName: (String) -> String,
    onApply: () -> Unit,
    onDelete: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onExportSelected: () -> Unit,
    onCopySettings: () -> Unit,
    canPasteSettings: Boolean,
    onPasteSettings: () -> Unit,
    /** Display name of the photo whose edit "Apply previous edit" would use; null when none. */
    previousEditName: String?,
    onApplyPrevious: () -> Unit,
    onExportLut: (size: Int, clf: Boolean) -> Unit,
    bakingLut: Boolean,
    importing:Boolean=false,
    importMessage:String="",
    onDismissImportMessage:()->Unit={},
    onImportText:((String)->Unit)?=null,
    savedInfo:Map<String,SavedPresetInfo> = emptyMap(),
    onApplySaved:((String)->Unit)?=null,
    // Versions of the open photo, under the copy/paste row (see VersionsSection).
    versionsContent: @Composable () -> Unit = {},
) {
    val ctx=LocalContext.current
    val pref=remember(ctx){ctx.getSharedPreferences("preset-catalog",android.content.Context.MODE_PRIVATE)}
    var favorites by remember{mutableStateOf(pref.getStringSet("favorites",emptySet()).orEmpty().toSet())}
    var query by rememberSaveable{mutableStateOf("")};var source by rememberSaveable{mutableStateOf("all")}
    var save by remember{mutableStateOf(false)};var overwriteName by remember{mutableStateOf<String?>(null)}
    var paste by remember{mutableStateOf(false)};var pasted by remember{mutableStateOf("")}
    var advanced by rememberSaveable{mutableStateOf(false)}
    val list=rememberLazyListState()
    var lastCount by remember{mutableIntStateOf(presets.size)}
    LaunchedEffect(presets.size){if(presets.size>lastCount){source="mine";query=""};lastCount=presets.size}
    LaunchedEffect(query,source){list.scrollToItem(0)}
    LaunchedEffect(save,paste){if(save||paste)list.scrollToItem(0)}
    val entries=remember(builtInGroups,presets,savedInfo,ctx) {
        builtInGroups.values.flatten().map{p->PresetCatalogEntry("b:${p.id}",p.name,p.group,
            listOf(BuiltInPresets.specLine(StockCatalog.displayName(ctx,p.filmProfile),StockCatalog.displayName(ctx,p.printProfile),p.scanFilm,"Прямой скан"),p.description).filter{it.isNotBlank()}.joinToString("\n"),builtin=p)}+
        presets.map{n->val i=savedInfo[n];PresetCatalogEntry("u:$n",n,"Мои",if(i==null)"Читаю сведения о рецепте…" else listOf(i.film.takeIf{it.isNotBlank()}?.let{StockCatalog.displayName(ctx,it)}?:"Текущая плёнка",if(i.mode=="paper")i.paper.takeIf{it.isNotBlank()}?.let{StockCatalog.displayName(ctx,it)}else when(i.mode){"digital"->"Digital Reference";"auto-levels"->"Auto Levels";"lab-scan"->"Lab Scan · минилаб";"negative"->"Негатив на просвет";else->i.mode}).filterNotNull().joinToString(" · ")+i.note.takeIf{it.isNotBlank()}.orEmpty().let{if(it.isBlank())""else"\n$it"},saved=n,error=i?.error.orEmpty())}
    }
    val visible=remember(entries,query,source,favorites){filterPresetCatalog(entries,query,source,favorites)}
    LazyColumn(state=list,modifier=Modifier.fillMaxSize().testTag("preset-catalog"),verticalArrangement=Arrangement.spacedBy(10.dp),contentPadding=PaddingValues(bottom=16.dp)) {
        stickyHeader {
            Surface(color=MaterialTheme.colorScheme.surfaceContainer) {
                Column(verticalArrangement=Arrangement.spacedBy(6.dp),modifier=Modifier.padding(bottom=8.dp)) {
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(onClick=onImport,enabled=!importing,modifier=Modifier.weight(1f)){Text(if(importing)"Импорт…"else"Импорт JSON")}
                        OutlinedButton(onClick={save=true;overwriteName=null},enabled=!importing,modifier=Modifier.weight(1f).testTag("preset-save-open")){Text("Сохранить")}
                    }
                    OutlinedTextField(query,{query=it},singleLine=true,label={Text("Поиск рецептов")},placeholder={Text("Название, плёнка, описание")},leadingIcon={Icon(SpectraIcons.Search,null)},trailingIcon={if(query.isNotEmpty())IconButton(onClick={query=""}){Icon(SpectraIcons.Cancel,"Очистить поиск")}},modifier=Modifier.fillMaxWidth().testTag("preset-search"))
                    FlowRow(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                        for((id,title)in listOf("all" to "Все","favorites" to "Избранное","builtin" to "Встроенные","mine" to "Мои"))FilterChip(selected=source==id,onClick={source=id},label={Text(title)},modifier=Modifier.testTag("preset-source-$id"))
                    }
                }
            }
        }
        item{Text("${visible.size} найдено · ${presets.size} своих · ${entries.size-presets.size} встроенных",style=MaterialTheme.typography.labelMedium)}
        if(save)item {
            ContentCard {
                Text("Сохранить текущую обработку",style=MaterialTheme.typography.titleMedium)
                OutlinedTextField(name,onNameChange,label={Text("Название рецепта")},singleLine=true,modifier=Modifier.fillMaxWidth())
                if(resolveName(name)!=name.trim()&&name.isNotBlank())Text("Имя файла: ${resolveName(name)}")
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(enabled=name.isNotBlank(),modifier=Modifier.testTag("preset-save-confirm"),onClick={if(nameExists(name))overwriteName=name else onSave();save=false}){Text("Сохранить рецепт")}
                    TextButton(onClick={save=false}){Text("Отмена")}
                }
            }
        }
        if(importMessage.isNotBlank())item{Row(verticalAlignment=Alignment.Top){Text(importMessage,style=MaterialTheme.typography.bodySmall,modifier=Modifier.weight(1f).testTag("preset-import-message"));if(!importing)IconButton(onClick=onDismissImportMessage){Icon(SpectraIcons.Cancel,"Скрыть сообщение импорта")}}}
        if(onImportText!=null)item{TextButton(onClick={paste=true},enabled=!importing){Text("Вставить JSON текстом")}}
        if(paste)item {
            ContentCard {
                Text("Импорт JSON",style=MaterialTheme.typography.titleMedium)
                OutlinedTextField(pasted,{if(it.length<=AtomicJsonStore.MAX_PRESET_BYTES)pasted=it},label={Text("JSON рецепта или набора")},modifier=Modifier.fillMaxWidth().heightIn(min=160.dp,max=240.dp))
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(enabled=pasted.isNotBlank()&&!importing,onClick={onImportText?.invoke(pasted);paste=false}){Text("Импортировать")}
                    TextButton(onClick={paste=false}){Text("Отмена")}
                }
            }
        }
        if(amountEnabled)item{EnhancedSlider("Сила применённого пресета",amount*100f,0f..100f,{onAmountChange(it/100f)},step=1f,decimals=0,default=100f)}
        if(previewHost!=null&&source in listOf("all","builtin")&&query.isBlank())item{
            val groups=builtInGroups.map{(group,ps)->DropdownGroup(group,ps.map{DropdownOption(it.id,it.name)})}
            FilmStockStrip(selectedId=appliedBuiltInId,groups=groups,previewHost=previewHost,sourceKey=stripSourceKey,paused=stripPaused,onSelect={id->builtInGroups.values.flatten().firstOrNull{it.id==id}?.let(onApplyBuiltIn)})
        }
        if(visible.isEmpty())item{ContentCard{Text(if(source=="mine"&&presets.isEmpty())"Здесь будут ваши рецепты"else"Ничего не найдено",style=MaterialTheme.typography.titleMedium);Text(if(source=="mine"&&presets.isEmpty())"Импортируйте JSON или сохраните текущую обработку."else"Измените поиск или выберите другой раздел.")}}
        items(visible,key={it.id}){e->
            PresetRecipeCard(e,if(e.builtin!=null)e.builtin.id==appliedBuiltInId else e.saved==selected,e.id in favorites,
                onFavorite={favorites=if(e.id in favorites)favorites-e.id else favorites+e.id;pref.edit().putStringSet("favorites",favorites).apply()},
                onApply={if(e.builtin!=null)onApplyBuiltIn(e.builtin)else e.saved?.let{n->if(onApplySaved!=null)onApplySaved(n)else{onSelect(n);onApply()}}},
                onExport={e.saved?.let(onSelect);onExportSelected()},onDelete={e.saved?.let(onSelect);onDelete()})
        }
        item {
            TextButton(onClick={advanced=!advanced}){Text(if(advanced)"Скрыть дополнительные действия"else"Копирование, версии и LUT")}
            if(advanced)Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick=onExport,modifier=Modifier.fillMaxWidth()){Text("Экспортировать текущий рецепт JSON")}
                PresetUtilities(
                    onCopySettings = onCopySettings,
                    canPasteSettings = canPasteSettings,
                    onPasteSettings = onPasteSettings,
                    previousEditName = previousEditName,
                    onApplyPrevious = onApplyPrevious,
                    onExportLut = onExportLut,
                    bakingLut = bakingLut,
                    versionsContent = versionsContent
                )
            }
        }
    }
    overwriteName?.let{pending->AlertDialog(onDismissRequest={overwriteName=null},title={Text("Заменить сохранённый рецепт?")},text={Text("Рецепт «$pending» уже существует. Подтвердите замену.")},confirmButton={TextButton(onClick={onNameChange(pending);onSave();overwriteName=null}){Text("Заменить")}},dismissButton={TextButton(onClick={overwriteName=null}){Text("Отмена")}})}

}
