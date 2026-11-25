/* GPLv3. Atomic, restartable export manifests and per-photo diagnostics. */
package com.spectrafilm.app

import android.content.Context
import android.net.Uri
import android.os.Build
import android.util.AtomicFile
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

internal class BatchPhotoTiming(private val clock:()->Long=System::nanoTime) {
    private val times=LongArray(ExportStage.entries.size)
    var stage:ExportStage?=ExportStage.SETUP
        private set
    private var since=clock()
    fun enter(next:ExportStage?){
        val now=clock()
        stage?.let{times[it.ordinal]+=(now-since).coerceAtLeast(0)}
        since=now;stage=next
        next?.let(ExportWorkRuntime::reportStage)
    }
    fun json():JSONObject=JSONObject().also{out->ExportStage.entries.forEach{out.put(it.name,times[it.ordinal]/1_000_000)}}
}

/** One immutable recipe per input: retrying never silently adopts another edit. */
internal class BatchQueue private constructor(val file:File,val document:JSONObject) {
    val id:String get()=document.getString("id")
    val rows:JSONArray get()=document.getJSONArray("photos")
    val options:ExportOptions get()=document.getJSONObject("options").let{j->
        ExportOptions(ExportFormat.valueOf(j.getString("format")),j.getInt("quality"),ExportSize.valueOf(j.getString("size")),j.getInt("edge"),j.getString("name"),FilmBorder.valueOf(j.getString("border")),OutputSharpen.valueOf(j.getString("sharpen")),FrameLook.fromJson(j.optJSONObject("frame")))
    }
    val keepGps:Boolean get()=document.getBoolean("keepGps")
    val sources:List<BatchExportSource> get()=(0 until rows.length()).map{row(it).let{p->BatchExportSource(Uri.parse(p.getString("source")),p.getString("name"),SourceKind.valueOf(p.getString("kind")))}}
    fun row(index:Int):JSONObject=rows.getJSONObject(index)
    fun runnableIndices(retryFailed:Boolean):Set<Int> = (0 until rows.length()).filter { index ->
        if(retryFailed)row(index).optString("status")=="failed"
        else row(index).optString("status") in listOf("pending","running")
    }.toSet()
    fun edit(index:Int):BatchPhotoEdit {
        val p=row(index);val state=ParamsState();Presets.decode(p.getJSONObject("recipe"),state)
        return BatchPhotoEdit(state,SourceRotation.fromDegrees(p.getInt("rotation")),state.localAdjustments.toList())
    }
    @Synchronized fun save(){
        file.parentFile!!.let{check(it.isDirectory||it.mkdirs()){"Cannot create batch journal"}}
        val atomic=AtomicFile(file);val output=atomic.startWrite()
        try{output.write(document.toString().toByteArray(Charsets.UTF_8));atomic.finishWrite(output)}
        catch(error:Throwable){atomic.failWrite(output);throw error}
    }
    @Synchronized fun reserved(index:Int,token:String,length:Long,digest:String){
        row(index).put("receipt",JSONObject().put("uri",token).put("length",length).put("sha256",digest));save()
    }
    @Synchronized fun complete(index:Int,status:String,timing:BatchPhotoTiming,error:Throwable?=null,uri:Uri?=null){
        val failureStage=timing.stage?.name?:"FINISH"
        timing.enter(null)
        val p=row(index);p.put("status",status).put("phases",timing.json()).put("completedAt",System.currentTimeMillis())
        if(error!=null)p.put("error",JSONObject().put("type",error.javaClass.simpleName).put("message",error.message.orEmpty().take(2048)).put("stage",failureStage)) else p.remove("error")
        if(uri!=null)p.put("published",uri.toString())
        val attempts=p.optJSONArray("attempts")?:JSONArray().also{p.put("attempts",it)}
        attempts.put(JSONObject().put("status",status).put("phases",timing.json()).put("at",System.currentTimeMillis()).also{attempt->
            p.optJSONObject("error")?.let{attempt.put("error",JSONObject(it.toString()))}
            if(uri!=null)attempt.put("published",uri.toString())
        })
        save()
    }
    /** A durable reservation closes the process-death gap after MediaStore publish. */
    fun reconcile(context:Context){
        recoverPendingMediaStoreExports(context)
        for(i in 0 until rows.length()) {
            val p=row(i);if(p.optString("status")=="done")continue
            val receipt=p.optJSONObject("receipt")?:continue
            val uri=Uri.parse(receipt.getString("uri"))
            val state=if(uri.scheme=="content"&&Build.VERSION.SDK_INT>=29)AndroidPendingExportBackend(context).state(uri.toString()) else if(uri.scheme=="file"&&File(uri.path.orEmpty()).length()>0)StoredExportState.PUBLISHED else StoredExportState.MISSING
            if(state==StoredExportState.PUBLISHED) {
                try {
                    val digest=MessageDigest.getInstance("SHA-256");var count=0L
                    context.contentResolver.openInputStream(uri).use{input->checkNotNull(input);val buffer=ByteArray(256*1024);while(true){val n=input.read(buffer);if(n<0)break;digest.update(buffer,0,n);count+=n}}
                    val actual=digest.digest().joinToString(""){"%02x".format(it.toInt()and 255)}
                    check(count==receipt.getLong("length")&&actual==receipt.getString("sha256")){"Published file differs from verified export"}
                    p.put("status","done").put("published",uri.toString())
                }catch(error:Exception){p.put("status","blocked").put("error",JSONObject().put("stage","VERIFY").put("message",error.message.orEmpty()))}
            } else if(state==StoredExportState.UNKNOWN||state==StoredExportState.PENDING) p.put("status","blocked").put("error",JSONObject().put("stage","VERIFY").put("message","Не удалось определить, опубликован ли файл. Повтор заблокирован, чтобы не создать дубликат."))
            else {p.remove("receipt");if(p.optString("status")!="failed")p.put("status","pending")}
        }
        save()
    }
    fun phases():ExportPhaseSnapshot {
        fun sum(stage:ExportStage)=(0 until rows.length()).sumOf{row(it).optJSONObject("phases")?.optLong(stage.name)?:0L}
        return ExportPhaseSnapshot(sum(ExportStage.SETUP),sum(ExportStage.DECODE),sum(ExportStage.EXIF),sum(ExportStage.SIMULATE),sum(ExportStage.GRADE),sum(ExportStage.ENCODE))
    }
    companion object {
        fun directory(context:Context)=File(context.filesDir,"batch-queues")
        fun load(context:Context,id:String):BatchQueue {
            require(id.matches(Regex("[a-f0-9-]{36}")))
            val file=File(directory(context),"$id.json")
            val doc=AtomicFile(file).openRead().bufferedReader().use{JSONObject(it.readText())}
            require(doc.getInt("schema")==1&&doc.getString("id")==id)
            return BatchQueue(file,doc)
        }
        fun list(context:Context):List<BatchQueue> = directory(context).listFiles().orEmpty().filter{it.extension=="json"}.sortedByDescending{it.lastModified()}.mapNotNull{file->runCatching{load(context,file.nameWithoutExtension)}.getOrNull()}
        suspend fun create(context:Context,sources:List<BatchExportSource>,edits:BatchEditSource,options:ExportOptions,keepGps:Boolean):BatchQueue {
            val photos=JSONArray()
            for(source in sources) {
                val edit=when(edits){is BatchEditSource.SharedLook->sharedLookEdit(edits.look);is BatchEditSource.OwnEdits->edits.editFor(source)}
                edit.state.localAdjustments=edit.adjustments
                photos.put(JSONObject().put("source",source.uri.toString()).put("name",source.name).put("kind",source.kind.name).put("recipe",Presets.encode(edit.state)).put("rotation",edit.rotation.degrees).put("status","pending"))
            }
            val id=UUID.randomUUID().toString()
            val opts=JSONObject().put("format",options.format.name).put("quality",options.jpegQuality).put("size",options.size.name).put("edge",options.customLongEdge).put("name",options.customName).put("border",options.border.name).put("sharpen",options.sharpen.name).put("frame",options.frame.toJson())
            return BatchQueue(File(directory(context),"$id.json"),JSONObject().put("schema",1).put("id",id).put("createdAt",System.currentTimeMillis()).put("keepGps",keepGps).put("options",opts).put("photos",photos).put("state","running")).also{it.save()}
        }
    }
}
