/* GPLv3. Immutable geometry only; never caches full-frame alpha or source pixels. */
package com.spectrafilm.app.masks

internal class PreparedMask(mask: Mask) {
    private fun interface Sampler { fun alphaAt(nx: Float, ny: Float): Float }
    private class Component(val source: Mask.Component, val sample: Sampler)
    private val unresolved = mask.components.any { it.shape is MaskComponent.Semantic }
    private val invert = mask.invert
    private val opacity = mask.opacity
    private val components = mask.components.map { item ->
        val sample: Sampler = when (val shape = item.shape) {
            is MaskComponent.Linear -> {
                val dx = shape.x1 - shape.x0; val dy = shape.y1 - shape.y0
                val lengthSquared = dx * dx + dy * dy
                Sampler { nx, ny -> if (lengthSquared < 1e-9f) 0f
                    else smoothstep(((nx - shape.x0) * dx + (ny - shape.y0) * dy) / lengthSquared) }
            }
            is MaskComponent.Radial -> {
                val radians = -shape.angleDeg * (Math.PI.toFloat() / 180f)
                val cosine = kotlin.math.cos(radians); val sine = kotlin.math.sin(radians)
                val feather = shape.feather.coerceIn(1e-3f, 1f)
                Sampler { nx, ny ->
                    var dx = nx - shape.cx; var dy = ny - shape.cy
                    if (shape.angleDeg != 0f) {
                        val x = dx * cosine - dy * sine; val y = dx * sine + dy * cosine
                        dx = x; dy = y
                    }
                    val ex = if (shape.rx > 1e-6f) dx / shape.rx else 0f
                    val ey = if (shape.ry > 1e-6f) dy / shape.ry else 0f
                    smoothstep((1f - kotlin.math.sqrt(ex * ex + ey * ey)) / feather)
                }
            }
            else -> Sampler { nx, ny -> shape.alphaAt(nx, ny) }
        }
        Component(item, sample)
    }.toTypedArray()

    fun alphaAt(nx: Float, ny: Float): Float {
        if (unresolved) return 0f
        var alpha = 0f
        for (component in components) {
            val item = component.source
            var c = component.sample.alphaAt(nx, ny).coerceIn(0f, 1f)
            if (item.invert) c = 1f - c
            if (item.value != 1f) c *= item.value
            alpha = when (item.mode) {
                BlendMode.ADD -> alpha + c - alpha * c
                BlendMode.INTERSECT -> alpha * c
                BlendMode.SUBTRACT -> alpha * (1f - c)
            }
        }
        if (invert) alpha = 1f - alpha
        return (alpha * opacity).coerceIn(0f, 1f)
    }

    fun rasterizeRow(w: Int, h: Int, y: Int, out: FloatArray) {
        require(w > 0 && h > 0 && y in 0 until h && out.size >= w)
        val invW = 1f / w; val ny = (y + .5f) * (1f / h)
        for (x in 0 until w) {
            val alpha = alphaAt((x + .5f) * invW, ny)
            out[x] = if (alpha.isFinite()) alpha.coerceIn(0f, 1f) else 0f
        }
    }

    fun coverage(n: Int = 32): Float {
        require(n > 0)
        var sum = 0f
        for (y in 0 until n) for (x in 0 until n) sum += alphaAt((x + .5f) / n, (y + .5f) / n)
        return sum / (n * n)
    }
}

internal object MaskGeometryCache {
    private val entries = LinkedHashMap<Mask, PreparedMask>(16, .75f, true)
    private var components = 0

    @Synchronized fun prepare(mask: Mask): PreparedMask {
        // Bound semantic components own a photo probability field: never retain that field here.
        if (mask.components.size > 64 || mask.components.any {
                it.shape !is MaskComponent.Linear && it.shape !is MaskComponent.Radial
            }) return PreparedMask(mask)
        val key = mask.copy(components = mask.components.toList(), luminanceRange = null, colorRange = null)
        entries[key]?.let { return it }
        val prepared = PreparedMask(key)
        entries[key] = prepared; components += key.components.size
        while (entries.size > 32 || components > 256) {
            val first = entries.entries.iterator()
            components -= first.next().key.components.size; first.remove()
        }
        return prepared
    }
}
