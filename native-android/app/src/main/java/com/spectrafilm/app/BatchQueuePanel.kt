/* GPLv3. Batch history, diagnostics and explicit recovery without duplicate exports. */
package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.spectrafilm.engine.SpektraEngine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun BatchQueueSheet(onDismiss:()->Unit) {
    val context=LocalContext.current.applicationContext
    val scope=rememberCoroutineScope()
    val progress by BatchExportTracker.state.collectAsStateWithLifecycle()
    val runtime by ExportWorkRuntime.state.collectAsStateWithLifecycle()
    var queues by remember { mutableStateOf(emptyList<BatchQueue>()) }
    var selected by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf("") }
    LaunchedEffect(progress,runtime){queues=withContext(ProcessDispatchers.io){BatchQueue.list(context)}}
    val queue=queues.firstOrNull{it.id==selected}
    fun resume(job:BatchQueue,retry:Boolean) {
        scope.launch {
            val started=System.currentTimeMillis()
            val launched=ExportWorkRuntime.launch(context,job.options.format,started) {
                SpektraEngine.fromAssets(context.assets).use { engine ->
                    runBatchExport(context,engine,job.sources,BatchEditSource.SharedLook(org.json.JSONObject()),job.options,job.keepGps,started,queueId=job.id,retryFailed=retry)
                }
            }
            message=if(launched==null)"Дождитесь текущего экспорта" else "Очередь возобновлена"
        }
    }
    ModalBottomSheet(onDismissRequest=onDismiss,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(.85f).padding(16.dp).testTag("batch-queue-panel")) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                Text("Пакетный экспорт",style=MaterialTheme.typography.titleLarge)
                TextButton(onClick=onDismiss){Text("Закрыть")}
            }
            Text("Очереди и отчёты сохраняются после закрытия приложения. Готовые файлы при продолжении проверяются; повторная обработка их не перезаписывает.",style=MaterialTheme.typography.bodySmall)
            if(message.isNotBlank())Text(message)
            if(queue==null) {
                if(queues.isEmpty())Text("Очередей пока нет. В меню сохранения выберите экспорт нескольких фотографий.",Modifier.padding(vertical=16.dp))
                LazyColumn {
                    items(queues,key={it.id}){job->
                        val done=(0 until job.rows.length()).count{job.row(it).optString("status")=="done"}
                        ListItem(headlineContent={Text("${job.rows.length()} фото · ${job.options.format.name}")},supportingContent={Text("Сохранено: $done · ${job.document.optString("state")}")},trailingContent={TextButton(onClick={selected=job.id}){Text("Открыть")}})
                    }
                }
            } else {
                TextButton(onClick={selected=null}){Text("Все очереди")}
                val statuses=(0 until queue.rows.length()).map{queue.row(it).optString("status")}
                val idle=runtime !is ExportRuntimeState.Running
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    Button(enabled=idle&&statuses.any{it in listOf("pending","running")},onClick={resume(queue,false)},modifier=Modifier.testTag("batch-resume")){Text("Продолжить")}
                    OutlinedButton(enabled=idle&&"failed" in statuses,onClick={resume(queue,true)},modifier=Modifier.testTag("batch-retry-failed")){Text("Повторить ошибки")}
                }
                LazyColumn {
                    items((0 until queue.rows.length()).toList(),key={it}){index->
                        val photo=queue.row(index)
                        val phase=photo.optJSONObject("phases")
                        val error=photo.optJSONObject("error")
                        ListItem(headlineContent={Text(photo.getString("name"))},supportingContent={Column{
                            Text(when(photo.optString("status")){"done"->"Сохранено";"failed"->"Ошибка";"blocked"->"Нужна проверка файла";"running"->"Обработка прервана или выполняется";else->"Ожидает обработки"})
                            if(phase!=null)Text(ExportStage.entries.joinToString(" · "){"${it.name}: ${phase.optLong(it.name)} мс"},style=MaterialTheme.typography.bodySmall)
                            if(error!=null)Text("${error.optString("stage")}: ${error.optString("message")}",color=MaterialTheme.colorScheme.error)
                        }})
                    }
                }
            }
        }
    }
}
