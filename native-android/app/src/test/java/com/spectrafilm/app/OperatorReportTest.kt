package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test

class OperatorReportTest {
    private fun report(nativeId: Long = 47, backend: String = "gpu-assisted") = """
        {"schema":"spk.operator_report.v1","render_id":47,"kind":"preview_final",
         "native":{"schema":"spk.operators.v1","render_id":$nativeId,
          "operators":[{"stage":"expose","backend":"$backend","total_ms":3.5,"compute_ms":1.25,"reason":"eligible"}]}}
    """.trimIndent()

    @Test fun reportsTheActualNativeStageAndMatchingPublicationId() {
        val value = requireNotNull(OperatorReport.parse(report()))
        assertEquals(47L, value.renderId)
        assertEquals("gpu-assisted", value.stages.single().backend)
        assertEquals(1.25, value.stages.single().computeMs, 0.0)
        assertEquals(3.5, value.stages.single().totalMs, 0.0)
    }
    @Test fun refusesMismatchedRenderIdsAndUnknownBackends() {
        assertNull(OperatorReport.parse(report(nativeId = 46)))
        assertNull(OperatorReport.parse(report(backend = "gpu-preference-enabled")))
    }
    @Test fun refusesMalformedAndUnboundedInput() {
        assertNull(OperatorReport.parse(""))
        assertNull(OperatorReport.parse("{"))
        assertNull(OperatorReport.parse(" ".repeat(17000)))
    }
    @Test fun refusesNegativeOrNonfiniteDurations() {
        assertNull(OperatorReport.parse(report().replace("3.5", "-1")))
        assertNull(OperatorReport.parse(report().replace("3.5", "1e999")))
    }
}
