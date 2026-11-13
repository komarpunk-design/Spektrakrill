package com.spectrafilm.app

import com.spectrafilm.libraw.DecodeStatus
import com.spectrafilm.libraw.RawDecodeException
import org.junit.Assert.*
import org.junit.Test

class RawFallbackInfoTest {
    @Test fun aRefusedCameraRawIsNeverInventedToBeADng() {
        for (status in listOf(DecodeStatus.FILE_UNSUPPORTED, DecodeStatus.PRECISION_METADATA, DecodeStatus.NO_MEMORY)) {
            val info = RawFallbackInfo.from(RawDecodeException("camera RAW refusal", status.code, -2))
            assertFalse(info.reason.contains("DNG"))
            assertTrue(info.reason.contains("RAW"))
        }
    }
    @Test fun aGeometryBudgetRefusalDoesNotClaimAnActualAllocationFailure() {
        val info = RawFallbackInfo.from(RawDecodeException(
            "RAW geometry exceeds 24 MiPixel in-memory safety limit for available device RAM",
            DecodeStatus.NO_MEMORY.code, 0,
        ))
        assertTrue(info.reason.contains("бюджет"))
        assertFalse(info.reason.contains("Не хватило памяти"))
        assertTrue(info.details.contains("24 MiPixel"))
    }
    @Test fun theActualNativeVerdictReachesTheDetails() {
        val info = RawFallbackInfo.from(RawDecodeException("RAW black-level metadata rejected", DecodeStatus.PRECISION_METADATA.code, -100))
        assertEquals(DecodeStatus.PRECISION_METADATA, info.status)
        assertEquals(-100, info.librawCode)
        assertTrue(info.details.contains("RAW black-level metadata rejected"))
        assertTrue(info.details.contains("PRECISION_METADATA (13)"))
    }
    @Test fun dngCodecMessagesRequireADngCodecVerdict() {
        for (status in listOf(DecodeStatus.DEFLATE_DNG, DecodeStatus.LOSSY_JPEG_DNG, DecodeStatus.JPEGXL_DNG)) {
            assertTrue(RawFallbackInfo.from(RawDecodeException("codec", status.code, 0)).reason.contains("DNG"))
        }
        assertFalse(RawFallbackInfo.cached().reason.contains("DNG"))
    }
    @Test fun aRefusedDecodeCannotPermanentlyCacheItsPlatformPreview() {
        assertTrue(rawProxyCanPersist(usedPlatformFallback = false, memoryDegraded = false))
        assertFalse(rawProxyCanPersist(usedPlatformFallback = true, memoryDegraded = false))
        assertFalse(rawProxyCanPersist(usedPlatformFallback = false, memoryDegraded = true))
        assertFalse(rawProxyCanPersist(usedPlatformFallback = true, memoryDegraded = true))
    }
}
