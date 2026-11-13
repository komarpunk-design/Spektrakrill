package com.spectrafilm.app

import com.spectrafilm.libraw.DecodeStatus
import com.spectrafilm.libraw.RawDecodeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class RawPreviewMemoryTest {
    private val mib = 1_048_576L
    private fun memoryRefusal() = RawDecodeException(
        "RAW geometry exceeds 24 MiPixel in-memory safety limit for available device RAM",
        DecodeStatus.NO_MEMORY.code, 0,
    )

    @Test fun anOrdinaryNativePreviewDoesNotReclaimOrReserveAgain() = runBlocking {
        val result = decodeRawPreviewWithMemoryAdmission(
            admit = { error("no admission needed") }, reclaim = { error("no reclaim needed") }, log = {},
        ) { bytes -> assertEquals(0L, bytes); "native RAW" }
        assertEquals("native RAW", result)
    }

    @Test fun the24MiPixelRefusalGetsAHeldMeasuredBudgetBeforeAnyPlatformFallback() = runBlocking {
        val events = mutableListOf<String>()
        val attempts = mutableListOf<Long>()
        var held = false
        val result = decodeRawPreviewWithMemoryAdmission(
            admit = {
                events += "admit"; held = true
                RawDecodeAdmission(768L * mib, AutoCloseable { held = false; events += "release" })
            }, reclaim = { events += "reclaim" }, log = {},
        ) { bytes ->
            attempts += bytes
            if (bytes == 0L) throw memoryRefusal()
            assertTrue("reservation covers the whole native decode", held)
            assertEquals(768L * mib, bytes)
            events += "native retry"
            "linear ProPhoto proxy"
        }
        assertEquals("linear ProPhoto proxy", result)
        assertEquals(listOf(0L, 768L * mib), attempts)
        assertEquals(listOf("reclaim", "admit", "native retry", "release"), events)
        assertFalse(held)
    }

    @Test fun insufficientAdmissionCannotRaiseTheNativeLimit() = runBlocking {
        for (bytes in listOf(0L, RAW_ADMISSION_MIN_BYTES - 1L)) {
            val first = memoryRefusal(); var attempts = 0; var releases = 0
            try {
                decodeRawPreviewWithMemoryAdmission<Unit>(
                    admit = { RawDecodeAdmission(bytes, AutoCloseable { releases++ }) }, reclaim = {}, log = {},
                ) { attempts++; throw first }
                fail("expected the original memory refusal")
            } catch (actual: RawDecodeException) { assertSame(first, actual) }
            assertEquals(1, attempts); assertEquals(1, releases)
        }
    }

    @Test fun aSecondRefusalStopsAndReleasesItsReservation() = runBlocking {
        val first = memoryRefusal(); val second = memoryRefusal(); var attempts = 0; var releases = 0
        try {
            decodeRawPreviewWithMemoryAdmission<Unit>(
                admit = { RawDecodeAdmission(768L * mib, AutoCloseable { releases++ }) }, reclaim = {}, log = {},
            ) { attempts++; throw if (attempts == 1) first else second }
            fail("expected the second refusal")
        } catch (actual: RawDecodeException) {
            assertSame(second, actual); assertArrayEquals(arrayOf(first), actual.suppressed)
        }
        assertEquals(2, attempts); assertEquals(1, releases)
    }

    @Test fun unsupportedMetadataAndCancellationAreNeverTreatedAsMemoryRefusals() = runBlocking {
        for (status in listOf(DecodeStatus.FILE_UNSUPPORTED, DecodeStatus.PRECISION_METADATA, DecodeStatus.INPUT, DecodeStatus.CANCELLED)) {
            val first = RawDecodeException("decoder verdict", status.code, -1)
            try {
                decodeRawPreviewWithMemoryAdmission<Unit>(
                    admit = { error("must not reserve") }, reclaim = { error("must not reclaim") }, log = {},
                ) { throw first }
                fail("expected unchanged decoder verdict")
            } catch (actual: RawDecodeException) { assertSame(first, actual) }
        }
        try {
            decodeRawPreviewWithMemoryAdmission<Unit>(
                admit = { error("must not reserve") }, reclaim = { error("must not reclaim") }, log = {},
            ) { throw CancellationException("photo changed") }
            fail("expected cancellation")
        } catch (_: CancellationException) { }
    }

    @Test fun cancellationDuringRetryReleasesTheHeldBytes() = runBlocking {
        var held = false; var releases = 0; var attempts = 0
        val job = launch(start = CoroutineStart.UNDISPATCHED) {
            decodeRawPreviewWithMemoryAdmission<Unit>(
                admit = { held = true; RawDecodeAdmission(768L * mib, AutoCloseable { held = false; releases++ }) },
                reclaim = {}, log = {},
            ) {
                if (++attempts == 1) throw memoryRefusal()
                awaitCancellation()
            }
        }
        assertTrue(held)
        job.cancelAndJoin()
        assertFalse(held); assertEquals(1, releases); assertEquals(2, attempts)
    }
}
