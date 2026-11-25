package com.spectrafilm.app

import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.CancellationException
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ArtifactDigestOutputStreamTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun mixedEncoderChunksMatchTheCompletedFileDigest() {
        val file = folder.newFile()
        lateinit var stream: ArtifactDigestOutputStream
        FileOutputStream(file).use { output ->
            stream = ArtifactDigestOutputStream(output)
            stream.write(0x1ff)
            stream.write(byteArrayOf(1, 2, 3, 4, 5), 1, 3)
            stream.write(ByteArray(600_000) { it.toByte() })
            stream.close() // must leave the file descriptor available for fsync
            output.fd.sync()
        }
        assertEquals(EncodedArtifact.fromCompletedFile(file), stream.finish(file))
        try { stream.finish(file); fail("cannot finalize twice") } catch (_: IllegalStateException) { }
    }

    @Test fun truncatedStreamIsRejectedBeforePublication() {
        val file = folder.newFile()
        lateinit var stream: ArtifactDigestOutputStream
        FileOutputStream(file).use { output ->
            stream = ArtifactDigestOutputStream(output)
            stream.write(byteArrayOf(1, 2, 3))
        }
        file.writeBytes(byteArrayOf(1))
        try { stream.finish(file); fail("must reject truncation") } catch (_: IOException) { }
    }

    @Test fun cancelledEncodingNeverYieldsAnArtifact() {
        val file = folder.newFile()
        var cancelled = false
        FileOutputStream(file).use { output ->
            val stream = ArtifactDigestOutputStream(output) { cancelled }
            stream.write(byteArrayOf(1, 2, 3))
            cancelled = true
            try { stream.finish(file); fail("must cancel") } catch (_: CancellationException) { }
        }
    }

}
