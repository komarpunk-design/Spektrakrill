/*
 * Spektrafilm for Android — full-size RAW export decode admission. GPLv3.
 * Film modeling powered by spektrafilm.
 */
package com.spectrafilm.app

import com.spectrafilm.libraw.DecodeStatus
import com.spectrafilm.libraw.RawDecodeException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class RawDecodeAdmissionTest {
    private val mib = 1_048_576L

    @Test
    fun admitsWhatTheSystemCanGiveAboveItsThresholdWithinTheBudget() {
        // The SM-S948W mid-session: ~2.4 GB available, a ~200 MB low-memory threshold and a
        // 2 GiB budget with nothing reserved: the system bound wins below the budget.
        val bytes = rawExportAdmissionBytes(2_400L * mib, 200L * mib, 2_048L * mib)
        assertEquals(2_400L * mib - 200L * mib - RAW_ADMISSION_SAFETY_BYTES, bytes)
        // With more available, the budget bounds it.
        assertEquals(2_048L * mib, rawExportAdmissionBytes(2_900L * mib, 200L * mib, 2_048L * mib))
        // A busy budget bounds it instead.
        assertEquals(700L * mib, rawExportAdmissionBytes(4_000L * mib, 200L * mib, 700L * mib))
    }

    @Test
    fun previewRetryFits26MpWithinTheActual768MiBBudget() {
        // A 6 GB device with 2.25 GiB available selects the native 24 MiPixel tier,
        // but its process budget can reserve 768 MiB: enough for the tested X-T3 RAF.
        val admitted = rawExportAdmissionBytes(2_304L * mib, 128L * mib, 768L * mib)
        assertEquals(768L * mib, admitted)
        assertTrue(admitted >= 6_288L * 4_164L * 28L)
        assertTrue(admitted <= 2_304L * mib - 128L * mib - RAW_ADMISSION_SAFETY_BYTES)
    }

    @Test
    fun neverAdmitsNegativeBytes() {
        assertEquals(0L, rawExportAdmissionBytes(300L * mib, 200L * mib, 2_048L * mib))
    }

    @Test
    fun budgetFreeBytesComeFromTheSnapshot() {
        val json = """{"schema":"spk.memory_budget.v1","limit_bytes":2147483648,""" +
            """"total":{"current_bytes":536870912,"peak_bytes":0,"denial_count":0,"denied_bytes":0}}"""
        assertEquals(1_536L * mib, memoryBudgetFreeBytes(json))
        assertEquals(Long.MAX_VALUE, memoryBudgetFreeBytes("not json"))
    }

    @Test
    fun anExportDecodeNeverTakesTheReducedLadder() {
        // The export refuses a reduced decode, so a memory refusal must reach the caller
        // (which reclaims and retries) instead of quietly becoming a half-size image.
        val refusal = RawDecodeException("geometry budget", DecodeStatus.NO_MEMORY.code, 0)
        val attempts = mutableListOf<Pair<Int, Boolean>>()
        try {
            decodeRawWithMemoryFallback<Unit>(EXPORT_MAX_EDGE_PX, allowReducedFallback = false) { edge, half ->
                attempts += edge to half
                throw refusal
            }
            fail("expected the refusal")
        } catch (actual: RawDecodeException) {
            assertSame(refusal, actual)
        }
        assertEquals(listOf(EXPORT_MAX_EDGE_PX to false), attempts)
    }
}
