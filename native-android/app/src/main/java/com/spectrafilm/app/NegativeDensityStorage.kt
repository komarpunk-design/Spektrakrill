/* Only derived film-density buffers live here; recipes and sources are never removed. GPLv3. */
package com.spectrafilm.app

import android.content.Context
import java.io.File

internal fun negativeDensityDirectory(context: Context) = File(context.filesDir, "lab-profiles/negatives")
private fun densityFiles(directory: File) = directory.listFiles()?.filter {
    it.isFile && it.name.startsWith("v968_") && it.extension == "spkneg"
}.orEmpty()
internal fun negativeDensityBytes(directory: File): Long = densityFiles(directory).sumOf { it.length() }
internal fun clearNegativeDensityCache(directory: File): Int = densityFiles(directory).count { !it.delete() }
