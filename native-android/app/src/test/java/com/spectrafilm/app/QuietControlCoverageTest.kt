package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class QuietControlCoverageTest {
    @Test fun everyDenseLabParameterAppearsExactlyOnceWithTheOriginalMetadata(){
        for(group in listOf("grain","chemistry","prep")){
            val rows=LabCatalog.controls(RuntimeEnvironment.getApplication(),group).filter{it.getString("kind")!="switch"}
            val buckets=labParameterBuckets(group,rows)
            val actual=buckets.flatMap{it.second}
            assertEquals(group,rows.size,actual.size)
            assertEquals(rows.map{it.getString("path")}.toSet(),actual.map{it.getString("path")}.toSet())
            actual.forEach{control->assertSame(rows.first{it.getString("path")==control.getString("path")},control)}
            val future=JSONObject().put("path","newParameter")
            assertTrue(labParameterBuckets(group,rows+future).flatMap{it.second}.contains(future))
        }
    }
}
