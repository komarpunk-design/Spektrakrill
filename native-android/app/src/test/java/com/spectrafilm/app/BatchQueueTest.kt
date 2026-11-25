package com.spectrafilm.app

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class BatchQueueTest {
    private val context:Context get()=ApplicationProvider.getApplicationContext()
    private fun newQueue():BatchQueue=runBlocking {
        val state=ParamsState();state.filmProfile="kodak_portra_400";state.exposureCompensationEv=.7f
        BatchQueue.create(context,listOf(BatchExportSource(Uri.parse("content://photos/test"),"camera.raw",SourceKind.RAW)),BatchEditSource.SharedLook(Presets.encode(state)),ExportOptions(ExportFormat.JPEG,91,ExportSize.FULL,2048,"Batch"),true)
    }
    @Test fun recipeOptionsAndCursorSurviveReload() {
        val original=newQueue();val restored=BatchQueue.load(context,original.id)
        assertEquals(original.sources,restored.sources)
        assertEquals(original.options,restored.options)
        assertEquals(.7f,restored.edit(0).state.exposureCompensationEv)
        assertTrue(restored.keepGps)
        assertEquals("pending",restored.row(0).getString("status"))
    }
    @Test fun receiptRecoversPublicationThatWasNotAcknowledged() {
        val queue=newQueue();val output=File.createTempFile("batch-", ".jpg",context.cacheDir)
        val bytes=byteArrayOf(7,1,8,2);output.writeBytes(bytes)
        val sha=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it.toInt()and 255)}
        queue.reserved(0,Uri.fromFile(output).toString(),bytes.size.toLong(),sha)
        queue.row(0).put("status","running");queue.save()
        val restarted=BatchQueue.load(context,queue.id);restarted.reconcile(context)
        assertEquals("done",restarted.row(0).getString("status"))
        assertEquals(Uri.fromFile(output).toString(),restarted.row(0).getString("published"))
        restarted.reconcile(context)
        assertEquals("done",restarted.row(0).getString("status"))
    }
    @Test fun damagedPublishedFileBlocksAutomaticDuplicate() {
        val queue=newQueue();val output=File.createTempFile("batch-", ".jpg",context.cacheDir);output.writeBytes(byteArrayOf(1,2,3))
        queue.reserved(0,Uri.fromFile(output).toString(),3L,"0".repeat(64))
        val restored=BatchQueue.load(context,queue.id);restored.reconcile(context)
        assertEquals("blocked",restored.row(0).getString("status"))
        assertTrue(restored.row(0).getJSONObject("error").getString("message").contains("differs"))
    }
    @Test fun retryFailuresNeverProcessesOtherPendingOrFinishedPhotos() {
        val queue=newQueue()
        queue.rows.put(JSONObject(queue.row(0).toString()).put("status","failed"))
        queue.rows.put(JSONObject(queue.row(0).toString()).put("status","done"))
        assertEquals(setOf(0),queue.runnableIndices(false))
        assertEquals(setOf(1),queue.runnableIndices(true))
    }
    @Test fun realPerStageTimesAndFailureReasonArePersisted() {
        val queue=newQueue();var now=0L;val timing=BatchPhotoTiming{now}
        now=2_000_000;timing.enter(ExportStage.DECODE)
        now=9_000_000;queue.complete(0,"failed",timing,IllegalStateException("RAW decode failed"))
        val restored=BatchQueue.load(context,queue.id)
        assertEquals(2L,restored.phases().setupMs)
        assertEquals(7L,restored.phases().decodeMs)
        val error=restored.row(0).getJSONObject("error")
        assertEquals("DECODE",error.getString("stage"))
        assertEquals("RAW decode failed",error.getString("message"))
    }
}
