package app.spektrafilm.lab

import com.spectrafilm.engine.LinearImage
import java.nio.ByteOrder
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sin
import org.json.JSONObject

/**
 * Linear-domain RAW color science, applied AFTER white balance and BEFORE
 * Spektrafilm's 81-band simulate. Spektrafilm engine is a hard no-op.
 *
 * Picker idea from PhotonCamera (Apache-2.0). Warps are original parametric
 * reconstructions — no Phocus shaders, no stolen HNCS LUTs.
 */
object RawEngine {
    @JvmStatic
    fun needed(params: JSONObject?): Boolean {
        if (params == null) return false
        return engineOf(params) != "spektrafilm"
    }

    @JvmStatic
    fun applyInPlace(image: LinearImage, params: JSONObject?) {
        if (params == null || !needed(params)) return
        val engine = engineOf(params)
        val style = styleOf(params, engine)
        val w = warpFor(engine, style) ?: return
        image.acquireDataLease().use { lease ->
            val buf = lease.data.duplicate()
            buf.order(ByteOrder.nativeOrder())
            buf.rewind()
            val f = buf.asFloatBuffer()
            val n = image.width * image.height
            var i = 0
            while (i < n) {
                val o = i * 3
                val R = f.get(o)
                val G = f.get(o + 1)
                val B = f.get(o + 2)
                if (!R.isFinite() || !G.isFinite() || !B.isFinite()) {
                    i++
                    continue
                }
                val Y = 0.25f * R + 0.5f * G + 0.25f * B
                val Cg = -0.25f * R + 0.5f * G - 0.25f * B
                val Co = 0.5f * R - 0.5f * B
                val chroma0 = hypot(Cg.toDouble(), Co.toDouble()).toFloat()
                if (chroma0 < 1e-6f) {
                    if (w.highlight > 0f && Y > 0f) {
                        val y2 = Y / (1f + Y * 0.18f)
                        val s = 1f + (y2 / Y - 1f) * w.highlight
                        f.put(o, R * s)
                        f.put(o + 1, G * s)
                        f.put(o + 2, B * s)
                    }
                    i++
                    continue
                }
                val hue = atan2(Cg.toDouble(), Co.toDouble()).toFloat()
                val skin = lobe(hue, 0.18f, 0.55f)
                val green = lobe(hue, 1.35f, 0.7f)
                val blue = lobe(hue, -1.85f, 0.8f)
                var chroma = chroma0 * w.globalChroma *
                    (1f +
                        skin * (w.skinChroma - 1f) +
                        green * (w.greenChroma - 1f) +
                        blue * (w.blueChroma - 1f))
                if (w.shadowDesat > 0f && Y < 0.045f) {
                    val t = (Y / 0.045f).coerceAtLeast(0f)
                    chroma *= 1f - w.shadowDesat * (1f - t)
                }
                val hue2 = hue + skin * w.skinHue + green * w.greenHue + blue * w.blueHue
                var Yout = Y
                if (w.highlight > 0f && Y > 0f) {
                    val y2 = Y / (1f + Y * 0.18f)
                    Yout = Y + (y2 - Y) * w.highlight
                }
                val Cg2 = chroma * sin(hue2.toDouble()).toFloat()
                val Co2 = chroma * cos(hue2.toDouble()).toFloat()
                f.put(o, Yout - Cg2 + Co2)
                f.put(o + 1, Yout + Cg2)
                f.put(o + 2, Yout - Cg2 - Co2)
                i++
            }
        }
    }

    private fun engineOf(params: JSONObject): String {
        val s = params.optString("rawEngine", "spektrafilm").trim().lowercase()
        return when (s) {
            "hncs", "hncscm", "phocus", "hasselblad" -> "hasselblad"
            "panasonic", "v-gamut", "vgamut", "lumix" -> "lumix"
            "adobecurve", "camera_standard", "adobe" -> "adobe"
            else -> "spektrafilm"
        }
    }

    private fun styleOf(params: JSONObject, engine: String): String {
        val s = params.optString("rawEngineStyle", "standard").trim().lowercase()
        val allowed = when (engine) {
            "hasselblad" -> setOf("standard", "nature", "portrait", "reproduction")
            "lumix" -> setOf("standard", "vivid", "natural", "portrait", "landscape")
            "adobe" -> setOf("standard", "natural", "portrait", "landscape")
            else -> emptySet()
        }
        return if (s in allowed) s else "standard"
    }

    private class Warp(
        val globalChroma: Float,
        val skinChroma: Float,
        val skinHue: Float,
        val greenChroma: Float,
        val greenHue: Float,
        val blueChroma: Float,
        val blueHue: Float,
        val shadowDesat: Float,
        val highlight: Float,
    )

    private fun warpFor(engine: String, style: String): Warp? {
        if (engine == "spektrafilm") return null
        if (engine == "hasselblad") {
            return when (style) {
                "nature" -> Warp(1.12f, 1.06f, 0.03f, 1.18f, -0.10f, 1.08f, -0.04f, 0.35f, 0.14f)
                "portrait" -> Warp(0.88f, 1.16f, 0.06f, 0.90f, -0.04f, 0.92f, 0f, 0.28f, 0.16f)
                "reproduction" -> Warp(1.02f, 1.02f, 0.01f, 1.04f, -0.03f, 1.0f, 0f, 0.12f, 0.08f)
                else -> Warp(0.96f, 1.10f, 0.04f, 1.06f, -0.08f, 0.92f, -0.04f, 0.22f, 0.12f)
            }
        }
        if (engine == "lumix") {
            return when (style) {
                "vivid" -> Warp(1.22f, 1.08f, -0.02f, 1.12f, 0.04f, 1.14f, 0.05f, 0.08f, 0f)
                "natural" -> Warp(0.88f, 1.02f, 0.02f, 0.94f, 0f, 0.94f, 0f, 0.18f, 0f)
                "portrait" -> Warp(0.90f, 1.12f, 0.05f, 0.88f, 0f, 0.90f, 0f, 0.20f, 0.06f)
                "landscape" -> Warp(1.08f, 1.0f, 0f, 1.20f, -0.06f, 1.14f, 0.04f, 0.10f, 0f)
                else -> Warp(1.04f, 1.04f, 0.02f, 1.06f, 0f, 1.04f, 0.02f, 0.10f, 0f)
            }
        }
        return when (style) {
            "natural" -> Warp(0.92f, 1.0f, 0.02f, 0.96f, 0f, 0.96f, 0f, 0.10f, 0f)
            "portrait" -> Warp(0.96f, 1.12f, 0.05f, 0.94f, 0f, 0.94f, 0f, 0.14f, 0.04f)
            "landscape" -> Warp(1.06f, 1.02f, 0.02f, 1.12f, -0.04f, 1.08f, 0.03f, 0.08f, 0f)
            else -> Warp(1.03f, 1.08f, 0.04f, 0.98f, -0.02f, 1.0f, 0f, 0.10f, 0f)
        }
    }

    private fun lobe(hue: Float, center: Float, width: Float): Float {
        var d = hue - center
        val tau = (Math.PI * 2).toFloat()
        d = ((d + Math.PI.toFloat()) % tau + tau) % tau - Math.PI.toFloat()
        val x = d / width.coerceAtLeast(1e-6f)
        return exp(-0.5f * x * x)
    }
}
