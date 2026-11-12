package com.spectrafilm.app
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject

class LabMigrationTest {
 @Test fun defaultUsesUnmodifiedUpstreamRoute(){assertEquals("",ParamsState().toParams().experimentalJson)}
 @Test fun extensionsRoundTripIntoActualEngineParameters(){
  val s=ParamsState();s.setLab("grainRms",true);s.setLab("grainRmsRed",19.5f);s.setLab("layeredTransport.model","layered")
  val restored=ParamsState();Presets.decode(Presets.encode(s),restored)
  assertTrue(restored.labBoolean("grainRms"));assertEquals(19.5f,restored.labNumber("grainRmsRed"),0f)
  assertEquals("layered",JSONObject(restored.toParams().experimentalJson).getJSONObject("layeredTransport").getString("model"))
 }
 @Test fun resettingOneNativeCategoryDoesNotClearOtherExtensions(){
  val s=ParamsState();s.setLab("grainRms",true);s.setLab("dirLangmuir",true);s.setLab("outputModel.mode","lab-scan")
  Presets.decode(categoryDefaults(Category.GRAIN)!!,s);s.resetLabCategory(Category.GRAIN)
  assertFalse(s.labBoolean("grainRms"));assertTrue(s.labBoolean("dirLangmuir"));assertEquals("lab-scan",s.labString("outputModel.mode"))
 }
 @Test fun trueNegativeWorkflowControlsPaperIndependentlyOfOutput(){
  val s=ParamsState();s.setLab("outputModel.mode","lab-scan");assertTrue(s.toParams().io.scanFilm)
  s.setLab("workflow","negative-print");assertFalse(s.toParams().io.scanFilm)
  s.setLab("workflow","negative-scan");assertTrue(s.toParams().io.scanFilm)
 }
 @Test fun legacy956RecipePreservesSharedAndSpecialisedControls(){
  val p=JSONObject().put("filmStock","kodak_gold_200").put("printPaper","kodak_portra_endura").put("exposureCompensationEv",-1.5).put("grainParticleArea",.08).put("filmGamma",1.4).put("experimental",JSONObject().put("grainRms",true).put("grainRmsRed",23.5)).put("prep",JSONObject().put("exposure",.45)).put("output",JSONObject().put("mode","lab-scan"))
  val source=JSONObject().put("app","kirillkovaya-plenka").put("version",1).put("params",p)
  val s=ParamsState();Presets.decode(Presets.parseImportJson(source.toString()),s)
  assertEquals(-1.5f,s.exposureCompensationEv,0f);assertEquals(.08f,s.grainParticleAreaUm2,0f);assertEquals(1.4f,s.filmGammaFactor,0f);assertEquals(23.5f,s.labNumber("grainRmsRed"),0f);assertEquals(.45f,s.labNumber("negsPrep.exposure"),0f)
 }
 @Test fun dxIsAnActualSerializableBorderGeometryChange(){
  val plain=FrameSpec(FilmBorder.STRIP_135);val dx=plain.copy(look=plain.look.copy(dxBarcode=true))
  assertNotEquals(plain.key(),dx.key());assertTrue(FrameLook.fromJson(dx.look.toJson()).dxBarcode)
  val layout=FilmBorderGeometry.layout(dx,800,600)!!;assertTrue(layout.dxInk.isNotEmpty())
  for(r in layout.dxInk)assertTrue(r.top>=layout.image.bottom || r.left>=layout.image.right)
 }
 @Test fun virtualEnlargerKeepsFiveBoundedExposureSteps(){
  assertEquals(listOf(.5f,.70710677f,1f,1.4142135f,2f),labPrintTrials(1f,.5f));assertTrue(labPrintTrials(3f,1f).all{it in .2f..3f})
 }
 @Test fun clearingNestedOverrideRestoresOriginalFastRoute(){
  val s=ParamsState();s.setLab("layeredTransport.model","layered");s.setLab("layeredTransport.model",null)
  assertEquals("",s.toParams().experimentalJson)
 }
 @Test fun invalidNestedRecipesAreRejectedBeforeEngineCalls(){
  assertThrows(IllegalArgumentException::class.java){validateLabJson("{\"workflow\":\"unknown\"}")}
  assertThrows(IllegalArgumentException::class.java){validateLabJson("{\"x\":[1,2,3]}")}
 }
}
