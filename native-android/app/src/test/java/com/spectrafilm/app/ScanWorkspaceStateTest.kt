package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ScanWorkspaceStateTest {
    @Before fun catalog() { LabCatalog.initialize(RuntimeEnvironment.getApplication()) }

    @Test fun activationKeepsFilmDevelopmentCameraAndPaper() {
        val s = ParamsState().apply {
            exposureCompensationEv = 1.5f; filmGammaFactor = 1.3f
            printExposure = 1.8f; setLab("filmRedGamma", 1.2)
        }
        val before = s.toParams()
        s.chooseScanReceiver("lab-scan")
        val after = s.toParams()
        assertTrue(after.io.scanFilm)
        assertEquals(before.filmProfile, after.filmProfile)
        assertEquals(before.camera, after.camera)
        assertEquals(before.filmRender, after.filmRender)
        assertEquals(before.enlarger, after.enlarger)
        assertEquals(1.2f, s.labNumber("filmRedGamma"), 0f)
        assertFalse(PhotoTool.SCAN.changed(s))
    }

    @Test fun resetKeepsTheReceiverAndUnrelatedSettings() {
        val s = ParamsState().apply {
            chooseScanReceiver("lab-scan"); setLab("workflow", "negative-scan")
            setLab("outputModel.contrast", 1.7); setLab("outputModel.blackPoint", .03)
            setLab("outputModel.autoSetup", false); setLab("outputModel.cyan", .2)
            setLab("negsPrep.exposure", .5); scanLensBlur = 3f
            scanUnsharpMask = 1.2f to 2f; scanWhiteLevel = .9f; grainBlur = 1.1f
        }
        assertTrue(PhotoTool.SCAN.changed(s))
        PhotoTool.SCAN.reset(s)
        assertEquals("lab-scan", s.labString("outputModel.mode"))
        assertEquals("negative-scan", s.labString("workflow"))
        assertEquals(.5f, s.labNumber("negsPrep.exposure"), 0f)
        assertEquals(.9f, s.scanWhiteLevel, 0f)
        assertEquals(1.1f, s.grainBlur, 0f)
        assertFalse(PhotoTool.SCAN.changed(s))
        assertTrue(s.toParams().io.scanFilm)
    }

    @Test fun resettingTheOutputRoutePreservesTheScansIndependentCorrections() {
        val s = ParamsState().apply {
            chooseScanReceiver("lab-scan"); setLab("outputModel.contrast", 1.4)
            setLab("outputModel.autoSetup", false); scanLensBlur = 2f
        }
        PhotoTool.OUTPUT.reset(s)
        assertEquals("paper", s.labString("outputModel.mode", "paper"))
        assertEquals(1.4f, s.labNumber("outputModel.contrast"), 1e-6f)
        assertFalse(s.labBoolean("outputModel.autoSetup"))
        assertEquals(2f, s.scanLensBlur, 0f)
        assertFalse(PhotoTool.OUTPUT.changed(s))
        assertTrue(PhotoTool.SCAN.changed(s))
    }

    @Test fun changingReceiverPreservesManualCorrectionsAndFrameTimingChoice() {
        val s = ParamsState().apply {
            chooseScanReceiver("lab-scan"); setLab("outputModel.autoSetup", false)
            setLab("outputModel.look", .4); setLab("outputModel.contrast", 1.37)
        }
        for (mode in SCAN_RECEIVER_MODES) {
            s.chooseScanReceiver(mode)
            assertEquals(1.37f, s.labNumber("outputModel.contrast"), 1e-6f)
            assertFalse(s.labBoolean("outputModel.autoSetup"))
            assertEquals(.4f, s.labNumber("outputModel.look"), 0f)
        }
    }

    @Test fun scanEditsRoundTripThroughRecipesAndSnapshotRestore() {
        val s = ParamsState().apply {
            chooseScanReceiver("lab-scan"); setLab("outputModel.contrast", 1.37)
            setLab("outputModel.blackPoint", .027); setLab("outputModel.whitePoint", 1.12)
            setLab("outputModel.autoSetup", false); scanUnsharpMask = 1.1f to .8f
        }
        val snapshot = Presets.encode(s)
        val restored = ParamsState(); Presets.decode(snapshot, restored)
        assertEquals(s.labJson, restored.labJson)
        assertEquals(s.toParams(), restored.toParams())
        s.resetScanCorrections(); Presets.decode(snapshot, s)
        assertEquals(1.37f, s.labNumber("outputModel.contrast"), 1e-6f)
        assertEquals(.027f, s.labNumber("outputModel.blackPoint"), 1e-7f)
    }

    @Test fun groupResetKeepsOtherGroupsAndUnknownForwardCompatibleValues() {
        val s = ParamsState().apply {
            chooseScanReceiver("lab-scan"); setLab("outputModel.cyan", .3)
            setLab("outputModel.blackPoint", .02); setLab("outputModel.futureControl", .7)
        }
        s.clearScanValues(listOf("cyan", "magenta", "yellow"))
        assertEquals(0f, s.labNumber("outputModel.cyan"), 0f)
        assertEquals(.02f, s.labNumber("outputModel.blackPoint"), 0f)
        s.resetScanCorrections()
        assertEquals(.7f, s.labNumber("outputModel.futureControl"), 0f)
    }

    @Test fun operatorDefaultsMatchTheCatalogAndAreNeutral() {
        SCAN_CORRECTION_DEFAULTS.forEach { (key, value) ->
            val catalog = LabCatalog.default("outputModel.$key")
            if (value is Number) assertEquals(value.toDouble(), (catalog as Number).toDouble(), 0.0)
            else assertEquals(value, catalog)
        }
        assertEquals(listOf("scanner.lensBlur", "scanner.unsharpMask"), PhotoTool.SCAN.nativePaths())
        assertTrue(PhotoTool.SPECTRAL_SCAN.nativePaths().contains("scanner"))
    }

    @Test fun invalidReceiverDoesNotPartlyMutateTheProject() {
        val s = ParamsState(); val before = s.toParams()
        assertThrows(IllegalArgumentException::class.java) { s.chooseScanReceiver("paper") }
        assertEquals(before, s.toParams())
    }
    @Test fun noritsuRecipeRestoresTheExactEngineRouteAndControls() {
        val s = ParamsState().apply {
            chooseScanReceiver("noritsu-ls600"); setLab("outputModel.autoSetup", false)
            setLab("outputModel.exposure", -.375); setLab("outputModel.yellow", .027)
        }
        val saved = Presets.encode(s)
        val restored = ParamsState(); Presets.decode(saved, restored)
        assertEquals(s.toParams(), restored.toParams())
        assertTrue(restored.toParams().io.scanFilm)
        assertEquals("noritsu-ls600", restored.labString("outputModel.mode"))
        PhotoTool.SCAN.reset(restored)
        assertEquals("noritsu-ls600", restored.labString("outputModel.mode"))
        assertFalse(PhotoTool.SCAN.changed(restored))
    }

    @Test fun everySourceOperatorRoundTripsAndResetsIndependently() {
        val s = ParamsState().apply { chooseScanReceiver("noritsu-ls600"); setLab("outputModel.cyan", .2); setLab("outputModel.autoSetup", false) }
        val values = mapOf("noritsuGamma" to .73, "noritsuSaturation" to 1.37, "noritsuRed" to 1.21, "noritsuGreen" to .92, "noritsuBlue" to 1.18, "noritsuLow" to 67, "noritsuMid" to 123, "noritsuHigh" to 81, "noritsuUo" to 2)
        values.forEach { (k,v) -> s.setLab("outputModel.$k", v) }
        val restored = ParamsState(); Presets.decode(Presets.encode(s), restored)
        assertEquals(s.toParams(), restored.toParams())
        values.forEach { (k,v) -> assertEquals(v.toDouble(), (restored.labObject().valueAt("outputModel.$k") as Number).toDouble(), 1e-7) }
        restored.clearScanValues(NORITSU_GRADATION_KEYS)
        NORITSU_GRADATION_KEYS.forEach { k -> assertEquals((SCAN_CORRECTION_DEFAULTS.getValue(k) as Number).toFloat(), restored.labNumber("outputModel.$k"), 0f) }
        assertEquals(1.37f, restored.labNumber("outputModel.noritsuSaturation"), 1e-6f)
        PhotoTool.SCAN.reset(restored)
        assertEquals("noritsu-ls600",restored.labString("outputModel.mode")); assertFalse(PhotoTool.SCAN.changed(restored))
    }

    @Test fun outputCatalogMatchesEveryScannerResetDefaultAndRange() {
        val rows = LabCatalog.controls(RuntimeEnvironment.getApplication(), "output").associateBy { it.getString("path").removePrefix("outputModel.") }
        assertEquals(SCAN_CORRECTION_DEFAULTS.keys, rows.keys)
        SCAN_CORRECTION_DEFAULTS.forEach { (key, default) ->
            val row = rows.getValue(key)
            if (default is Number) {
                assertEquals(default.toDouble(), row.getDouble("default"), 0.0)
                assertTrue(row.getDouble("min") <= default.toDouble()); assertTrue(row.getDouble("max") >= default.toDouble())
                assertTrue(row.getDouble("step") > 0)
                assertTrue(row.getString("help").isNotBlank())
            }
        }
        assertEquals(NORITSU_CORRECTION_KEYS.toSet(), rows.keys.filter { it.startsWith("noritsu") }.toSet())
    }

    @Test fun dirtyIndicatorsUseTheSameIntegerCoercionAsTheSourceKernel() {
        val s=ParamsState().apply { chooseScanReceiver("noritsu-ls600");setLab("outputModel.noritsuLow",100.9);setLab("outputModel.noritsuUo",.9) }
        assertFalse(s.scanCorrectionsChanged())
        s.setLab("outputModel.noritsuMid",101.1);assertTrue(s.scanCorrectionsChanged())
    }

    @Test fun sourceColourToleranceDoesNotReportInactiveEditsAsChanged() {
        val s=ParamsState().apply { chooseScanReceiver("noritsu-ls600");setLab("outputModel.noritsuRed",1.00001);setLab("outputModel.noritsuSaturation",.99999) }
        assertFalse(s.scanCorrectionsChanged())
        s.setLab("outputModel.noritsuRed",1.001);assertTrue(s.scanCorrectionsChanged())
    }

}
