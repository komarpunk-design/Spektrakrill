package com.spectrafilm.app
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class FilmFirstDefaultsTest {
 private val ctx get()=RuntimeEnvironment.getApplication()
 @Test fun freshColorFilmAutomaticallyUsesProfileArcticAndAdvancedCompatibleModels(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",fresh=true)
  assertEquals("arctic2026beta04",s.labString("spectralMethod"))
  assertEquals("layered",s.labString("layeredTransport.model"))
  assertTrue(s.grainActive);assertTrue(s.halationActive);assertTrue(s.couplersActive)
  assertTrue(s.labBoolean("grainRms"));assertTrue(s.labBoolean("dirLangmuir"))
  assertEquals(4.5f,s.labNumber("grainRmsRed"),0f)
  assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"));NORITSU_JOB_KEYS.forEach{assertTrue(s.labBoolean("outputModel.$it"))}
  Presets.decode(Presets.encode(s),ParamsState())
 }
 @Test fun changingFilmResetsItsCharacterButPreservesExposureCropAndChosenNikon(){
  val s=ParamsState();s.applyFilmFirstDefaults(ctx,"kodak_portra_400",fresh=true)
  s.chooseScanReceiver("nikon-scan");s.exposureCompensationEv=.75f;s.grainParticleAreaUm2=5f;s.setLab("grainRmsRed",99)
  s.applyFilmFirstDefaults(ctx,"kodak_gold_200")
  assertEquals("nikon-scan",s.labString("outputModel.mode"));assertEquals(.75f,s.exposureCompensationEv,0f)
  assertEquals(PARAM_DEFAULTS.grainParticleAreaUm2,s.grainParticleAreaUm2,0f)
  assertNotEquals(99f,s.labNumber("grainRmsRed"))
  assertEquals("arctic2026beta04",s.labString("spectralMethod"))
 }
 @Test fun monochromeAndSlidesNeverReceiveColorNegativeScannerOrInterlayerDir(){
  for(id in listOf("negs_ilford_hp5_plus_6p5min","fujifilm_velvia_100")){
   val s=ParamsState();s.applyFilmFirstDefaults(ctx,id,fresh=true)
   assertFalse(s.labBoolean("outputModel.noritsuJobEnabled"));assertNotEquals("noritsu-ls600",s.labString("outputModel.mode"))
   if(id.startsWith("negs_ilford")){assertFalse(s.couplersActive);assertFalse(s.labBoolean("dirLangmuir"))}
   assertEquals("arctic2026beta04",s.labString("spectralMethod"));Presets.decode(Presets.encode(s),ParamsState())
  }
 }
 @Test fun everyBundledStockGetsSerializableAutomaticSettings(){
  val stocks=org.json.JSONObject(ctx.assets.open("lab/stocks.json").bufferedReader().use{it.readText()})
  for(id in stocks.keys()){
   val s=ParamsState();s.applyFilmFirstDefaults(ctx,id,fresh=true)
   assertEquals(id,s.filmProfile);assertEquals("arctic2026beta04",s.labString("spectralMethod"))
   val restored=ParamsState();Presets.decode(Presets.encode(s),restored)
   assertEquals(id,s.toParams(),restored.toParams())
  }
 }
 @Test fun oldFullRecipesStillRestoreExactlyAndNeverInheritNewDefaultModels(){
  val old=ParamsState();old.grainBlur=1.1f;val recipe=Presets.encode(old)
  val target=ParamsState();target.applyFilmFirstDefaults(ctx,"kodak_portra_400",fresh=true);Presets.decode(recipe,target)
  assertEquals(old.toParams(),target.toParams());assertEquals("",target.labJson)
 }
}
