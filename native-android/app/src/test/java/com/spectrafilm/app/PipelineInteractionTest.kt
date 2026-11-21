package com.spectrafilm.app
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class PipelineInteractionTest {
 private val ctx get()=RuntimeEnvironment.getApplication()
 @Test fun filmChangePreservesPaperGammaAndExplicitPaperRoute(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",true)
  s.setLab("outputModel.mode","paper");s.scanFilm=false;s.printGammaFactor=1.35f;s.printExposure=1.6f
  s.applyFilmFirstDefaults(ctx,"kodak_gold_200")
  assertEquals("paper",s.labString("outputModel.mode"));assertFalse(s.toParams().io.scanFilm)
  assertEquals(1.35f,s.printGammaFactor,0f);assertEquals(1.6f,s.printExposure,0f)
 }
 @Test fun filmTypesDoNotEraseSelectedScannerOrItsStageFlags(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",true)
  val output=s.labObject().getJSONObject("outputModel").toString()
  for(id in listOf("negs_ilford_hp5_plus_6p5min","fujifilm_velvia_100","kodak_gold_200")){
   s.applyFilmFirstDefaults(ctx,id);assertEquals(output,s.labObject().getJSONObject("outputModel").toString())
  }
 }
 @Test fun paperProfileResetDoesNotResetFilmPhysics(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",true)
  s.grainBlur=1.2f;s.filmGammaFactor=1.4f;s.printGammaFactor=1.35f;s.printExposure=1.6f
  s.morphActive=true;s.morphGammaFactorRed=1.3f;s.setLab("printBaseScale",1.2)
  val grain=s.labObject().get("grainRmsRed")
  s.resetPrintStockCharacter()
  assertEquals(1.2f,s.grainBlur,0f);assertEquals(1.4f,s.filmGammaFactor,0f);assertEquals(grain,s.labObject().get("grainRmsRed"))
  assertEquals(PARAM_DEFAULTS.printGammaFactor,s.printGammaFactor,0f);assertFalse(s.morphActive)
  assertEquals(1.6f,s.printExposure,0f);assertNull(s.labOverrideValue("printBaseScale"))
 }
 @Test fun switchingBackToBuiltinCannotApplyUnnormalizedCustomFlagsFromAnotherVariant(){
  val s=ParamsState();LabCatalog.initialize(ctx);s.installNoritsuJob(javaClass.getResource("/noritsu/synthetic-job.json")!!.readText())
  s.chooseScanReceiver("noritsu-ls600");s.setLab("outputModel.noritsuJobEnabled",true);s.startNegativeWorkspace();s.addScanVariant()
  s.useBuiltinFactoryNoritsuJob();s.selectScanVariant(0)
  assertFalse(s.labBoolean("outputModel.noritsuJobEnabled"));assertFalse(s.labBoolean("outputModel.noritsuJobNormalize"))
  s.selectScanVariant(1);assertTrue(s.labBoolean("outputModel.noritsuJobEnabled"));assertTrue(s.labBoolean("outputModel.noritsuJobNormalize"))
 }

 @Test fun clearNegativeIsNotAccidentallyProcessedByThePreviouslySelectedScanner(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",true)
  s.setLab("workflow","negative-clear")
  val engine=JSONObject(s.labEngineJson());assertFalse(engine.has("outputModel"));assertFalse(engine.has("noritsuJobId"))
  assertEquals("noritsu-ls600",s.labString("outputModel.mode"));assertTrue(s.labBoolean("outputModel.noritsuJobEnabled"))
  s.setLab("workflow","normal");assertTrue(JSONObject(s.labEngineJson()).has("noritsuJobId"))
 }
 @Test fun completeLegacyPresetAtStrongAmountDoesNotKeepArcticOrRmsFromTheBase(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",true)
  val mixed=PresetAmount.blend(Presets.encode(s),Presets.encode(ParamsState()),.75f)
  assertFalse(mixed.has("spektrafilmLab"));Presets.decode(mixed,ParamsState())
 }
 @Test fun presetAmountCannotKeepAnOldFrozenWorkspaceWhenTheTargetHasNone(){
  val s=ParamsState();s.chooseScanReceiver("lab-scan");s.startNegativeWorkspace()
  val base=Presets.encode(s);val target=Presets.encode(ParamsState())
  assertFalse(PresetAmount.blend(base,target,.75f).has("negativeWorkspace"))
  assertTrue(PresetAmount.blend(target,base,.75f).has("negativeWorkspace"))
 }
 @Test fun importingDifferentNoritsuJobDoesNotReuseFactoryInputCalibration(){
  val s=ParamsState();s.useBuiltinFactoryNoritsuJob();s.startNegativeWorkspace();s.addScanVariant()
  s.installNoritsuJob(javaClass.getResource("/noritsu/synthetic-job.json")!!.readText())
  for(index in 0..1){s.selectScanVariant(index);assertFalse(s.labBoolean("outputModel.noritsuJobEnabled"));assertFalse(s.labBoolean("outputModel.noritsuJobNormalize"))}
 }
}
