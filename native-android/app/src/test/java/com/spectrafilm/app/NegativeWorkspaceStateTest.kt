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
@Config(sdk = [35])
class NegativeWorkspaceStateTest {
    @Before fun catalog() { LabCatalog.initialize(RuntimeEnvironment.getApplication()) }
    private fun state() = ParamsState().apply {
        negativeSourceKey = "RAW|content://photos/one|0"
        chooseScanReceiver("noritsu-ls600")
        startNegativeWorkspace()
    }

    @Test fun frozenNegativeSurvivesAllScannerEditsAndViews() {
        val s = state(); s.freezeNegative()
        val key = s.frozenNegativeCacheKey()
        assertNotNull(key)
        for(mode in SCAN_RECEIVER_MODES) {
            s.chooseScanReceiver(mode); s.setLab("outputModel.exposure", .75)
            s.setLab("outputModel.noritsuGamma", 1.2); s.scanLensBlur = 2f
            s.scanUnsharpMask = 1.3f to .7f
            assertEquals(key, s.frozenNegativeCacheKey())
            s.showVirtualNegative(true)
            assertEquals("negative", s.labString("outputModel.mode"))
            assertEquals("normal", s.labString("workflow", "normal"))
            assertEquals(key, s.frozenNegativeCacheKey())
            s.showVirtualNegative(false)
            assertEquals(mode, s.labString("outputModel.mode"))
        }
        assertEquals(key, JSONObject(s.toParams().experimentalJson).getString("virtualNegative"))
        assertFalse(JSONObject(s.toParams(filmOverride="kodak_portra_800").experimentalJson).has("virtualNegative"))
    }

    @Test fun changedFilmOrSourceCannotReuseTheOldNegative() {
        val edits: List<ParamsState.() -> Unit> = listOf(
            { exposureCompensationEv += .3f }, { filmGammaFactor += .1f },
            { filmProfile = "kodak_portra_800" }, { grainBlur += .1f },
            { creativeWbTemp += 200f }, { rawTemperature += 200f },
            { crop = true; cropSize = .8f to .8f }, { upscaleFactor = 1.2f },
            { negativeSourceKey = "RAW|content://photos/two|0" },
            { negativeSourceKey = "RAW|content://photos/one|90" },
            { setLab("workflow", "negative-scan") }, { setLab("filmBaseScale", 1.2) },
        )
        for(edit in edits) {
            val s = state(); s.freezeNegative(); s.edit()
            assertFalse(s.negativeIsFrozen())
            assertFalse(JSONObject(s.labEngineJson()).has("virtualNegative"))
        }
    }

    @Test fun eachVariantRestoresItsOwnReceiverToneColourAndDetail() {
        val s = state(); s.freezeNegative()
        val key = s.frozenNegativeCacheKey()
        s.setLab("outputModel.exposure", .3); s.setLab("outputModel.cyan", .1)
        s.scanUnsharpMask = .9f to .4f
        s.addScanVariant()
        s.chooseScanReceiver("lab-scan"); s.setLab("outputModel.exposure", -.7)
        s.setLab("outputModel.cyan", -.2); s.scanUnsharpMask = 1.4f to .8f
        s.renameScanVariant("Мягкий минилаб")
        s.selectScanVariant(0)
        assertEquals("noritsu-ls600", s.labString("outputModel.mode"))
        assertEquals(.3f, s.labNumber("outputModel.exposure"), 1e-6f)
        assertEquals(.1f, s.labNumber("outputModel.cyan"), 1e-6f)
        assertEquals(.9f to .4f, s.scanUnsharpMask)
        s.showVirtualNegative(true); s.selectScanVariant(1)
        assertEquals("lab-scan", s.labString("outputModel.mode"))
        assertEquals(-.7f, s.labNumber("outputModel.exposure"), 1e-6f)
        assertEquals(1.4f to .8f, s.scanUnsharpMask)
        assertEquals(key, s.frozenNegativeCacheKey())
    }

    @Test fun recipesRestoreTheLockAndVariantsForTheSameSourceOnly() {
        val s = state(); s.freezeNegative(); s.addScanVariant()
        s.chooseScanReceiver("digital"); s.setLab("outputModel.contrast", 1.3)
        val encoded = Presets.encode(s)
        val restored = ParamsState().apply { negativeSourceKey = s.negativeSourceKey }
        Presets.decode(encoded, restored)
        assertEquals(s.negativeWorkspaceJson, restored.negativeWorkspaceJson)
        assertEquals(s.snapshot(), restored.snapshot())
        assertEquals(s.frozenNegativeCacheKey(), restored.frozenNegativeCacheKey())
        restored.negativeSourceKey = "RAW|content://different|0"
        assertNull(restored.frozenNegativeCacheKey())
    }

    @Test fun deleteKeepsSurvivingVariantAndLastOneCannotBeDeleted() {
        val s = state(); s.setLab("outputModel.exposure", .25)
        s.addScanVariant(); s.setLab("outputModel.exposure", -.5)
        s.deleteScanVariant()
        assertEquals(1, s.negativeWorkspace().getJSONArray("variants").length())
        assertEquals(.25f, s.labNumber("outputModel.exposure"), 1e-6f)
        assertThrows(IllegalArgumentException::class.java) { s.deleteScanVariant() }
    }

    @Test fun variantsAreBoundedAndMalformedImportIsAtomic() {
        val s = state()
        repeat(MAX_SCAN_VARIANTS - 1) { s.addScanVariant() }
        assertThrows(IllegalArgumentException::class.java) { s.addScanVariant() }
        val before = Presets.encode(s).toString()
        val hostile = JSONObject(before)
        hostile.getJSONObject("negativeWorkspace").put("active", 999)
        assertThrows(IllegalArgumentException::class.java) { Presets.decode(hostile, s) }
        assertEquals(before, Presets.encode(s).toString())
        hostile.getJSONObject("negativeWorkspace").put("active", .5)
        assertThrows(IllegalArgumentException::class.java) { Presets.decode(hostile, s) }
    }

    @Test fun partialResetKeepsTheWorkspaceAndOldFullRecipeClearsIt() {
        val s = state(); s.freezeNegative()
        val before = s.negativeWorkspaceJson
        PhotoTool.SPECTRAL_SCAN.reset(s)
        assertEquals(before, s.negativeWorkspaceJson)
        assertTrue(s.negativeIsFrozen())
        Presets.decode(Presets.encode(ParamsState()), s)
        assertEquals("", s.negativeWorkspaceJson)
    }

    @Test fun lockProtectsFilmAndGeometryButKeepsScannerAndFinishAccessible() {
        val s = state(); s.freezeNegative()
        s.grainActive = true; s.halationActive = true; s.freezeNegative()
        assertTrue(s.toParams(skipGrainHalation = true).filmRender.grain.active)
        assertTrue(s.toParams(skipGrainHalation = true).filmRender.halation.active)
        for(tool in listOf(PhotoTool.FILMS, PhotoTool.DEVELOP, PhotoTool.GRAIN, PhotoTool.CROP, PhotoTool.NEGATIVE))
            assertTrue(tool.lockedByNegative(s))
        for(tool in listOf(PhotoTool.SCAN, PhotoTool.TONE, PhotoTool.FILE, PhotoTool.SOURCE))
            assertFalse(tool.lockedByNegative(s))
        s.unlockNegative()
        assertFalse(s.negativeIsFrozen())
        assertFalse(PhotoTool.FILMS.lockedByNegative(s))
    }

    @Test fun jsonOrderingAndNumericSpellingDoNotInvalidateDensity() {
        val s = state(); s.setLab("filmFast", 2); s.setLab("filmSlow", 3.0)
        val fingerprint = s.negativeFilmFingerprint()
        val lab = s.labObject()
        val reversed = JSONObject()
        lab.keys().asSequence().toList().reversed().forEach { reversed.put(it, lab.get(it)) }
        reversed.put("filmFast", 2.0); reversed.put("filmSlow", 3)
        s.labJson = reversed.toString()
        assertEquals(fingerprint, s.negativeFilmFingerprint())
    }

    @Test fun entireEditorSessionRetainsNegativeAndIndependentScanVariants() {
        val s = state(); s.freezeNegative(); s.addScanVariant()
        s.chooseScanReceiver("digital"); s.setLab("outputModel.exposure", -.2)
        val fixture = Ticket139EditorProbe.activityFixtureOracle()
        val document = fixture.copy(current = fixture.current.copy(paramsJson = Presets.encode(s).toString()))
        val restored = EditorSessionDocumentCodec.decode(EditorSessionDocumentCodec.encode(document))
        val target = ParamsState().apply { negativeSourceKey = s.negativeSourceKey }
        Presets.decode(JSONObject(restored.current.paramsJson), target)
        assertEquals(s.frozenNegativeCacheKey(), target.frozenNegativeCacheKey())
        target.selectScanVariant(0)
        assertEquals("noritsu-ls600", target.labString("outputModel.mode"))
        target.selectScanVariant(1)
        assertEquals("digital", target.labString("outputModel.mode"))
        assertEquals(-.2f, target.labNumber("outputModel.exposure"), 1e-6f)
    }

    @Test fun presetAmountNeverInterpolatesTheProjectIdentityOrActiveIndex() {
        val s = state(); s.freezeNegative()
        val base = Presets.encode(s)
        s.addScanVariant()
        val full = Presets.encode(s)
        for(amount in listOf(.25f, .75f)) {
            val mixed = PresetAmount.blend(base, full, amount)
            Presets.decode(mixed, ParamsState())
            val expected = if(amount < .5f) base else full
            assertEquals(expected.getJSONObject("negativeWorkspace").toString(), mixed.getJSONObject("negativeWorkspace").toString())
        }
    }

    @Test fun clearingDensityCacheCannotDeleteRecipesProfilesOrUnfinishedWrites() {
        val directory = java.nio.file.Files.createTempDirectory("negative-cache-test").toFile()
        try {
            java.io.File(directory, "v968_example.spkneg").writeBytes(ByteArray(123))
            val profile = java.io.File(directory, "film.json").apply { writeText("profile") }
            val unfinished = java.io.File(directory, "v968_example.spkneg.123.tmp").apply { writeText("pending") }
            assertEquals(123L, negativeDensityBytes(directory))
            assertEquals(0, clearNegativeDensityCache(directory))
            assertEquals(0L, negativeDensityBytes(directory))
            assertTrue(profile.isFile); assertTrue(unfinished.isFile)
        } finally { directory.deleteRecursively() }
    }
}
