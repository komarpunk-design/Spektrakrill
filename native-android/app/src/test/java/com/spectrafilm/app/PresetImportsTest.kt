package com.spectrafilm.app
import android.net.Uri
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PresetImportsTest {
 private fun parse(s:String)=PresetImports.parse(s)
 private fun native(ev:Double=.75)=JSONObject(Presets.toJsonString(ParamsState())).apply{getJSONObject("camera").put("exposureCompensationEv",ev)}
 private fun resource(n:String)=javaClass.getResource("/presets/$n")!!.readText()
 @Test fun importsAnActual956ExportWithItsNameAndEmulsionParameters(){
  val p=parse(resource("lab956.json")).single();val s=ParamsState();Presets.decode(JSONObject(p.json),s)
  assertEquals("Тёплый день",p.name);assertEquals("kodak_gold_200",s.filmProfile);assertEquals(21.25f,s.labNumber("grainRmsRed"),0f);assertTrue(s.labBoolean("grainRms"))
  assertEquals(78f,s.halScatterTailWeightPct.first,.0001f);assertEquals(5f,s.halHalationStrengthPct.first,.0001f)
 }
 @Test fun importsAll27AuthoredFactoryPresets(){
  val result=parse(resource("factory956.json"));assertEquals(27,result.size)
  val first=JSONObject(result.first().json);val raw=JSONObject(resource("factory956.json")).getJSONArray("presets").getJSONObject(0).getJSONObject("params")
  val s=ParamsState();Presets.decode(first,s);assertEquals(raw.getString("filmProfile"),s.filmProfile)
  assertEquals(raw.getJSONObject("camera").getDouble("exposureCompensationEv").toFloat(),s.exposureCompensationEv,0f)
  assertEquals(raw.getJSONObject("filmRender").getDouble("densityCurveGamma").toFloat(),s.filmGammaFactor,0f)
 }
 @Test fun wrappedNativeRecipeDoesNotSilentlyApplyDefaults(){
  val p=parse(JSONObject().put("name","Exact").put("params",native(1.75)).toString()).single();val s=ParamsState();Presets.decode(JSONObject(p.json),s);assertEquals(1.75f,s.exposureCompensationEv,0f)
 }
 @Test fun acceptsBomCodeFenceAndArray(){
  assertEquals(2,parse("\uFEFF```json\n[${native()},${native(-2.0)}]\n```").size)
 }
 @Test fun handlesOlderLabWithoutExperimentalBlock(){
  val p=parse("{\"name\":\"Old\",\"params\":{\"filmStock\":\"kodak_portra_400\",\"grainActive\":false}}").single();val s=ParamsState();Presets.decode(JSONObject(p.json),s);assertFalse(s.grainActive)
 }
 @Test fun missingLegacyFilmKeepsCurrentMaterialAndExplainsIt(){
  val p=parse("{\"filmStock\":\"none\",\"filmGamma\":1.25}").single();assertTrue(p.note.isNotBlank())
  val s=ParamsState();s.filmProfile="kodak_gold_200";Presets.decodeLook(JSONObject(p.json),s);assertEquals("kodak_gold_200",s.filmProfile)
 }
 @Test fun rejectsAnUnknownObjectInsteadOfReportingSuccess(){assertThrows(IllegalArgumentException::class.java){parse("{\"hello\":42}")}}
 @Test fun rejectsAFilmProfileWithAnExplanation(){val e=assertThrows(IllegalArgumentException::class.java){parse("{\"info\":{},\"data\":{}}")} ;assertTrue(e.message!!.contains("профиль"))}
 @Test fun rejectsFutureAndRoundedVersions(){for(v in listOf("3","2.0000000000000001"))assertThrows(IllegalArgumentException::class.java){parse("{\"schema\":\"$PRESET_SCHEMA_ID\",\"version\":$v,\"camera\":{\"autoExposure\":false}}")}}
 @Test fun validatesTheWholePackBeforeAnySave(){val bad=native().apply{getJSONObject("grain").put("nSubLayers",6)};assertThrows(IllegalArgumentException::class.java){parse("{\"presets\":[${native()},$bad]}")}}
 @Test fun convertsPythonGuiNamesAndFractions(){
  val p=parse("""{"simulation":{"film_stock":"fujifilm_c200","print_paper":"kodak_portra_endura"},"camera":{"exposure_compensation_ev":0.25,"auto_exposure":false},"film_render":{"halation":{"halation_strength":[0.05,0.015,0]}}}""").single()
  val s=ParamsState();Presets.decode(JSONObject(p.json),s);assertEquals("fujifilm_c200",s.filmProfile);assertEquals(.25f,s.exposureCompensationEv,0f);assertFalse(s.autoExposure);assertEquals(Triple(5f,1.5f,0f),s.halHalationStrengthPct)
 }
 @Test fun retainsUnicodeNamesAndBlocksPaths(){assertEquals("Мягкий свет",Presets.resolveName("Мягкий свет"));assertEquals("______x",Presets.resolveName("../../x"))}
 @Test fun unsupportedFieldsAreExplainedAndOriginalValuesAreKept(){
  val p=parse("""{"filmProfile":"kodak_portra_400","io":{"scanFilm":true},"settings":{"futureTool":1.25}}""").single()
  assertTrue(p.note.contains("settings.futureTool"));assertEquals(1.25,JSONObject(p.json).getJSONObject("sourcePreset").getJSONObject("settings").getDouble("futureTool"),0.0)
 }
 @Test fun ordinaryAuthoredPresetsDoNotEnableInactiveLabModels(){
  val p=parse("""{"filmProfile":"kodak_portra_400","io":{"scanFilm":true},"filmRender":{"grain":{"densityMin":[0.1,0.1,0.1],"uniformity":[0.97,0.97,0.97]}}}""").single()
  val s=ParamsState();Presets.decode(JSONObject(p.json),s);assertEquals("",s.labEngineJson())
 }
 @Test fun applyingAnImportedLookKeepsThePhotosFraming(){
  val source=ParamsState().apply{crop=true;cropCenter=.2f to .3f;filmGammaFactor=1.4f}
  val p=parse(Presets.toJsonString(source)).single();val target=ParamsState().apply{crop=false;cropCenter=.6f to .7f}
  Presets.decodeLook(JSONObject(p.json),target);assertFalse(target.crop);assertEquals(.6f to .7f,target.cropCenter);assertEquals(1.4f,target.filmGammaFactor,0f)
 }
 private class Repo:PresetRepository {
  val files=linkedMapOf<String,String>();var failAfter:Int?=null;var writes=0
  override fun list()=files.keys.toList();override fun read(name:String)=files.getValue(name)
  override fun readUri(uri:Uri)=error("unused");override fun exportJson(uri:Uri,json:String){}
  override fun saveJson(name:String,json:String){if(failAfter!=null&&writes++>=failAfter!!)error("disk full");files[name]=json}
  override fun delete(name:String){files.remove(name)};override fun exists(name:String)=name in files
  override fun resolveName(name:String)=Presets.resolveName(name)
 }
 @Test fun duplicatesNeverOverwriteExistingPresets(){val r=Repo();r.files["Мой"]="old";val p=parse(native().put("name","Мой").toString()).single();assertEquals(listOf("Мой - 2","Мой - 3"),PresetImports.store(r,listOf(p,p)));assertEquals("old",r.files["Мой"])}
 @Test fun aFailedWriteRollsBackOnlyThisImport(){val r=Repo();r.files["existing"]="original";r.failAfter=1;val ps=parse("[${native().put("name","a")},${native().put("name","b")}]");assertThrows(Exception::class.java){PresetImports.store(r,ps)};assertEquals(mapOf("existing" to "original"),r.files)}
}
