package com.spectrafilm.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class RenderLoadPolicyTest {
    @Test fun unknownTelemetryDoesNotThrottleAndHotDevicesDoNotSpeculate() {
        assertTrue(RenderLoad().allowSpeculation)
        assertTrue(RenderLoad(1).allowSpeculation)
        assertFalse(RenderLoad(2).allowSpeculation)
        assertFalse(RenderLoad(powerSave = true).allowSpeculation)
        assertEquals(0L, RenderLoad().batchRestMs(60_000L))
        assertEquals(3_000L, RenderLoad(2).batchRestMs(Long.MAX_VALUE))
        assertEquals(10_000L, RenderLoad(3).batchRestMs(Long.MAX_VALUE))
        assertEquals(0L, RenderLoad(3).batchRestMs(-100L))
    }

    @Test fun pacingStopsAsSoonAsTemperatureRecovers() = runBlocking {
        val events = mutableListOf<Boolean>()
        var samples = 0
        val waited = awaitBatchCooling(60_000L,
            readLoad = { RenderLoad(if (samples++ < 2) 3 else 0) },
            onWaiting = { events += it }, pause = {})
        assertEquals(500L, waited)
        assertEquals(listOf(true, false), events)
    }

    @Test fun criticalStatusHoldsEvenTheFirstPhotoUntilRecovery() = runBlocking {
        var samples = 0
        val waits = mutableListOf<Long>()
        val waited = awaitBatchCooling(0L,
            readLoad = { RenderLoad(if (samples++ < 3) 4 else 1) },
            onWaiting = {}, pause = { waits += it })
        assertEquals(3_000L, waited)
        assertEquals(listOf(1_000L, 1_000L, 1_000L), waits)
    }

    @Test fun cancellationDuringCoolingClearsTheWaitingIndicator() = runBlocking {
        val events = mutableListOf<Boolean>()
        try {
            awaitBatchCooling(30_000L, { RenderLoad(4) }, { events += it },
                pause = { throw CancellationException("cancel") })
            fail("must cancel")
        } catch (_: CancellationException) { }
        assertEquals(listOf(true, false), events)
    }

    @Test fun powerSavingPacesWithoutBlockingIndefinitely() = runBlocking {
        val waited = awaitBatchCooling(12_000L, { RenderLoad(powerSave = true) }, {}, pause = {})
        assertEquals(2_000L, waited)
    }
}
