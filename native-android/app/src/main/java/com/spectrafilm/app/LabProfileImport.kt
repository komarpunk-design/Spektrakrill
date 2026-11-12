/* User materials use the real profile parser and the same catalogue/renderer. GPLv3. */
package com.spectrafilm.app
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.spectrafilm.engine.ProfileOverrides
import com.spectrafilm.engine.SpektraEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

internal object LabProfiles {
    var generation by mutableIntStateOf(0)
        private set
    private var cached: Map<String,StockEntry>?=null
    private fun root(ctx:Context)=File(ctx.filesDir,"lab-profiles").apply{mkdirs()}
    fun initialize(ctx:Context){ProfileOverrides.directory=root(ctx).absolutePath}
    fun entries(ctx:Context):Map<String,StockEntry> {
        cached?.let{return it}
        val f=File(root(ctx),".catalog.json");val j=if(f.isFile)runCatching{JSONObject(f.readText())}.getOrDefault(JSONObject())else JSONObject()
        return j.keys().asSequence().associateWith{id->val m=j.getJSONObject(id);StockEntry(id,m.getString("name"),"", "lab_custom",m.getString("kind"),null,null,"Свой импортированный материал",10000)}.also{cached=it}
    }
    fun importMaterial(ctx:Context,text:String):String {
        require(text.toByteArray().size<=2*1024*1024){"Профиль превышает 2 МБ"}
        val j=JSONObject(text);require(j.has("info")&&j.has("data")){"Нужен JSON спектрального профиля Spektrafilm"}
        SpektraEngine.nativeValidateLabProfile(text)
        val id="user_"+MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).take(10).joinToString(""){"%02x".format(it.toInt()and 255)}
        val dir=root(ctx);val file=File(dir,"$id.json")
        if(!file.exists())AtomicJsonStore.writeUtf8(file,text,2*1024*1024)
        val index=File(dir,".catalog.json");val map=if(index.isFile)JSONObject(index.readText())else JSONObject()
        val info=j.getJSONObject("info");val print=info.optString("stage")=="printing"
        map.put(id,JSONObject().put("name",info.optString("name",id)).put("kind",if(print)"print_paper"else"film"))
        AtomicJsonStore.writeUtf8(index,map.toString(),2*1024*1024);cached=null
        return id
    }
    fun profileText(ctx: Context, id: String): String {
        require(id.matches(Regex("[a-zA-Z0-9_-]+")))
        return if (id.startsWith("user_")) File(root(ctx),"$id.json").readText()
        else ctx.assets.open("spektra/profiles/$id.json").bufferedReader().use { it.readText() }
    }
    fun changed(){cached=null;generation++}
    fun archive(ctx:Context,id:String){
        require(id.matches(Regex("user_[0-9a-f]{20}")))
        val dir=root(ctx);val file=File(dir,"$id.json");val archive=File(dir,"archive").apply{mkdirs()}
        check(!file.exists()||file.renameTo(File(archive,file.name))){"Не удалось архивировать профиль"}
        val index=File(dir,".catalog.json");val map=if(index.isFile)JSONObject(index.readText())else JSONObject();map.remove(id)
        AtomicJsonStore.writeUtf8(index,map.toString(),2*1024*1024);changed()
    }
}
@Composable internal fun LabProfileImport(s:ParamsState) {
    val ctx=LocalContext.current;val scope=rememberCoroutineScope();var note by remember{mutableStateOf("")};var busy by remember{mutableStateOf(false)};var confirm by remember(s.filmProfile){mutableStateOf(false)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{
        busy=true
        try{val id=withContext(Dispatchers.IO){val bytes=ctx.contentResolver.openInputStream(uri)?.use{stream -> val out=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192); while(true){val count=stream.read(buffer);if(count<0)break;require(out.size()+count<=2*1024*1024){"Профиль превышает 2 МБ"};out.write(buffer,0,count)};out.toByteArray()}?:error("Не удалось открыть профиль");require(bytes.size<=2*1024*1024);LabProfiles.importMaterial(ctx,bytes.toString(Charsets.UTF_8))};LabProfiles.changed();val e=LabProfiles.entries(ctx)[id];if(e?.kind=="film")s.filmProfile=id else s.printProfile=id;note="Профиль добавлен в общий каталог."}
        catch(e:Exception){note=e.message?:"Не удалось импортировать профиль"}finally{busy=false}
    }}
    TextButton(enabled=!busy,onClick={picker.launch(arrayOf("application/json","text/plain","application/octet-stream"))}){Text(if(busy)"Импорт…"else"Импортировать свою плёнку / бумагу · JSON")}
    if(s.filmProfile.startsWith("user_"))TextButton(onClick={if(!confirm)confirm=true else{LabProfiles.archive(ctx,s.filmProfile);s.filmProfile="kodak_portra_400";note="Материал убран из каталога. Исходный JSON сохранён в архиве приложения."}}){Text(if(confirm)"Подтвердить удаление из каталога"else"Убрать свой профиль из каталога")}
    if(note.isNotBlank())LabNote(note)
}
