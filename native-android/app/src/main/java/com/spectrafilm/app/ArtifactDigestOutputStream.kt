/* GPLv3. Compute the artifact digest in the encoder/copy pass, before publication. */
package com.spectrafilm.app

import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.CancellationException

/** Owns neither the underlying stream nor the file. Finish only after close/fsync and no mutations. */
internal class ArtifactDigestOutputStream(
    private val sink: OutputStream,
    private val isCancelled: () -> Boolean = { false },
) : OutputStream() {
    private val digest = MessageDigest.getInstance("SHA-256")
    private var count = 0L
    private var finished = false

    private fun checkWritable() {
        check(!finished) { "artifact digest already finalized" }
        if (isCancelled()) throw CancellationException("export encoding/copy cancelled")
    }

    override fun write(value: Int) {
        checkWritable()
        sink.write(value)
        digest.update(value.toByte())
        count++
    }

    override fun write(buffer: ByteArray, offset: Int, length: Int) {
        checkWritable()
        sink.write(buffer, offset, length)
        digest.update(buffer, offset, length)
        count += length
        checkWritable()
    }

    override fun flush() = sink.flush()
    override fun close() = flush() // The owner still needs to fsync the file descriptor.

    fun finish(file: File): EncodedArtifact {
        checkWritable()
        if (count <= 0L || !file.isFile || file.length() != count) {
            throw IOException("streamed artifact length differs from staged file")
        }
        finished = true
        return EncodedArtifact(file, count, ExportCache.hex(digest.digest()))
    }
}
