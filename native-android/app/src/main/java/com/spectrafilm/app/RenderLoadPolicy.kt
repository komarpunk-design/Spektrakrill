/* GPLv3. Scheduling only: thermal/power policy never changes an image recipe. */
package com.spectrafilm.app

import android.content.Context
import android.os.Build
import android.os.PowerManager
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive

internal data class RenderLoad(val thermalStatus: Int = 0, val powerSave: Boolean = false) {
    // Android thermal constants are stable integers; unavailable telemetry means unknown/0.
    val allowSpeculation: Boolean get() = !powerSave && thermalStatus < 2
    val needsCooling: Boolean get() = thermalStatus >= 4

    fun batchRestMs(previousPhotoMs: Long): Long = when {
        thermalStatus >= 3 -> (previousPhotoMs.coerceAtLeast(0L) / 2).coerceAtMost(10_000L)
        thermalStatus >= 2 || powerSave -> (previousPhotoMs.coerceAtLeast(0L) / 6).coerceAtMost(3_000L)
        else -> 0L
    }
}

internal fun currentRenderLoad(context: Context): RenderLoad {
    val power = context.getSystemService(PowerManager::class.java) ?: return RenderLoad()
    val thermal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        runCatching { power.currentThermalStatus }.getOrDefault(0)
    } else 0
    return RenderLoad(thermal, runCatching { power.isPowerSaveMode }.getOrDefault(false))
}

/** Cancel is checked even during critical-temperature waits. No file is reserved while waiting. */
internal suspend fun awaitBatchCooling(
    previousPhotoMs: Long,
    readLoad: () -> RenderLoad,
    onWaiting: (Boolean) -> Unit,
    pause: suspend (Long) -> Unit = { delay(it) },
): Long {
    var waited = 0L
    var announced = false
    try {
        while (true) {
            currentCoroutineContext().ensureActive()
            val load = readLoad()
            val remaining = load.batchRestMs(previousPhotoMs) - waited
            if (!load.needsCooling && remaining <= 0L) return waited
            if (!announced) { announced = true; onWaiting(true) }
            val step = if (load.needsCooling) 1_000L else minOf(250L, remaining)
            pause(step)
            waited += step
        }
    } finally {
        if (announced) onWaiting(false)
    }
}
