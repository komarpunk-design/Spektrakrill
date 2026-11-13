/* Memory-admitted native RAW previews. GPLv3. */
package com.spectrafilm.app

import com.spectrafilm.libraw.DecodeStatus
import com.spectrafilm.libraw.RawDecodeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * Keep the ordinary proxy path. On a typed memory refusal, reclaim idle GPU buffers and
 * retry LibRaw once with the SAME measured, held reservation used by export. The output
 * remains capped by the caller's preview edge. No reservation means no enlarged retry;
 * cancellation and unrelated decode failures never invoke the second route.
 */
internal suspend fun <T> decodeRawPreviewWithMemoryAdmission(
    admit: () -> RawDecodeAdmission,
    reclaim: () -> Unit = {
        releaseGpuAfterFullResRender("RAW preview admission")
        Runtime.getRuntime().gc()
    },
    log: (String) -> Unit = { Diag.w(it) },
    decode: suspend (admittedBytes: Long) -> T,
): T {
    val first = try {
        return decode(0L)
    } catch (failure: RawDecodeException) {
        if (failure.status != DecodeStatus.NO_MEMORY) throw failure
        failure
    }
    currentCoroutineContext().ensureActive()
    log("RAW preview tier refused (${first.message}); reclaiming and checking actual decode budget")
    reclaim()
    currentCoroutineContext().ensureActive()
    try {
        return admit().use { admission ->
            // Zero preserves the original tiers and would just repeat the same refusal.
            // Never enlarge a decode without a useful reservation held for its duration.
            if (admission.bytes < RAW_ADMISSION_MIN_BYTES) throw first
            currentCoroutineContext().ensureActive()
            log("RAW preview retry with ${admission.bytes / 1_048_576L} MiB held for native decode")
            decode(admission.bytes)
        }
    } catch (second: Throwable) {
        if (second !== first && second !is CancellationException) second.addSuppressed(first)
        throw second
    }
}
