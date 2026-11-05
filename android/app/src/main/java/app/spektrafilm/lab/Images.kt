package app.spektrafilm.lab

import com.spectrafilm.engine.LinearImage
import com.spectrafilm.engine.NativeBufferOwner
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Thin Java-facing adapter over Spektrafilm 0.10 LinearImage (lease-based,
 * no public `.data` / 5-arg constructor).
 */
object Images {
    @JvmStatic
    @JvmOverloads
    fun wrap(data: ByteBuffer, w: Int, h: Int, cs: String? = "ProPhoto RGB"): LinearImage {
        data.order(ByteOrder.nativeOrder())
        data.rewind()
        if (data.limit() < data.capacity()) data.limit(data.capacity())
        return LinearImage(data, w, h, cs ?: "ProPhoto RGB")
    }

    /** Duplicate of the native RGB buffer. Valid while [image] is still open. */
    @JvmStatic
    fun bytes(image: LinearImage): ByteBuffer =
        image.acquireDataLease().use { lease ->
            lease.data.duplicate().order(ByteOrder.nativeOrder())
        }

    @JvmStatic
    fun offHeap(w: Int, h: Int, cs: String = "ProPhoto RGB"): LinearImage {
        val n = w.toLong() * h * 12L
        return NativeBufferOwner.allocate(n).transferToLinearImage(w, h, cs)
    }
}
