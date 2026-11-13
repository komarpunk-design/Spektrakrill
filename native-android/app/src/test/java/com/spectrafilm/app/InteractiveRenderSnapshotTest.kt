/*
 * Spektrafilm for Android — immutable magnifier/ROI render snapshot regressions. GPLv3.
 */
package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test

class InteractiveRenderSnapshotTest {
    @Test
    fun oneSnapshotFeedsBothRoiPassesAfterUiStateChanges() {
        val state = ParamsState().apply {
            exposureCompensationEv = 1.25f
            filmFormatMm = 36f
            savingCctfEncoding = false
            saturation = 0.2f
            vibrance = 0.3f
            gamutCompress = 0.4f
        }
        val snapshot = state.captureInteractiveRenderSnapshot(renderKey = 17)

        state.exposureCompensationEv = -3f
        state.filmFormatMm = 70f
        state.savingCctfEncoding = true
        state.saturation = 0.9f

        val draft = snapshot.paramsForCrop(cropFraction = 0.5f, previewMaxSize = 640)
        val final = snapshot.paramsForCrop(cropFraction = 0.5f, previewMaxSize = 1600)

        assertEquals(17, snapshot.renderKey)
        assertEquals(1.25f, draft.camera.exposureCompensationEv, 0f)
        assertEquals(1.25f, final.camera.exposureCompensationEv, 0f)
        assertEquals(18f, draft.camera.filmFormatMm, 0f)
        assertEquals(18f, final.camera.filmFormatMm, 0f)
        assertEquals(640, draft.settings.previewMaxSize)
        assertEquals(1600, final.settings.previewMaxSize)
        assertEquals(false, snapshot.cctfEncoded)
        assertEquals(0.2f, snapshot.saturation, 0f)
        assertEquals(0.3f, snapshot.vibrance, 0f)
        assertEquals(0.4f, snapshot.gamutCompress, 0f)
    }

    @Test
    fun aCroppedRenderKeepsTheContrastMaskTheSamePhysicalSize() {
        val state = ParamsState().apply {
            contrastMaskActive = true
            contrastMaskScale = 0.03f
        }
        val crop = state.captureInteractiveRenderSnapshot(renderKey = 1)
            .paramsForCrop(cropFraction = 0.25f)
        assertEquals(true, crop.printRender.contrastMask.active)
        assertEquals(0.12f, crop.printRender.contrastMask.scale, 1e-6f)
    }
    @Test fun settledPreviewRetainsTheSameEffectsAsExport() {
        val state = ParamsState().apply {
            grainActive = true; halationActive = true; couplersActive = true
            grainParticleAreaUm2 = .7f; halHalationAmount = 1.4f
            cameraLensBlurUm = 4f; crop = true
            setLab("outputModel.mode", "lab-scan")
            setLab("layeredTransport.model", "layered")
        }
        val preview = state.settledPreviewParams()
        assertTrue(preview.filmRender.grain.active)
        assertTrue(preview.filmRender.halation.active)
        assertTrue(preview.filmRender.dirCouplers.active)
        assertEquals(.7f, preview.filmRender.grain.agxParticleAreaUm2, 0f)
        assertEquals(1.4f, preview.filmRender.halation.halationAmount, 0f)
        assertEquals(4f, preview.camera.lensBlurUm, 0f)
        assertTrue(preview.io.crop)
        assertEquals(state.toParams(), preview)
        assertTrue(preview.experimentalJson.contains("lab-scan"))
    }

    @Test fun openingCropDoesNotDisableFilmEffectsOrChangeOutputRoute() {
        val state = ParamsState().apply { crop = true; grainActive = true; halationActive = true; setLab("outputModel.mode", "digital") }
        val preview = state.settledPreviewParams(cropOpen = true)
        assertFalse(preview.io.crop)
        assertTrue(preview.filmRender.grain.active)
        assertTrue(preview.filmRender.halation.active)
        assertTrue(preview.experimentalJson.contains("digital"))
        assertEquals(state.toParams().withoutCrop(), preview)
    }

    @Test fun settledGradeUsesTheSameGenerationAsItsCachedEngineOutput() {
        val state = ParamsState().apply { saturation=.2f; vibrance=.3f; gamutCompress=.4f; savingCctfEncoding=false }
        val cachedParams = state.settledPreviewParams(cropOpen = true)
        val frame = state.captureInteractiveRenderSnapshot(11, cachedParams)
        state.saturation=.9f; state.vibrance=.8f; state.gamutCompress=.7f; state.savingCctfEncoding=true
        assertSame(cachedParams, frame.params)
        assertEquals(.2f,frame.saturation,0f); assertEquals(.3f,frame.vibrance,0f); assertEquals(.4f,frame.gamutCompress,0f)
        assertFalse(frame.cctfEncoded)
    }

}
