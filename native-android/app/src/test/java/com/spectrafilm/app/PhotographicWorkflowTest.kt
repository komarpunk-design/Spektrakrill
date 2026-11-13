package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test

class PhotographicWorkflowTest {
 @Test fun restoresTheSevenStagesIn956Order(){
  assertEquals(listOf("Камера","Плёнка","Проявка","Эффекты","Печать","Скан","Финиш"),PhotoStage.entries.map{it.title})
 }
 @Test fun every956ToolKeepsItsStageAndRelativeOrder(){
  val expected=listOf(
   listOf("exposure","balance","prep","lens","taking-filter","input-color"),
   listOf("films","format","spectrum","film-base","profile"),
   listOf("develop","chemistry","dir"),listOf("grain","halation"),
   listOf("output","paper","paper-base","test-print"),listOf("scan","negative"),
   listOf("crop","frame","tone","output-color","export"))
  PhotoStage.entries.forEachIndexed{i,stage->assertEquals(expected[i],photoTools(stage).map{it.id}.filter{it in expected.flatten()})}
 }
 @Test fun everyNativeToolStillHasADestination(){
  assertEquals(Category.entries.toSet(),PhotoTool.entries.flatMap{it.categories.toList()}.toSet())
  assertEquals(PhotoTool.entries.size,PhotoTool.entries.map{it.id}.toSet().size)
 }
 @Test fun labScanAndRealNegativeHaveDistinctDirectRoutes(){
  assertEquals(PhotoTool.OUTPUT,photoTools(PhotoStage.PRINT).first())
  assertTrue(PhotoTool.NEGATIVE in photoTools(PhotoStage.SCAN))
  assertFalse(PhotoTool.NEGATIVE in photoTools(PhotoStage.PRINT))
 }
 @Test fun ambiguousNativeCategoryRestoresTheSavedWorkflowTool(){
  assertEquals(PhotoTool.OUTPUT,resolvePhotoTool("output",Category.SCANNER))
  assertEquals(PhotoTool.PREP,resolvePhotoTool("prep",Category.EXPOSURE))
  assertEquals(PhotoTool.NEGATIVE,resolvePhotoTool("negative",Category.EXPERIMENTAL))
  assertEquals(PhotoTool.FILMS,resolvePhotoTool("output",Category.SIMULATION))
 }
 @Test fun resettingPrepDoesNotResetExposureOrOutputs(){
  val s=ParamsState();s.exposureCompensationEv=1.5f;s.setLab("negsPrep.exposure",.5f);s.setLab("outputModel.mode","lab-scan")
  PhotoTool.PREP.reset(s)
  assertEquals(1.5f,s.exposureCompensationEv,0f);assertNull(s.labObject().valueAt("negsPrep.exposure"));assertEquals("lab-scan",s.labString("outputModel.mode"))
 }
 @Test fun resettingDigitalOutputKeepsScannerAndGrain(){
  val s=ParamsState();s.scanFilm=true;s.scanLensBlur=3.5f;s.grainBlur=1.1f;s.setLab("outputModel.mode","lab-scan")
  PhotoTool.OUTPUT.reset(s)
  assertFalse(s.scanFilm);assertEquals(3.5f,s.scanLensBlur,0f);assertEquals(1.1f,s.grainBlur,0f);assertNull(s.labObject().valueAt("outputModel.mode"))
 }
 @Test fun inputScopesRetainEveryOriginalInputParameter(){
  val keys=Presets.encode(PARAM_DEFAULTS).getJSONObject("input").keys().asSequence().map{"input.$it"}.toSet()
  assertTrue("Missing input controls: ${keys-PhotoTool.entries.flatMap{it.nativePaths()}.toSet()}",PhotoTool.entries.flatMap{it.nativePaths()}.toSet().containsAll(keys))
 }
 @Test fun resettingSpectrumDoesNotChangeUvOrOutputSize(){
  val s=ParamsState();s.filterUv=Triple(.5f,410f,8f);s.upscaleFactor=2f;s.spectralGaussianBlur=4f;s.setLab("spectralMethod","otsu2018")
  PhotoTool.SPECTRUM.reset(s)
  assertEquals(Triple(.5f,410f,8f),s.filterUv);assertEquals(2f,s.upscaleFactor,0f);assertEquals(PARAM_DEFAULTS.spectralGaussianBlur,s.spectralGaussianBlur,0f);assertNull(s.labObject().valueAt("spectralMethod"))
 }
 @Test fun bypassedToolsExplainTheCurrentRouteWithoutClearingSettings(){
  val s=ParamsState();s.setLab("workflow","negative-scan");s.setLab("grainRms",true)
  assertNotNull(PhotoTool.GRAIN.bypassReason(s));assertNotNull(PhotoTool.PAPER.bypassReason(s));assertNull(PhotoTool.NEGATIVE.bypassReason(s));assertTrue(s.labBoolean("grainRms"))
 }
}
