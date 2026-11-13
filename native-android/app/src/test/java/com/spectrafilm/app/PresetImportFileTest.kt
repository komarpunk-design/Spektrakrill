package com.spectrafilm.app
import android.content.Intent
import android.app.Activity
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.junit4.v2.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowContentResolver

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class PresetImportFileTest {
 @get:Rule(order=0) val host=ComposeHostActivityRule()
 @get:Rule(order=1) val compose=createComposeRule()
 @Test fun safFileImportCreatesAStoredPresetAndDoesNotModifyThePhoto(){
  val ctx=RuntimeEnvironment.getApplication();val repo=FilePresetRepository(ctx);val vm=PresetViewModel()
  val state=ParamsState().apply{exposureCompensationEv=-2f};val before=Presets.toJsonString(state)
  val raw="\uFEFF"+org.json.JSONObject(Presets.toJsonString(ParamsState().apply{exposureCompensationEv=1.75f})).put("name","Мой JSON").toString()
  val uri=Uri.parse("content://test.presets/recipe.json")
  shadowOf(ctx.contentResolver).registerInputStream(uri,raw.byteInputStream())
  lateinit var files:EditorPresetFiles;lateinit var activity:ComponentActivity;var added=emptyList<String>()
  compose.setContent {
   activity=LocalActivity.current as ComponentActivity
   files=rememberEditorPresetFiles(ctx,rememberCoroutineScope(),AppDispatchers(),state,repo,remember{mutableStateOf(null)},remember{mutableStateOf(null)},vm,{added=it},{})
  }
  compose.runOnIdle{files.presetImporter.launch(arrayOf("application/json"))}
  compose.runOnIdle {
   val started=shadowOf(activity).nextStartedActivityForResult
   assertEquals(Intent.ACTION_OPEN_DOCUMENT,started.intent.action)
   shadowOf(activity).receiveResult(started.intent,Activity.RESULT_OK,Intent().setData(uri))
  }
  compose.waitUntil(10000){!vm.current.importing&&added.isNotEmpty()}
  assertEquals(listOf("Мой JSON"),added);assertTrue(repo.exists("Мой JSON"))
  val loaded=ParamsState();Presets.decode(org.json.JSONObject(repo.read("Мой JSON")),loaded)
  assertEquals(1.75f,loaded.exposureCompensationEv,0f);assertEquals(before,Presets.toJsonString(state))
  assertTrue(vm.current.importMessage.contains("Добавлено"))
 }
 @Test fun aReadErrorRemainsVisibleAndDoesNotChangeExistingPresets(){
  val ctx=RuntimeEnvironment.getApplication();val real=FilePresetRepository(ctx);val vm=PresetViewModel();val state=ParamsState()
  val repo=object:PresetRepository by real {override fun readImport(uri:Uri):String=throw java.io.IOException("Нет доступа к файлу")}
  lateinit var files:EditorPresetFiles;lateinit var activity:ComponentActivity
  compose.setContent{activity=LocalActivity.current as ComponentActivity;files=rememberEditorPresetFiles(ctx,rememberCoroutineScope(),AppDispatchers(),state,repo,remember{mutableStateOf(null)},remember{mutableStateOf(null)},vm,{}, {})}
  compose.runOnIdle{files.presetImporter.launch(arrayOf("*/*"))}
  compose.runOnIdle{val i=shadowOf(activity).nextStartedActivityForResult;shadowOf(activity).receiveResult(i.intent,Activity.RESULT_OK,Intent().setData(Uri.parse("content://test.presets/missing")))}
  compose.waitUntil(10000){!vm.current.importing&&vm.current.importMessage.isNotBlank()}
  assertTrue(vm.current.importMessage.contains("Нет доступа к файлу"));assertTrue(real.list().isEmpty())
 }
}
