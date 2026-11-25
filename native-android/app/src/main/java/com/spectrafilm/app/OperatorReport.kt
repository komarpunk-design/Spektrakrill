/* GPLv3. Actual app-consumed native execution; no inference from the GPU preference switch. */
package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.json.JSONObject

internal data class OperatorStage(val name: String, val backend: String, val totalMs: Double,
    val uploadsMs: Double, val computeMs: Double, val readbackMs: Double, val hits: Long, val refusals: Long, val reason: String)
internal data class OperatorReport(val renderId: Long, val kind: String, val stages: List<OperatorStage>) {
    companion object {
        fun parse(text: String): OperatorReport? = runCatching {
            require(text.length <= 16384)
            val root = JSONObject(text)
            require(root.getString("schema") == "spk.operator_report.v1")
            val id = root.getLong("render_id"); require(id > 0)
            val native = root.getJSONObject("native")
            require(native.getString("schema") == "spk.operators.v1" && native.getLong("render_id") == id)
            val items = native.getJSONArray("operators"); require(items.length() <= 64)
            val stages = (0 until items.length()).map { index ->
                val item = items.getJSONObject(index)
                fun time(key: String): Double = item.optDouble(key, 0.0).also { require(it.isFinite() && it >= 0) }
                val backend = item.getString("backend")
                require(backend in setOf("cpu", "cache", "gpu-assisted", "unused"))
                OperatorStage(item.getString("stage"), backend, time("total_ms"), time("upload_ms"),
                    time("compute_ms"), time("readback_ms"), item.optLong("cache_hits"), item.optLong("refusals"), item.optString("reason"))
            }
            OperatorReport(id, root.getString("kind"), stages)
        }.getOrNull()
    }
}

@Composable internal fun OperatorReportContent(report: OperatorReport?) {
    Column(Modifier.fillMaxWidth().testTag("operator-report"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.operator_report_heading), style = MaterialTheme.typography.titleSmall)
        if (report == null) Text(stringResource(R.string.operator_report_empty))
        else {
            Text(stringResource(R.string.operator_report_identity, report.renderId, report.kind), style = MaterialTheme.typography.bodySmall)
            for (stage in report.stages) {
                val backend = when (stage.backend) {
                    "gpu-assisted" -> "GPU + CPU"
                    "cache" -> stringResource(R.string.operator_report_cache)
                    "cpu" -> "CPU"
                    else -> stringResource(R.string.operator_report_unused)
                }
                Text("${stage.name} · $backend", style = MaterialTheme.typography.labelLarge)
                Text(stringResource(R.string.operator_report_times, stage.totalMs, stage.uploadsMs, stage.computeMs, stage.readbackMs), style = MaterialTheme.typography.bodySmall)
                if (stage.reason.isNotBlank()) Text(stringResource(R.string.operator_report_reason, stage.reason), style = MaterialTheme.typography.bodySmall)
            }
            Text(stringResource(R.string.operator_report_note), style = MaterialTheme.typography.bodySmall)
        }
    }
}
