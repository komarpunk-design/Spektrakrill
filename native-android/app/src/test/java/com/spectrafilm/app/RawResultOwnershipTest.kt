/*
 * Spektrafilm for Android — decoded RAW ownership regressions. GPLv3.
 */
package com.spectrafilm.app

import com.spectrafilm.libraw.LinearResult
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RawResultOwnershipTest {
    @Test
    fun previewCopyClosesNativeResultImmediately() {
        val result = decodedResult(width = 2, height = 1)

        val image = rawResultToLinearImage(result, maxEdge = 2048)

        assertTrue(result.isClosed)
        image.close()
    }

    @Test
    fun exportTransferClosesResultButKeepsNativeLeaseAliveUntilImageCloses() {
        val result = decodedResult(width = 2, height = 1)

        val image = rawResultToLinearImage(result, maxEdge = 4097)

        // Ownership has moved: no new LinearResult readers are accepted, while the
        // LinearImage's transferred lease still pins the native allocation.
        assertTrue(result.isClosed)
        image.acquireDataLease().use { lease ->
            val data = lease.data
            assertTrue(data.asFloatBuffer().get(5).isFinite())
        }
        image.close()
        assertTrue(result.isClosed)
        image.close()
        assertTrue(result.isClosed)
    }

    @Test
    fun malformedNativeResultIsClosedOnValidationFailure() {
        val result = LinearResult(
            ByteBuffer.allocateDirect(3 * Float.SIZE_BYTES).order(ByteOrder.nativeOrder()),
            width = 2,
            height = 2,
        )

        assertThrows(IllegalArgumentException::class.java) {
            rawResultToLinearImage(result, maxEdge = 2048)
        }
        assertTrue(result.isClosed)
    }

    @Test
    fun defensiveReductionFiltersFineDetailAndClosesTheResult() {
        val data = ByteBuffer.allocateDirect(8 * 8 * 3 * 4).order(ByteOrder.nativeOrder())
        val pixels = data.asFloatBuffer()
        for (y in 0 until 8) for (x in 0 until 8) for (c in 0..2) {
            pixels.put((y * 8 + x) * 3 + c, ((x + y) % 2).toFloat())
        }
        val raw = LinearResult(data, 8, 8)
        rawResultToLinearImage(raw, 4).use { image ->
            assertTrue(raw.isClosed)
            assertEquals(4, image.width); assertEquals(4, image.height)
            image.acquireDataLease().use { lease ->
                val rgb = lease.data.order(ByteOrder.nativeOrder()).asFloatBuffer()
                repeat(4 * 4 * 3) { assertEquals(.5f, rgb.get(it), 0f) }
            }
        }
    }

    @Test
    fun defensiveReductionUsesTheExactEdgeAtNonintegerScale() {
        rawResultToLinearImage(decodedResult(13, 7), 8).use { image ->
            assertEquals(8, image.width)
            assertEquals(4, image.height)
        }
    }

    private fun decodedResult(width: Int, height: Int): LinearResult {
        val data = ByteBuffer.allocateDirect(width * height * 3 * Float.SIZE_BYTES)
            .order(ByteOrder.nativeOrder())
        val floats = data.asFloatBuffer()
        repeat(width * height * 3) { index -> floats.put(index, index.toFloat()) }
        return LinearResult(data, width, height)
    }
}
