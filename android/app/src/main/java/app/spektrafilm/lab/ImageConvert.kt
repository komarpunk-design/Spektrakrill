package app.spektrafilm.lab

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import com.spectrafilm.engine.LinearImage
import com.spectrafilm.engine.NativeBufferOwner
import com.spectrafilm.engine.SimResult
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import org.json.JSONObject

/**
 * sRGB display Bitmap ↔ linear ProPhoto, copied from Spektrafilm-android
 * ImagePipeline.kt / EngineHelpers.kt (the matrix the native engine expects).
 *
 * JPEG/HEIC/PNG are display-referred 8-bit sRGB (baked WB, clipped highlights).
 * RAW is scene-referred linear with headroom. Preview JPEG can pass
 * [jpegScene] to recover a little highlight; export matches Spektrafilm
 * ImagePipeline.bitmapToLinearProPhoto (no toe remap, off-heap at full res).
 */
object ImageConvert {
    private val SRGB_TO_PROPHOTO = floatArrayOf(
        0.5290825f, 0.3303437f, 0.1405738f,
        0.0982640f, 0.8734031f, 0.0283329f,
        0.0167029f, 0.1176946f, 0.8656026f,
    )
    private val PROPHOTO_TO_SRGB = floatArrayOf(
        2.0340429f, -0.7275221f, -0.3065211f,
        -0.2289921f, 1.2317125f, -0.0027205f,
        -0.0085287f, -0.1532223f, 1.1617509f,
    )

    private const val OFFHEAP_BYTES = 6L * 1024L * 1024L

    @JvmStatic
    @JvmOverloads
    fun bitmapToLinearProPhoto(
        src: Bitmap,
        offHeap: Boolean = false,
        jpegScene: Boolean = false,
    ): LinearImage {
        val w = src.width
        val h = src.height
        val nbytes = w.toLong() * h * 12L
        if (nbytes <= 0L || nbytes > Int.MAX_VALUE) {
            throw OutOfMemoryError("Не хватило памяти для оригинального размера")
        }
        val image = if (offHeap) {
            NativeBufferOwner.allocate(nbytes).transferToLinearImage(w, h, "ProPhoto RGB")
        } else {
            val buf = ByteBuffer.allocateDirect(nbytes.toInt()).order(ByteOrder.nativeOrder())
            LinearImage(buf, w, h, "ProPhoto RGB")
        }
        image.acquireDataLease().use { lease ->
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val m = SRGB_TO_PROPHOTO
            val bandRows = (1024 * 1024 / w).coerceIn(1, h)
            val rowPix = IntArray(w * bandRows)
            var y = 0
            while (y < h) {
                val rows = min(bandRows, h - y)
                src.getPixels(rowPix, 0, w, 0, y, w, rows)
                var k = 0
                var i = y * w * 3
                repeat(w * rows) {
                    val argb = rowPix[k++]
                    var rl = srgbToLinear(((argb shr 16) and 0xFF) / 255f)
                    var gl = srgbToLinear(((argb shr 8) and 0xFF) / 255f)
                    var bl = srgbToLinear((argb and 0xFF) / 255f)
                    if (jpegScene) {
                        rl = jpegToScene(rl)
                        gl = jpegToScene(gl)
                        bl = jpegToScene(bl)
                    }
                    f.put(i, m[0] * rl + m[1] * gl + m[2] * bl)
                    f.put(i + 1, m[3] * rl + m[4] * gl + m[5] * bl)
                    f.put(i + 2, m[6] * rl + m[7] * gl + m[8] * bl)
                    i += 3
                }
                y += rows
            }
        }
        return image
    }

    @JvmStatic
    fun linearToDisplayJpeg(img: LinearImage, quality: Int): ByteArray =
        linearToDisplayEncoded(img, "jpeg", quality, 0)

    @JvmStatic
    @JvmOverloads
    fun linearToDisplayBitmap(image: LinearImage, orientation: Int = 0): Bitmap {
        return image.acquireDataLease().use { lease ->
            val srcW = image.width
            val srcH = image.height
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val deg = ((orientation % 360) + 360) % 360
            val w = if (deg == 90 || deg == 270) srcH else srcW
            val h = if (deg == 90 || deg == 270) srcW else srcH
            val bmp = createTaggedBitmap(w, h)
            val m = PROPHOTO_TO_SRGB
            val bandRows = (1024 * 1024 / max(1, w)).coerceIn(1, h)
            val strip = IntArray(w * bandRows)
            var y = 0
            while (y < h) {
                val rows = min(bandRows, h - y)
                var k = 0
                var row = 0
                while (row < rows) {
                    var x = 0
                    while (x < w) {
                        val src = srcIndex(x, y + row, deg, srcW, srcH)
                        val pr = f.get(src)
                        val pg = f.get(src + 1)
                        val pb = f.get(src + 2)
                        val rl = m[0] * pr + m[1] * pg + m[2] * pb
                        val gl = m[3] * pr + m[4] * pg + m[5] * pb
                        val bl = m[6] * pr + m[7] * pg + m[8] * pb
                        val r = linearToSrgbByte(rl)
                        val g = linearToSrgbByte(gl)
                        val b = linearToSrgbByte(bl)
                        strip[k++] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                        x++
                    }
                    row++
                }
                bmp.setPixels(strip, 0, w, 0, y, w, rows)
                y += rows
            }
            bmp
        }
    }

    @JvmStatic
    fun linearToDisplayEncoded(
        image: LinearImage,
        format: String,
        quality: Int,
        orientation: Int,
    ): ByteArray {
        val bmp = linearToDisplayBitmap(image, orientation)
        try {
            val os = java.io.ByteArrayOutputStream(1 shl 20)
            val png = format.equals("png", ignoreCase = true)
            val compress = if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val q = if (png) 100 else quality.coerceIn(70, 100)
            if (!bmp.compress(compress, q, os)) {
                throw RuntimeException("Не удалось закодировать JPEG")
            }
            return os.toByteArray()
        } finally {
            bmp.recycle()
        }
    }

    /** Scene-referred mid-gray (~18%) gain. Used when no film is selected. */
    @JvmStatic
    fun applyMidGrayGain(image: LinearImage) {
        image.acquireDataLease().use { lease ->
            val w = image.width
            val h = image.height
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val n = w.toLong() * h
            if (n <= 0L) return
            val step = max(1, (n / 20000L).toInt())
            var sum = 0.0
            var count = 0
            var i = 0L
            while (i < n) {
                val base = (i * 3L).toInt()
                if (base + 2 >= f.capacity()) break
                val y = 0.2126f * f.get(base) + 0.7152f * f.get(base + 1) + 0.0722f * f.get(base + 2)
                if (y.isFinite() && y > 0f) {
                    sum += y
                    count++
                }
                i += step
            }
            if (count == 0) return
            val mean = (sum / count).toFloat()
            if (mean < 1e-6f) return
            val gain = (0.184f / mean).coerceIn(0.05f, 32f)
            if (gain == 1f) return
            var p = 0
            val pix = w * h
            while (p < pix) {
                val o = p * 3
                f.put(o, f.get(o) * gain)
                f.put(o + 1, f.get(o + 1) * gain)
                f.put(o + 2, f.get(o + 2) * gain)
                p++
            }
        }
    }

    /** RGB grade for the no-film path. Identity when every slider is 0. */
    @JvmStatic
    fun applyDigitalTone(image: LinearImage, p: JSONObject?) {
        if (p == null) return
        val brightness = p.optDouble("toneBrightness", 0.0).toFloat()
        val contrast = p.optDouble("toneContrast", 0.0).toFloat()
        val sat = p.optDouble("toneSaturation", 0.0).toFloat()
        val highlights = p.optDouble("toneHighlights", 0.0).toFloat()
        val shadows = p.optDouble("toneShadows", 0.0).toFloat()
        val warmth = p.optDouble("toneWarmth", 0.0).toFloat()
        if (
            abs(brightness) < 1e-4f &&
            abs(contrast) < 1e-4f &&
            abs(sat) < 1e-4f &&
            abs(highlights) < 1e-4f &&
            abs(shadows) < 1e-4f &&
            abs(warmth) < 1e-4f
        ) {
            return
        }
        val br = 2.0.pow(brightness.toDouble()).toFloat()
        val c = 1f + contrast
        val s = 1f + sat
        val hi = highlights * 0.85f
        val sh = shadows * 0.85f
        val wr = 1f + 0.14f * warmth
        val wg = 1f + 0.02f * warmth
        val wb = 1f - 0.14f * warmth
        val mid = 0.184f
        image.acquireDataLease().use { lease ->
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val pix = image.width * image.height
            var i = 0
            while (i < pix) {
                val o = i * 3
                var r = f.get(o) * br
                var g = f.get(o + 1) * br
                var b = f.get(o + 2) * br
                r = mid + (r - mid) * c
                g = mid + (g - mid) * c
                b = mid + (b - mid) * c
                val y = 0.2126f * r + 0.7152f * g + 0.0722f * b
                r = y + (r - y) * s
                g = y + (g - y) * s
                b = y + (b - y) * s
                val t = y / (y + mid + 1e-8f)
                val lift = 1f + sh * (1f - t) + hi * t
                f.put(o, r * lift * wr)
                f.put(o + 1, g * lift * wg)
                f.put(o + 2, b * lift * wb)
                i++
            }
        }
    }

    @JvmStatic
    fun simResultToJpeg(result: SimResult, quality: Int): ByteArray =
        simResultToEncoded(result, "jpeg", quality)

    @JvmStatic
    fun limitLongEdge(src: LinearImage, maxEdge: Int): LinearImage {
        if (maxEdge <= 0) return src
        val long = maxOf(src.width, src.height)
        if (long <= maxEdge) return src
        val scale = maxEdge.toFloat() / long
        val nw = (src.width * scale).roundToInt().coerceAtLeast(1)
        val nh = (src.height * scale).roundToInt().coerceAtLeast(1)
        val nbytes = nw.toLong() * nh * 12L
        val outImg = if (nbytes >= OFFHEAP_BYTES) {
            NativeBufferOwner.allocate(nbytes).transferToLinearImage(nw, nh, src.colorSpace)
        } else {
            val dst = ByteBuffer.allocateDirect(nbytes.toInt()).order(ByteOrder.nativeOrder())
            LinearImage(dst, nw, nh, src.colorSpace)
        }
        src.acquireDataLease().use { inLease ->
            outImg.acquireDataLease().use { outLease ->
                val inp = inLease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
                val out = outLease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
                val xScale = src.width.toFloat() / nw
                val yScale = src.height.toFloat() / nh
                for (y in 0 until nh) {
                    val sy = (y + 0.5f) * yScale - 0.5f
                    val y0 = sy.toInt().coerceIn(0, src.height - 1)
                    val y1 = (y0 + 1).coerceAtMost(src.height - 1)
                    val fy = sy - y0
                    for (x in 0 until nw) {
                        val sx = (x + 0.5f) * xScale - 0.5f
                        val x0 = sx.toInt().coerceIn(0, src.width - 1)
                        val x1 = (x0 + 1).coerceAtMost(src.width - 1)
                        val fx = sx - x0
                        for (c in 0 until 3) {
                            val a = inp.get((y0 * src.width + x0) * 3 + c)
                            val b = inp.get((y0 * src.width + x1) * 3 + c)
                            val d = inp.get((y1 * src.width + x0) * 3 + c)
                            val e = inp.get((y1 * src.width + x1) * 3 + c)
                            out.put(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy)
                        }
                    }
                }
            }
        }
        return outImg
    }

    /**
     * Spektrafilm EngineHelpers.simResultToBitmap: display-referred float RGB (already
     * CCTF-encoded by the engine) → ARGB_8888, filled BAND-BY-BAND so the only managed
     * scratch is ~4 MB, not IntArray(w*h). Bitmap pixels live in native ashmem on API 26+.
     * Does NOT close [result] — the caller must, matching Spektrafilm.
     */
    @JvmStatic
    @JvmOverloads
    fun simResultToBitmap(result: SimResult, orientation: Int = 0): Bitmap {
        return result.acquireDataLease().use { lease ->
            val srcW = result.width
            val srcH = result.height
            val raw = lease.data.duplicate().order(ByteOrder.nativeOrder())
            raw.rewind()
            val f = raw.asFloatBuffer()
            val deg = ((orientation % 360) + 360) % 360
            val w = if (deg == 90 || deg == 270) srcH else srcW
            val h = if (deg == 90 || deg == 270) srcW else srcH
            if (f.capacity() < srcW * srcH * 3) {
                throw IllegalStateException("simResult short buffer")
            }
            val bmp = createTaggedBitmap(w, h)
            bmp.eraseColor(0xFF000000.toInt())
            try {
                raw.rewind()
                if (com.spectrafilm.engine.SpektraEngine.nativeFillBitmap(raw, srcW, srcH, deg, bmp)) {
                    return@use bmp
                }
            } catch (_: Throwable) {
            }
            val bandRows = (1024 * 1024 / max(1, w)).coerceIn(1, h)
            val strip = IntArray(w * bandRows)
            var y = 0
            while (y < h) {
                val rows = min(bandRows, h - y)
                var k = 0
                var row = 0
                while (row < rows) {
                    val dy = y + row
                    var dx = 0
                    while (dx < w) {
                        val src = srcIndex(dx, dy, deg, srcW, srcH)
                        val r = displayU8(f.get(src))
                        val g = displayU8(f.get(src + 1))
                        val b = displayU8(f.get(src + 2))
                        strip[k++] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                        dx++
                    }
                    row++
                }
                bmp.setPixels(strip, 0, w, 0, y, w, rows)
                y += rows
            }
            bmp
        }
    }

    @JvmStatic
    @JvmOverloads
    fun simResultToEncoded(result: SimResult, format: String, quality: Int, orientation: Int = 0): ByteArray {
        val os = ByteArrayOutputStream(1 shl 20)
        writeEncoded(result, format, quality, orientation, os)
        return os.toByteArray()
    }

    @JvmStatic
    fun writeEncoded(
        result: SimResult,
        format: String,
        quality: Int,
        orientation: Int,
        os: OutputStream,
    ) {
        val png = format.equals("png", ignoreCase = true)
        var bmp: Bitmap? = null
        try {
            bmp = try {
                simResultToBitmap(result, orientation)
            } catch (oom: OutOfMemoryError) {
                System.gc()
                try {
                    simResultToBitmap(result, orientation)
                } catch (oom2: OutOfMemoryError) {
                    if (png) {
                        result.close()
                        throw RuntimeException("Не хватило памяти для оригинального размера")
                    }
                    // Last resort: NV21 (1.5 B/px on the ART heap) instead of ARGB.
                    val jpeg = simResultToJpegYuv(result, quality, orientation)
                    os.write(jpeg)
                    return
                }
            }
        } finally {
            try {
                result.close()
            } catch (_: Throwable) {
            }
        }
        val out = bmp ?: return
        try {
            val compress = if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val q = if (png) 100 else quality.coerceIn(70, 100)
            if (!out.compress(compress, q, os)) {
                throw RuntimeException("Не удалось закодировать JPEG")
            }
        } finally {
            out.recycle()
        }
    }

    @JvmStatic
    fun createExportBitmap(w: Int, h: Int): Bitmap = createTaggedBitmap(w, h)

    /** Off-heap RGB float32 crop. */
    @JvmStatic
    fun copyRect(src: LinearImage, x0: Int, y0: Int, rw: Int, rh: Int): LinearImage {
        val w = src.width
        val h = src.height
        val x = x0.coerceIn(0, (w - 1).coerceAtLeast(0))
        val y = y0.coerceIn(0, (h - 1).coerceAtLeast(0))
        val cw = rw.coerceIn(1, w - x)
        val ch = rh.coerceIn(1, h - y)
        val nbytes = cw.toLong() * ch * 12L
        val out = NativeBufferOwner.allocate(nbytes).transferToLinearImage(cw, ch, src.colorSpace)
        src.acquireDataLease().use { inLease ->
            out.acquireDataLease().use { outLease ->
                val inp = inLease.data.duplicate().order(ByteOrder.nativeOrder())
                val outb = outLease.data.duplicate().order(ByteOrder.nativeOrder())
                inp.clear()
                outb.clear()
                val inf = inp.asFloatBuffer()
                val outf = outb.asFloatBuffer()
                val ncomp = cw * 3
                var row = 0
                while (row < ch) {
                    val src = ((y + row) * w + x) * 3
                    val dst = row * ncomp
                    var i = 0
                    while (i < ncomp) {
                        outf.put(dst + i, inf.get(src + i))
                        i++
                    }
                    row++
                }
            }
        }
        return out
    }

    @JvmStatic
    fun applyGainInPlace(image: LinearImage, gain: Float) {
        if (!gain.isFinite() || gain == 1f || gain <= 0f) return
        image.acquireDataLease().use { lease ->
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val n = f.capacity()
            var i = 0
            while (i < n) {
                val v = f.get(i)
                if (v.isFinite()) f.put(i, v * gain)
                i++
            }
        }
    }

    /** Copy a display-referred rectangle from a strip result into an unrotated bitmap. */
    @JvmStatic
    fun blitSimToBitmap(
        result: SimResult,
        bmp: Bitmap,
        srcX: Int,
        srcY: Int,
        copyW: Int,
        copyH: Int,
        dstX: Int,
        dstY: Int,
    ) {
        result.acquireDataLease().use { lease ->
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val srcW = result.width
            val srcH = result.height
            val band = (256 * 1024 / max(1, copyW)).coerceIn(1, copyH)
            val strip = IntArray(copyW * band)
            var y = 0
            while (y < copyH) {
                val rows = min(band, copyH - y)
                var k = 0
                var row = 0
                while (row < rows) {
                    val sy = (srcY + y + row).coerceIn(0, srcH - 1)
                    var x = 0
                    while (x < copyW) {
                        val sx = (srcX + x).coerceIn(0, srcW - 1)
                        val src = (sy * srcW + sx) * 3
                        val r = displayU8(f.get(src))
                        val g = displayU8(f.get(src + 1))
                        val b = displayU8(f.get(src + 2))
                        strip[k++] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                        x++
                    }
                    row++
                }
                bmp.setPixels(strip, 0, copyW, dstX, dstY + y, copyW, rows)
                y += rows
            }
        }
    }

    private fun createTaggedBitmap(w: Int, h: Int): Bitmap {
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            try {
                val acs = android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB)
                return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888, false, acs)
            } catch (_: Throwable) {
            }
        }
        return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    }

    /**
     * JPEG via YuvImage — no 24 MP ARGB Bitmap on the ART heap. NV21 is ~1.5 bytes/px vs 4.
     * Closes [result]. Used only if Bitmap.createBitmap OOMs.
     */
    private fun simResultToJpegYuv(result: SimResult, quality: Int, orientation: Int): ByteArray {
        val srcW = result.width
        val srcH = result.height
        val deg = ((orientation % 360) + 360) % 360
        val destW = if (deg == 90 || deg == 270) srcH else srcW
        val destH = if (deg == 90 || deg == 270) srcW else srcH
        val w = destW and 1.inv()
        val h = destH and 1.inv()
        if (w < 2 || h < 2) {
            result.close()
            throw RuntimeException("empty")
        }
        val ySize = w * h
        val nv = ByteArray(ySize + ySize / 2)
        try {
            result.acquireDataLease().use { lease ->
                val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            var dy = 0
            while (dy < h) {
                var dx = 0
                while (dx < w) {
                    var sumV = 0
                    var sumU = 0
                    var n = 0
                    var yy = 0
                    while (yy < 2) {
                        var xx = 0
                        while (xx < 2) {
                            val px = dx + xx
                            val py = dy + yy
                            val src = srcIndex(px, py, deg, srcW, srcH)
                            val r = finite01(f.get(src))
                            val g = finite01(f.get(src + 1))
                            val b = finite01(f.get(src + 2))
                            val y = 0.299f * r + 0.587f * g + 0.114f * b
                            nv[py * w + px] = (y * 255f + 0.5f).toInt().coerceIn(0, 255).toByte()
                            sumV += ((0.5f * r - 0.4187f * g - 0.0813f * b + 0.5f) * 255f + 0.5f)
                                .toInt().coerceIn(0, 255)
                            sumU += ((-0.1687f * r - 0.3313f * g + 0.5f * b + 0.5f) * 255f + 0.5f)
                                .toInt().coerceIn(0, 255)
                            n++
                            xx++
                        }
                        yy++
                    }
                    val uv = ySize + (dy / 2) * w + dx
                    nv[uv] = (sumV / n).toByte()
                    nv[uv + 1] = (sumU / n).toByte()
                    dx += 2
                }
                dy += 2
            }
            }
        } finally {
            result.close()
        }
        val os = ByteArrayOutputStream(1 shl 20)
        val yuv = YuvImage(nv, ImageFormat.NV21, w, h, null)
        val ok = yuv.compressToJpeg(Rect(0, 0, w, h), quality.coerceIn(70, 100), os)
        if (!ok || os.size() < 32) {
            throw RuntimeException("Не удалось закодировать JPEG")
        }
        return os.toByteArray()
    }

    private fun srcIndex(dx: Int, dy: Int, deg: Int, srcW: Int, srcH: Int): Int {
        val sx: Int
        val sy: Int
        when (deg) {
            90 -> {
                sx = dy
                sy = srcH - 1 - dx
            }
            180 -> {
                sx = srcW - 1 - dx
                sy = srcH - 1 - dy
            }
            270 -> {
                sx = srcW - 1 - dy
                sy = dx
            }
            else -> {
                sx = dx
                sy = dy
            }
        }
        val cx = sx.coerceIn(0, srcW - 1)
        val cy = sy.coerceIn(0, srcH - 1)
        return (cy * srcW + cx) * 3
    }

    /** Cheap NaN/range probe of a display-referred SimResult. Does not close it. */
    @JvmStatic
    fun sampleStats(result: SimResult): String {
        return result.acquireDataLease().use { lease ->
            val w = result.width
            val h = result.height
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val n = w.toLong() * h
            if (n <= 0L || f.capacity() < 3) return@use "empty"
            var nan = 0
            var inf = 0
            var neg = 0
            var over = 0
            var min = Float.POSITIVE_INFINITY
            var max = Float.NEGATIVE_INFINITY
            var sum = 0.0
            var count = 0
            val step = max(1, (n / 18000L).toInt().coerceAtLeast(1))
            var i = 0
            while (i < n) {
                val base = i * 3
                if (base + 2 >= f.capacity()) break
                var c = 0
                while (c < 3) {
                    val v = f.get(base + c)
                    if (v.isNaN()) nan++
                    else if (v.isInfinite()) inf++
                    else {
                        if (v < min) min = v
                        if (v > max) max = v
                        if (v < 0f) neg++
                        if (v > 1.02f) over++
                        sum += v
                        count++
                    }
                    c++
                }
                i += step
            }
            var top = 0.0
            var bot = 0.0
            var nt = 0
            var nb = 0
            val band = max(1, h / 16)
            val xStep = max(1, w / 80)
            var y = 0
            while (y < band) {
                var x = 0
                while (x < w) {
                    val a = y * w + x
                    val b = (h - 1 - y) * w + x
                    if (a * 3 + 2 < f.capacity()) {
                        top += f.get(a * 3) + f.get(a * 3 + 1) + f.get(a * 3 + 2)
                        nt += 3
                    }
                    if (b * 3 + 2 < f.capacity()) {
                        bot += f.get(b * 3) + f.get(b * 3 + 1) + f.get(b * 3 + 2)
                        nb += 3
                    }
                    x += xStep
                }
                y++
            }
            val mean = if (count > 0) (sum / count).toFloat() else Float.NaN
            val wrapHint = if (nt > 0 && nb > 0) {
                val dt = top / nt
                val db = bot / nb
                val gap = kotlin.math.abs(dt - db)
                if (gap < 0.04) "suspect" else "ok"
            } else {
                "n/a"
            }
            "px=${w}x${h} step=$step nan=$nan inf=$inf neg=$neg over=$over min=$min max=$max mean=$mean wrap=$wrapHint"
        }
    }

    /**
     * Uniform black (unexposed negative print) or uniform white (clear slide)
     * after a GPU pass that reported success but wrote zeros.
     */
    @JvmStatic
    fun looksFlat(result: SimResult): Boolean {
        return result.acquireDataLease().use { lease ->
            val w = result.width
            val h = result.height
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val n = w.toLong() * h
            if (n <= 0L || f.capacity() < 3) return@use true
            var min = Float.POSITIVE_INFINITY
            var max = Float.NEGATIVE_INFINITY
            var sum = 0.0
            var count = 0
            val step = max(1, (n / 24000L).toInt().coerceAtLeast(1))
            var i = 0L
            while (i < n) {
                val base = (i * 3L).toInt()
                if (base + 2 >= f.capacity()) break
                var c = 0
                while (c < 3) {
                    val v = f.get(base + c)
                    if (v.isFinite()) {
                        if (v < min) min = v
                        if (v > max) max = v
                        sum += v
                        count++
                    }
                    c++
                }
                i += step
            }
            if (count == 0 || !min.isFinite() || !max.isFinite()) return@use true
            val mean = (sum / count).toFloat()
            val span = max - min
            // Journal 8.4 Portra 12 MP: min=0.042 max=0.086 (Dmin print).
            // Velvia: 0.66-0.91 is a real image, must NOT match.
            max < 0.12f || min > 0.88f || (span < 0.12f && (mean < 0.10f || mean > 0.88f))
        }
    }

    @JvmStatic
    fun linearStats(image: LinearImage): String {
        return image.acquireDataLease().use { lease ->
            val w = image.width
            val h = image.height
            val f = lease.data.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
            val n = w.toLong() * h
            if (n <= 0L || f.capacity() < 3) return@use "empty"
            var min = Float.POSITIVE_INFINITY
            var max = Float.NEGATIVE_INFINITY
            var nan = 0
            val step = max(1, (n / 12000L).toInt().coerceAtLeast(1))
            var i = 0L
            while (i < n) {
                val base = (i * 3L).toInt()
                if (base + 2 >= f.capacity()) break
                var c = 0
                while (c < 3) {
                    val v = f.get(base + c)
                    if (v.isNaN()) nan++
                    else if (v.isFinite()) {
                        if (v < min) min = v
                        if (v > max) max = v
                    }
                    c++
                }
                i += step
            }
            "in=${w}x${h} min=$min max=$max nan=$nan"
        }
    }

    private fun pixelsToJpeg(px: IntArray, w: Int, h: Int, quality: Int): ByteArray =
        pixelsToEncoded(px, w, h, "jpeg", quality)

    private fun pixelsToEncoded(px: IntArray, w: Int, h: Int, format: String, quality: Int): ByteArray {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        bmp.setPixels(px, 0, w, 0, 0, w, h)
        val os = ByteArrayOutputStream(w * h)
        val png = format.equals("png", ignoreCase = true)
        val compress = if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
        val q = if (png) 100 else quality.coerceIn(1, 100)
        bmp.compress(compress, q, os)
        bmp.recycle()
        return os.toByteArray()
    }

    /**
     * Display-referred JPEG sits in ~0–1 with a crushed toe and hard 255 clip.
     * Scene-referred RAW has a gentle toe and 1.5–2 stops of highlight.
     * This undoes enough of the JPEG curve for the film pipeline to print.
     */
    private fun jpegToScene(x: Float): Float {
        var y = if (x < 0f) 0f else x
        if (y < 0.04f) y += 0.007f * (1f - y / 0.04f)
        val knee = 0.72f
        if (y > knee) {
            val t = ((y - knee) / (1f - knee)).coerceIn(0f, 1f)
            y = knee + t * 0.48f + t * t * 0.42f
        }
        return y
    }

    private fun srgbToLinear(c: Float): Float =
        if (c <= 0.04045f) c / 12.92f else ((c + 0.055) / 1.055).pow(2.4).toFloat()

    private fun linearToSrgbByte(x: Float): Int {
        if (!x.isFinite() || x <= 0f) return 0
        val e = if (x <= 0.0031308f) 12.92 * x else 1.055 * x.toDouble().pow(1.0 / 2.4) - 0.055
        if (!e.isFinite() || e <= 0.0) return 0
        if (e >= 1.0) return 255
        return (e * 255.0).roundToInt().coerceIn(0, 255)
    }

    /** Inf/NaN → black. Inf used to clamp to 1 and paint a white stripe. */
    private fun finite01(v: Float): Float = if (!v.isFinite() || v <= 0f) 0f else min(1f, v)

    private fun displayU8(v: Float): Int {
        if (!v.isFinite() || v <= 0f) return 0
        if (v >= 1f) return 255
        return (v * 255f + 0.5f).toInt().coerceIn(0, 255)
    }
}
