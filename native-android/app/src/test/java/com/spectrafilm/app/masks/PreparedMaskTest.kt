package com.spectrafilm.app.masks

import org.junit.Assert.*
import org.junit.Test

class PreparedMaskTest {
    private fun mask(angle: Float, invert: Boolean = false) = Mask(listOf(
        Mask.Component(BlendMode.ADD, MaskComponent.Radial(.42f, .54f, .37f, .21f, .63f, angle)),
        Mask.Component(BlendMode.SUBTRACT, MaskComponent.Linear(.13f, .24f, .71f, .93f), value = .72f),
        Mask.Component(BlendMode.ADD, MaskComponent.Radial(.8f, .2f, .23f, .09f, 1f, -13f), invert = true, value = .41f),
    ), invert = invert, opacity = .81f)

    @Test fun compiledGeometryIsBitIdenticalToTheOriginalCoordinateLaw() {
        for (angle in listOf(0f, 17.3f, -87f, 360f)) for (invert in listOf(false, true)) {
            val mask = mask(angle, invert); val prepared = MaskGeometryCache.prepare(mask)
            for (y in -2..47) for (x in -2..83) {
                val nx = (x + .5f) / 80f; val ny = (y + .5f) / 44f
                assertEquals(mask.alphaAt(nx, ny).toBits(), prepared.alphaAt(nx, ny).toBits())
            }
            assertEquals(MaskRaster.coverage(mask).toBits(), prepared.coverage().toBits())
        }
    }

    @Test fun rowRasterizationPreservesCentersAndFiniteClamping() {
        for (mask in listOf(mask(23f), Mask(invert = true), Mask(),
            Mask(listOf(Mask.Component(BlendMode.ADD, MaskComponent.Radial(0f, 0f, 0f, Float.NaN, 0f, 0f)))))) {
            val prepared = MaskGeometryCache.prepare(mask)
            val row = FloatArray(97)
            for (y in 0 until 53) {
                prepared.rasterizeRow(97, 53, y, row)
                val original = FloatArray(97); MaskRaster.rasterizeRow(mask, 97, 53, y, original)
                for (x in row.indices) assertEquals(original[x].toBits(), row[x].toBits())
            }
        }
    }

    @Test fun geometryIsReusedAcrossToneChangesAndInvalidatesForShapeChanges() {
        val source = mask(20f);val prepared = MaskGeometryCache.prepare(source)
        assertSame(prepared, MaskGeometryCache.prepare(source.copy(luminanceRange = LuminanceRange(.2f, .8f))))
        assertNotSame(prepared, MaskGeometryCache.prepare(mask(21f)))
        assertNotSame(prepared, MaskGeometryCache.prepare(source.copy(invert = true)))
        assertNotSame(prepared, MaskGeometryCache.prepare(source.copy(opacity = .8f)))
    }

    @Test fun evictionDoesNotChangeLiveGeometryAndUnboundSemanticsRemainInert() {
        val source = mask(7f);val prepared = MaskGeometryCache.prepare(source)
        repeat(70) { MaskGeometryCache.prepare(mask(it.toFloat() + 100f)) }
        assertEquals(source.alphaAt(.5f, .5f).toBits(), prepared.alphaAt(.5f, .5f).toBits())
        val unresolved = Mask(listOf(Mask.Component(BlendMode.ADD, MaskComponent.Semantic(setOf(SemanticClass.FACE_SKIN)))), invert = true)
        val semantic = MaskGeometryCache.prepare(unresolved)
        assertEquals(0f, semantic.alphaAt(.5f, .5f), 0f)
        assertNotSame(semantic, MaskGeometryCache.prepare(unresolved))
    }
}
