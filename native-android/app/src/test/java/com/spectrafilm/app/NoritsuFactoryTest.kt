package com.spectrafilm.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class NoritsuFactoryTest {
    private fun factory()=RuntimeEnvironment.getApplication().assets.open("lab/noritsu-factory-experimental.json").bufferedReader().use{it.readText()}
    @Before fun catalog(){LabCatalog.initialize(RuntimeEnvironment.getApplication())}

    @Test fun builtinIsExplicitlyFactoryCalculatedAndContainsAllStages(){
        val job=validateNoritsuJob(JSONObject(factory()))
        assertEquals("factory-calculated",job.getString("origin"))
        assertTrue(job.getString("context").contains("синтетического"))
        assertEquals(16,job.getInt("outputBits"))
        for(key in listOf("filmSharpHex","hueLatticeHex","autoContrast"))assertTrue(job.has(key))
        assertEquals("bb4e029c1d6fb94470c5c26f1a8a60d70752a832ff84356f8db62dd91edfdf81",job.getString("sourceSha256"))
        val a=job.getJSONObject("autoContrast")
        val y=a.getJSONArray("y");assertTrue((1 until y.length()).all{y.getInt(it)>=y.getInt(it-1)})
    }

    @Test fun builtinEnablesMatchingInputAndAllStagesWithoutResettingFilmOrOperator(){
        val s=ParamsState().apply{filmProfile="kodak_gold_200";exposureCompensationEv=.7f;setLab("outputModel.exposure",.3)}
        s.useFactoryNoritsuJob(factory())
        assertEquals("kodak_gold_200",s.filmProfile);assertEquals(.7f,s.exposureCompensationEv,0f)
        assertEquals(.3f,s.labNumber("outputModel.exposure"),1e-6f)
        assertEquals("noritsu-ls600",s.labString("outputModel.mode"))
        NORITSU_JOB_KEYS.forEach{assertTrue(s.labBoolean("outputModel.$it"))}
        assertTrue(JSONObject(s.toParams().experimentalJson).getJSONObject("outputModel").getBoolean("noritsuJobNormalize"))
        val restored=ParamsState().apply{negativeSourceKey=s.negativeSourceKey};Presets.decode(Presets.encode(s),restored)
        assertEquals(s.toParams(),restored.toParams())
        restored.resetScanCorrections()
        NORITSU_JOB_KEYS.forEach{assertFalse(restored.labBoolean("outputModel.$it"))}
        assertTrue(restored.labObject().has("noritsuJob"))
    }

    @Test fun factoryKernel258IsAcceptedOnlyInVerifiedLumaDomain(){
        val job=JSONObject(factory());validateNoritsuJob(job)
        val offsets=job.getJSONObject("rgbToYcc").getJSONArray("offsets")
        for(i in 0..2)offsets.put(i,0)
        assertThrows(IllegalArgumentException::class.java){validateNoritsuJob(job)}
    }

    @Test fun replacingAJobReconcilesDependenciesInEverySavedScanVariant(){
        val s=ParamsState();s.useFactoryNoritsuJob(factory());s.startNegativeWorkspace();s.addScanVariant()
        val smaller=JSONObject(factory());smaller.remove("autoContrast");smaller.remove("filmSharpHex")
        s.installNoritsuJob(smaller.toString())
        val saved=Presets.encode(s);val restored=ParamsState();Presets.decode(saved,restored)
        for(i in 0..1){restored.selectScanVariant(i);assertFalse(restored.labBoolean("outputModel.noritsuLocalContrast"));assertFalse(restored.labBoolean("outputModel.noritsuFilmSharp"))}
    }

    @Test fun presetAmountDoesNotCreateFractionalFactoryJobParameters(){
        val s=ParamsState();s.useFactoryNoritsuJob(factory());val before=Presets.encode(s)
        val after=JSONObject(before.toString());val job=after.getJSONObject("spektrafilmLab").getJSONObject("noritsuJob")
        job.put("name","Другой комплект");job.getJSONObject("autoContrast").put("strength",127)
        for(amount in listOf(.25f,.75f)){
            val blend=PresetAmount.blend(before,after,amount);Presets.decode(blend,ParamsState())
            val result=blend.getJSONObject("spektrafilmLab").getJSONObject("noritsuJob")
            assertEquals(if(amount<.5f)128 else 127,result.getJSONObject("autoContrast").getInt("strength"))
        }
    }

    @Test fun builtinReferenceStaysSmallAndDoesNotInvalidateFrozenFilm(){
        val s=ParamsState().apply{negativeSourceKey="PHOTO|content://one|0";chooseScanReceiver("noritsu-ls600")}
        s.startNegativeWorkspace();s.freezeNegative();val frozen=s.frozenNegativeCacheKey()
        s.useBuiltinFactoryNoritsuJob()
        assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"))
        assertFalse(s.labObject().has("noritsuJob"));assertTrue(s.labJson.length<1024)
        assertEquals(frozen,s.frozenNegativeCacheKey())
        val restored=ParamsState().apply{negativeSourceKey=s.negativeSourceKey};Presets.decode(Presets.encode(s),restored)
        assertEquals(s.toParams(),restored.toParams())
        assertTrue(restored.toParams().experimentalJson.contains("noritsuJobId"))
    }

    @Test fun amountSwitchesWholeSourcesBetweenCustomBuiltinAndLegacyRecipes(){
        val s=ParamsState();s.useFactoryNoritsuJob(factory());val custom=Presets.encode(s)
        s.useBuiltinFactoryNoritsuJob();val builtin=Presets.encode(s)
        val legacy=Presets.encode(ParamsState().apply{chooseScanReceiver("noritsu-ls600")})
        for((base,full)in listOf(custom to builtin,builtin to custom,builtin to legacy,legacy to builtin)) {
            for(amount in listOf(0f,.25f,.75f,1f)) {
                val mixed=PresetAmount.blend(base,full,amount);val target=ParamsState();Presets.decode(mixed,target)
                if(amount==1f)assertEquals(full.toString(),mixed.toString())
                val lab=target.labObject();assertFalse(lab.has("noritsuJob")&&lab.has("noritsuJobId"))
            }
        }
    }

    @Test fun dormantFactoryDataDoesNotDisableBoundedPaperExport() {
        val s=ParamsState();s.useBuiltinFactoryNoritsuJob()
        s.setLab("outputModel.mode","paper")
        assertEquals("",s.labEngineJson())
        assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"))
        s.chooseScanReceiver("noritsu-ls600")
        assertTrue(s.labEngineJson().contains("noritsuJobId"))
    }

    @Test fun unknownOrAmbiguousBuiltinReferenceIsRejectedAtomically(){
        val s=ParamsState();val before=Presets.encode(s).toString()
        for(lab in listOf(JSONObject().put("noritsuJobId","unknown"),JSONObject().put("noritsuJobId",NORITSU_FACTORY_ID).put("noritsuJob",JSONObject(factory())))) {
            assertThrows(IllegalArgumentException::class.java){Presets.decode(JSONObject().put("spektrafilmLab",lab),s)}
            assertEquals(before,Presets.encode(s).toString())
        }
    }
}
