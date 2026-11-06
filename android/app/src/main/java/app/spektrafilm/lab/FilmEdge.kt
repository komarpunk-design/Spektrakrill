/* GPLv3. Film-edge compositor adapted from hwx959/Spektrafilm-android,
 * branch spektra-zh, commit 80e420ece960c8d7b742ba7d7c15ee033d051b88.
 * Original renderer: app/src/main/java/com/spectrafilm/app/FilmEdge.kt.
 * Changes: package name, removed Compose UI, translated comments.
 * Film modeling powered by spektrafilm. See THIRD_PARTY_NOTICES.md.
 */
package app.spektrafilm.lab

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface


enum class FilmEdgeStyle {
    NONE,


    F135,


    F120,


    MINIMAL,
}


data class FilmEdgeSettings(
    val style: FilmEdgeStyle = FilmEdgeStyle.NONE,
    val dateText: String? = null,
    val frameNumber: Int = 18,

    val barcode: Boolean = true,
)

private class Margins(val top: Int, val bottom: Int, val left: Int, val right: Int)


private const val BASE_BLACK = 0xFF080908.toInt()
private const val BASE_WHITE = 0xFFF0ECE4.toInt()
private const val INK_ORANGE = 0xFFE87E2C.toInt()
private const val INK_DARK = 0xFF1C1C1C.toInt()
private const val PERF_WHITE = 0xFFFFFFFF.toInt()
private const val PERF_EDGE = 0xFFB6A8A8.toInt()
private const val DX_AMBER = 0xFFD9A227.toInt()


fun composeFilmEdge(src: Bitmap, settings: FilmEdgeSettings, stockLabel: String): Bitmap {
    if (settings.style == FilmEdgeStyle.NONE) return src

    val w = src.width
    val h = src.height
    val m = marginsFor(settings.style, w, h)
    val outW = w + m.left + m.right
    val outH = h + m.top + m.bottom


    val out = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        val space = src.colorSpace
            ?: android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB)
        Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888, false, space)
    } else {
        Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
    }
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val whiteBase = settings.style == FilmEdgeStyle.MINIMAL
    paint.color = if (whiteBase) BASE_WHITE else BASE_BLACK
    canvas.drawRect(0f, 0f, outW.toFloat(), outH.toFloat(), paint)


    canvas.drawBitmap(src, m.left.toFloat(), m.top.toFloat(), null)

    val imageRight = (m.left + w).toFloat()
    val imageBottom = (m.top + h).toFloat()

    when (settings.style) {
        FilmEdgeStyle.F135 -> draw135(
            canvas, paint, outW, outH, m, imageRight, imageBottom,
            stockLabel, settings.frameNumber, settings.barcode,
        )
        FilmEdgeStyle.F120 -> draw120(
            canvas, outW, outH, m, stockLabel, settings.frameNumber,
        )
        FilmEdgeStyle.MINIMAL -> drawMinimal(
            canvas, outW, outH, m, stockLabel, settings.frameNumber,
        )
        FilmEdgeStyle.NONE -> Unit
    }


    settings.dateText?.takeIf { it.isNotBlank() }?.let { date ->
        val dp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = (m.top * 0.26f).coerceAtLeast(10f)
            color = 0xFFFF8A1E.toInt()
        }
        val pad = m.top * 0.26f
        canvas.drawText(date, imageRight - dp.measureText(date) - pad, imageBottom - pad, dp)
    }

    return out
}


private fun drawPerfRow(
    canvas: Canvas, outW: Int, left: Int, right: Int, centerY: Float, perfH: Float,
) {
    val perfW = perfH * 1.30f
    val gap = perfW * 1.02f
    val span = (right - left).toFloat()
    val count = ((span + gap) / (perfW + gap)).toInt().coerceAtLeast(2)
    val totalW = count * perfW + (count - 1) * gap
    val startX = left + (span - totalW) / 2f
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PERF_WHITE }
    val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = (perfH * 0.05f).coerceAtLeast(1f)
        color = PERF_EDGE
    }
    for (i in 0 until count) {
        val x = startX + i * (perfW + gap)
        val r = RectF(x, centerY - perfH / 2f, x + perfW, centerY + perfH / 2f)
        canvas.drawRoundRect(r, perfW * 0.16f, perfW * 0.16f, fill)
        canvas.drawRoundRect(r, perfW * 0.16f, perfW * 0.16f, edge)
    }
    @Suppress("UNUSED_EXPRESSION") outW
}

private fun draw135(
    canvas: Canvas, paint: Paint, outW: Int, outH: Int, m: Margins,
    imageRight: Float, imageBottom: Float, stockLabel: String, frame: Int, barcode: Boolean,
) {
    val band = m.top.toFloat()
    val perfH = band * 0.30f
    val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textSize = (band * 0.24f).coerceAtLeast(9f)
        color = INK_ORANGE
    }

    canvas.drawText(stockLabel.uppercase(), m.left + outW * 0.006f, band * 0.28f, ink)
    val mid = "${frame}A"
    canvas.drawText(mid, (outW - ink.measureText(mid)) / 2f, band * 0.28f, ink)
    val next = "${frame + 1}"
    canvas.drawText(next, outW - m.right - ink.measureText(next), band * 0.28f, ink)
    drawPerfRow(canvas, outW, m.left, outW - m.right, band * 0.68f, perfH)


    val bottomBand = outH - imageBottom
    drawPerfRow(canvas, outW, m.left, outW - m.right, imageBottom + bottomBand * 0.22f, perfH)

    if (barcode) {
        val bcTop = imageBottom + bottomBand * 0.48f
        paint.color = DX_AMBER
        canvas.drawRect(0f, bcTop, outW.toFloat(), outH.toFloat(), paint)
        val tick = Paint(paint).apply { color = 0xFF12100C.toInt() }
        val unit = outW / 190f
        var x = 0f
        var i = 0
        val pattern = intArrayOf(1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 4, 2, 1, 3)
        while (x < outW) {
            val wUnit = pattern[i % pattern.size]
            canvas.drawRect(x, bcTop, x + unit * wUnit, outH.toFloat(), tick)
            x += unit * (wUnit + 2)
            i++
        }
        val bcText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = bottomBand * 0.24f
            color = 0xFF12100C.toInt()
        }
        val baseline = outH - bottomBand * 0.16f
        val leftLabel = "→ ${frame}A"
        val rightLabel = "${frame + 1}"

        paint.color = DX_AMBER
        canvas.drawRect(m.left.toFloat(), bcTop, m.left + bcText.measureText(leftLabel) + unit * 5f, outH.toFloat(), paint)
        canvas.drawRect(
            outW - m.right - bcText.measureText(rightLabel) - unit * 5f,
            bcTop, outW.toFloat(), outH.toFloat(), paint,
        )
        canvas.drawText(leftLabel, m.left + outW * 0.02f, baseline, bcText)
        canvas.drawText(
            rightLabel,
            outW - m.right - outW * 0.02f - bcText.measureText(rightLabel),
            baseline,
            bcText,
        )
    }


    val stroke = (band * 0.04f).coerceAtLeast(1.5f)
    val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        color = PERF_WHITE
    }
    canvas.drawRect(
        RectF(
            m.left - stroke / 2f,
            m.top - stroke / 2f,
            imageRight + stroke / 2f,
            imageBottom + stroke / 2f,
        ),
        line,
    )
}


private fun draw120(
    canvas: Canvas, outW: Int, outH: Int, m: Margins, stockLabel: String, frame: Int,
) {
    val band = m.top.toFloat()
    val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textSize = (band * 0.30f).coerceAtLeast(9f)
        color = INK_ORANGE
    }
    canvas.drawText(stockLabel.uppercase(), m.left + outW * 0.01f, band * 0.58f, ink)
    val right = "${frame}A"
    canvas.drawText(right, outW - m.right - outW * 0.01f - ink.measureText(right), band * 0.58f, ink)
    canvas.drawText("120  ·  ${frame}A", m.left + outW * 0.01f, outH - m.bottom * 0.42f, ink)
}

private fun drawMinimal(
    canvas: Canvas, outW: Int, outH: Int, m: Margins, stockLabel: String, frame: Int,
) {
    val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        textSize = (m.bottom * 0.28f).coerceAtLeast(8f)
        color = 0x991C1C1C.toInt()
    }
    canvas.drawText(
        "$stockLabel  ·  ${frame}A",
        m.left + outW * 0.012f,
        outH - m.bottom * 0.45f,
        ink,
    )
}


private fun marginsFor(style: FilmEdgeStyle, w: Int, h: Int): Margins {
    val short = minOf(w, h).toFloat()
    return when (style) {

        FilmEdgeStyle.F135 -> {
            val top = (short * 0.115f).toInt().coerceAtLeast(14)
            val bottom = (short * 0.165f).toInt().coerceAtLeast(20)
            val side = (short * 0.012f).toInt().coerceAtLeast(3)
            Margins(top, bottom, side, side)
        }

        FilmEdgeStyle.F120 -> {
            val top = (short * 0.145f).toInt().coerceAtLeast(16)
            val bottom = (short * 0.145f).toInt().coerceAtLeast(16)
            val side = (short * 0.018f).toInt().coerceAtLeast(4)
            Margins(top, bottom, side, side)
        }
        FilmEdgeStyle.MINIMAL -> {
            val side = (short * 0.045f).toInt().coerceAtLeast(10)
            val bottom = (short * 0.11f).toInt().coerceAtLeast(24)
            Margins(side, bottom, side, side)
        }
        FilmEdgeStyle.NONE -> Margins(0, 0, 0, 0)
    }
}
