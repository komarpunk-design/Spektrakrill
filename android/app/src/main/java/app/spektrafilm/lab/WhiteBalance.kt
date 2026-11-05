package app.spektrafilm.lab

import com.spectrafilm.engine.LinearImage
import java.nio.ByteOrder
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/**
 * Camera-stage white balance, identical to src/lib/film/wb-temp-tint.ts.
 *
 * Robertson 1968 CCT + DNG tint (Wyszecki & Stiles, Color Science 2nd ed. p.228)
 * → Bradford CAT on linear RGB. Applied BEFORE Spektrafilm's Hanatos upsample.
 * as_shot leaves the buffer untouched so the spectral engine matches GitHub.
 */
object WhiteBalance {
    private const val TINT_SCALE = -3000.0

    private data class Ruvt(val r: Double, val u: Double, val v: Double, val t: Double)

    private val LOCUS = arrayOf(
        Ruvt(0.0, 0.18006, 0.26352, -0.24341),
        Ruvt(10.0, 0.18066, 0.26589, -0.25479),
        Ruvt(20.0, 0.18133, 0.26846, -0.26876),
        Ruvt(30.0, 0.18208, 0.27119, -0.28539),
        Ruvt(40.0, 0.18293, 0.27407, -0.30470),
        Ruvt(50.0, 0.18388, 0.27709, -0.32675),
        Ruvt(60.0, 0.18494, 0.28021, -0.35156),
        Ruvt(70.0, 0.18611, 0.28342, -0.37915),
        Ruvt(80.0, 0.18740, 0.28668, -0.40955),
        Ruvt(90.0, 0.18880, 0.28997, -0.44278),
        Ruvt(100.0, 0.19032, 0.29326, -0.47888),
        Ruvt(125.0, 0.19462, 0.30141, -0.58204),
        Ruvt(150.0, 0.19962, 0.30921, -0.70471),
        Ruvt(175.0, 0.20525, 0.31647, -0.84901),
        Ruvt(200.0, 0.21142, 0.32312, -1.0182),
        Ruvt(225.0, 0.21807, 0.32909, -1.2168),
        Ruvt(250.0, 0.22511, 0.33439, -1.4512),
        Ruvt(275.0, 0.23247, 0.33904, -1.7298),
        Ruvt(300.0, 0.24010, 0.34308, -2.0637),
        Ruvt(325.0, 0.24702, 0.34655, -2.4681),
        Ruvt(350.0, 0.25591, 0.34951, -2.9641),
        Ruvt(375.0, 0.26400, 0.35200, -3.5814),
        Ruvt(400.0, 0.27218, 0.35407, -4.3633),
        Ruvt(425.0, 0.28039, 0.35577, -5.3762),
        Ruvt(450.0, 0.28863, 0.35714, -6.7262),
        Ruvt(475.0, 0.29685, 0.35823, -8.5955),
        Ruvt(500.0, 0.30505, 0.35907, -11.324),
        Ruvt(525.0, 0.31320, 0.35968, -15.628),
        Ruvt(550.0, 0.32129, 0.36011, -23.325),
        Ruvt(575.0, 0.32931, 0.36038, -40.770),
        Ruvt(600.0, 0.33724, 0.36051, -116.45),
    )

    private val SRGB_TO_XYZ = arrayOf(
        doubleArrayOf(0.4124564, 0.3575761, 0.1804375),
        doubleArrayOf(0.2126729, 0.7151522, 0.0721750),
        doubleArrayOf(0.0193339, 0.1191920, 0.9503041),
    )
    private val XYZ_TO_SRGB = arrayOf(
        doubleArrayOf(3.2404542, -1.5371385, -0.4985314),
        doubleArrayOf(-0.9692660, 1.8760108, 0.0415560),
        doubleArrayOf(0.0556434, -0.2040259, 1.0572252),
    )
    private val PROPHOTO_TO_XYZ = arrayOf(
        doubleArrayOf(0.7976749, 0.1351917, 0.0313534),
        doubleArrayOf(0.2880402, 0.7118741, 0.0000857),
        doubleArrayOf(0.0, 0.0, 0.8252100),
    )
    private val XYZ_TO_PROPHOTO = arrayOf(
        doubleArrayOf(1.3459433, -0.2556075, -0.0511118),
        doubleArrayOf(-0.5445989, 1.5081673, 0.0205351),
        doubleArrayOf(0.0, 0.0, 1.2118128),
    )
    private val BRADFORD = arrayOf(
        doubleArrayOf(0.8951, 0.2664, -0.1614),
        doubleArrayOf(-0.7502, 1.7135, 0.0367),
        doubleArrayOf(0.0389, -0.0685, 1.0296),
    )
    private val BRADFORD_I = invert3(BRADFORD)

    /** Slider neutral: xy of 5500 K / tint 0. Same destination in both RGB spaces. */
    private val REF_WB: DoubleArray by lazy {
        val xy = xyFromTempTint(5500.0, 0.0)
        xyToXyz(xy.first, xy.second)
    }

    @JvmStatic
    fun needed(params: JSONObject?): Boolean {
        if (params == null) return false
        val mode = params.optString("whiteBalance", "as_shot")
        return mode.isNotEmpty() && mode != "as_shot"
    }

    /** In-place CAT. Call only on a buffer the caller owns (export, or a preview copy). */
    @JvmStatic
    fun applyInPlace(image: LinearImage, params: JSONObject?) {
        if (params == null || !needed(params)) return
        val mode = params.optString("whiteBalance", "as_shot")
        val kelvin: Double
        val tint: Double
        when (mode) {
            "daylight" -> {
                kelvin = 5500.0
                tint = 0.0
            }
            "tungsten" -> {
                kelvin = 3200.0
                tint = 0.0
            }
            else -> {
                kelvin = params.optDouble("temperature", 5500.0).coerceIn(2000.0, 12000.0)
                tint = sanitizeTint(params.optDouble("tint", 0.0))
            }
        }
        val prophoto = (image.colorSpace ?: "").contains("ProPhoto", ignoreCase = true) ||
            !(image.colorSpace ?: "").contains("sRGB", ignoreCase = true)
        val m = matrix(kelvin, tint, prophoto)
        if (isIdentity(m)) return
        image.acquireDataLease().use { lease ->
            val buf = lease.data.duplicate()
            buf.order(ByteOrder.nativeOrder())
            buf.rewind()
            val f = buf.asFloatBuffer()
            val n = image.width * image.height
            var i = 0
            while (i < n) {
                val r = f.get(i * 3).toDouble()
                val g = f.get(i * 3 + 1).toDouble()
                val b = f.get(i * 3 + 2).toDouble()
                f.put(i * 3, (m[0][0] * r + m[0][1] * g + m[0][2] * b).toFloat())
                f.put(i * 3 + 1, (m[1][0] * r + m[1][1] * g + m[1][2] * b).toFloat())
                f.put(i * 3 + 2, (m[2][0] * r + m[2][1] * g + m[2][2] * b).toFloat())
                i++
            }
        }
    }

    private fun sanitizeTint(n: Double): Double {
        if (n.isNaN()) return 0.0
        if (n in 0.55..1.45) return ((n - 1.0) * (150.0 / 0.4))
        return n.coerceIn(-150.0, 150.0)
    }

    private fun matrix(kelvin: Double, tint: Double, prophoto: Boolean): Array<DoubleArray> {
        if (kotlin.math.abs(kelvin - 5500.0) < 0.5 && kotlin.math.abs(tint) < 0.05) {
            return arrayOf(
                doubleArrayOf(1.0, 0.0, 0.0),
                doubleArrayOf(0.0, 1.0, 0.0),
                doubleArrayOf(0.0, 0.0, 1.0),
            )
        }
        val xy = xyFromTempTint(kelvin, tint)
        val src = xyToXyz(xy.first, xy.second)
        val rgbToXyz = if (prophoto) PROPHOTO_TO_XYZ else SRGB_TO_XYZ
        val xyzToRgb = if (prophoto) XYZ_TO_PROPHOTO else XYZ_TO_SRGB
        return bradfordCat(src, REF_WB, rgbToXyz, xyzToRgb)
    }

    private fun xyFromTempTint(kelvin: Double, tint: Double): Pair<Double, Double> {
        val t = min(50000.0, max(1667.0, kelvin))
        val r = 1.0e6 / t
        var i = 0
        val last = LOCUS.size - 2
        while (i < last && r >= LOCUS[i + 1].r) i++
        val a = LOCUS[i]
        val b = LOCUS[i + 1]
        val span = b.r - a.r
        val f = if (span <= 1e-12) 0.0 else (b.r - r) / span
        var u = a.u * f + b.u * (1.0 - f)
        var v = a.v * f + b.v * (1.0 - f)
        val (uu1, vv1) = unitSlope(a.t)
        val (uu2, vv2) = unitSlope(b.t)
        var uu = uu1 * f + uu2 * (1.0 - f)
        var vv = vv1 * f + vv2 * (1.0 - f)
        val n = hypot(uu, vv).let { if (it == 0.0) 1.0 else it }
        uu /= n
        vv /= n
        val offset = -tint / TINT_SCALE
        u += uu * offset
        v += vv * offset
        val d = u - 4.0 * v + 2.0
        return Pair(1.5 * u / d, v / d)
    }

    private fun unitSlope(t: Double): Pair<Double, Double> {
        val len = hypot(1.0, t)
        return Pair(1.0 / len, t / len)
    }

    private fun xyToXyz(x: Double, y: Double): DoubleArray {
        val yy = if (y <= 1e-8) 1e-8 else y
        return doubleArrayOf(x / yy, 1.0, (1.0 - x - y) / yy)
    }

    private fun bradfordCat(
        src: DoubleArray,
        dest: DoubleArray,
        rgbToXyz: Array<DoubleArray>,
        xyzToRgb: Array<DoubleArray>,
    ): Array<DoubleArray> {
        val ls = mulMv(BRADFORD, src)
        val ld = mulMv(BRADFORD, dest)
        val scale = arrayOf(
            doubleArrayOf(ld[0] / ls[0], 0.0, 0.0),
            doubleArrayOf(0.0, ld[1] / ls[1], 0.0),
            doubleArrayOf(0.0, 0.0, ld[2] / ls[2]),
        )
        val tmp1 = mulMm(BRADFORD, rgbToXyz)
        val tmp2 = mulMm(scale, tmp1)
        val tmp3 = mulMm(BRADFORD_I, tmp2)
        return mulMm(xyzToRgb, tmp3)
    }

    private fun mulMv(m: Array<DoubleArray>, v: DoubleArray): DoubleArray {
        return doubleArrayOf(
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
        )
    }

    private fun mulMm(a: Array<DoubleArray>, b: Array<DoubleArray>): Array<DoubleArray> {
        val out = Array(3) { DoubleArray(3) }
        for (i in 0..2) {
            for (j in 0..2) {
                out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
            }
        }
        return out
    }

    private fun invert3(m: Array<DoubleArray>): Array<DoubleArray> {
        val a = m[0][0]; val b = m[0][1]; val c = m[0][2]
        val d = m[1][0]; val e = m[1][1]; val f = m[1][2]
        val g = m[2][0]; val h = m[2][1]; val i = m[2][2]
        val det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
        val s = 1.0 / det
        return arrayOf(
            doubleArrayOf((e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s),
            doubleArrayOf((f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s),
            doubleArrayOf((d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s),
        )
    }

    private fun isIdentity(m: Array<DoubleArray>): Boolean {
        return hypot(m[0][0] - 1.0, m[1][1] - 1.0) < 1e-5 &&
            hypot(m[2][2] - 1.0, m[0][1]) < 1e-5 &&
            hypot(m[0][2], m[1][0]) < 1e-5 &&
            hypot(m[1][2], m[2][0]) < 1e-5 &&
            kotlin.math.abs(m[2][1]) < 1e-5
    }
}
