package com.spectrafilm.app
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class NoritsuJobTest {
 private fun fixture()=javaClass.getResource("/noritsu/synthetic-job.json")!!.readText()
 @Test fun jobImportIsAtomicAndDoesNotEnableAProcessingStage() {
  val s=ParamsState().apply { chooseScanReceiver("noritsu-ls600");setLab("outputModel.exposure",.7) }
  s.installNoritsuJob(fixture())
  assertEquals(.7f,s.labNumber("outputModel.exposure"),1e-6f)
  assertEquals("synthetic-test",s.labObject().getJSONObject("noritsuJob").getString("origin"))
  assertFalse(s.labBoolean("outputModel.noritsuJobEnabled"))
  val before=s.labJson
  val bad=JSONObject(fixture()).put("gammaBgrHex",org.json.JSONArray().put("0000"))
  assertThrows(Exception::class.java){s.installNoritsuJob(bad.toString())};assertEquals(before,s.labJson)
 }
 @Test fun completeJobAndStageSelectionRoundTripAndResetKeepsData() {
  val s=ParamsState();s.installNoritsuJob(fixture());s.chooseScanReceiver("noritsu-ls600")
  NORITSU_JOB_KEYS.forEach { s.setLab("outputModel.$it",true) }
  val copy=ParamsState();Presets.decode(Presets.encode(s),copy)
  assertEquals(s.toParams(),copy.toParams());assertTrue(copy.scanCorrectionsChanged())
  copy.resetScanCorrections();NORITSU_JOB_KEYS.forEach { assertFalse(copy.labBoolean("outputModel.$it")) }
  assertTrue(copy.labObject().has("noritsuJob"));assertEquals("noritsu-ls600",copy.labString("outputModel.mode"))
 }
 @Test fun missingDependencyCannotBeEnabledByAnImportedRecipe() {
  val s=ParamsState();val before=Presets.encode(s).toString()
  val bad=JSONObject().put("spektrafilmLab",JSONObject().put("outputModel",JSONObject().put("mode","noritsu-ls600").put("noritsuJobEnabled",true)))
  assertThrows(Exception::class.java){Presets.decode(bad,s)};assertEquals(before,Presets.encode(s).toString())
  val job=JSONObject(fixture());job.remove("filmSharpHex")
  val json=JSONObject().put("noritsuJob",job).put("outputModel",JSONObject().put("noritsuJobEnabled",true).put("noritsuFilmSharp",true))
  assertThrows(Exception::class.java){validateLabJson(json.toString())}
 }
 @Test fun cachedReadsStayCurrentAndNeverExposeMutableContainers() {
  val s=ParamsState();s.installNoritsuJob(fixture());s.setLab("outputModel.noritsuGamma",.7)
  assertEquals(.7f,s.labNumber("outputModel.noritsuGamma"),1e-6f)
  val model=s.labOverrideValue("outputModel") as JSONObject;model.put("noritsuGamma",99)
  assertEquals(.7f,s.labNumber("outputModel.noritsuGamma"),1e-6f)
  s.setLab("outputModel.noritsuGamma",1.4);assertEquals(1.4f,s.labNumber("outputModel.noritsuGamma"),1e-6f)
  s.labJson="";assertNull(s.labOverrideValue("noritsuJob"))
 }
 @Test fun malformedBinaryBlocksAndOversizedArraysAreRejectedBeforeRender() {
  val base=JSONObject(fixture())
  for(field in listOf("gammaBgrHex","hueLatticeHex","filmSharpHex")) {
   val bad=JSONObject(base.toString());bad.put(field,org.json.JSONArray().put("zz"))
   assertThrows(Exception::class.java){validateNoritsuJob(bad)}
  }
  val malformedHex=JSONObject(base.toString());val arr=malformedHex.getJSONArray("gammaBgrHex");arr.put(0,"+1"+arr.getString(0).drop(2))
  assertThrows(Exception::class.java){validateNoritsuJob(malformedHex)}
  val bad=JSONObject(base.toString());bad.getJSONObject("autoContrast").put("factor",3)
  assertThrows(Exception::class.java){validateNoritsuJob(bad)}
 }
}
