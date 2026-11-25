/* GPLv3. Process-scoped scheduling; image algorithms and parameter values are unchanged. */
package com.spectrafilm.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.spectrafilm.engine.SpektraEngine

/** Install after native engine initialization. Retains only the application context. */
internal object ThermalScheduling {
    private var installed = false

    @Synchronized fun install(context: Context) {
        if (installed) return
        val app = context.applicationContext
        val power = app.getSystemService(PowerManager::class.java) ?: return
        fun refresh() {
            runCatching {
                val load = currentRenderLoad(app)
                val workers = load.workerLimit(Runtime.getRuntime().availableProcessors())
                SpektraEngine.setThermalWorkerLimit(workers)
            }.onFailure { Diag.w("thermal scheduling update failed: ${it.message}") }
        }
        refresh()
        // Keep the independent registrations independent: unavailable thermal telemetry must
        // not disable power-save updates, or vice versa. Android owns listeners for process life.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching {
                power.addThermalStatusListener(app.mainExecutor) { refresh() }
            }.onFailure { Diag.w("thermal listener unavailable: ${it.message}") }
        }
        runCatching {
            ContextCompat.registerReceiver(app, object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) { refresh() }
            }, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED)
        }.onFailure { Diag.w("power-save listener unavailable: ${it.message}") }
        installed = true
    }
}
