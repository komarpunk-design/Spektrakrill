package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test

class ToolDirectoryTest {
    @Test fun everyExistingToolHasAPlaceAndPurpose(){
        assertEquals(PhotoTool.entries.toList(),toolDirectoryResults("",null,false,emptySet()))
        PhotoTool.entries.forEach{assertTrue(it.purpose.isNotBlank())}
        for(stage in PhotoStage.entries)assertEquals(photoTools(stage),toolDirectoryResults("",stage,false,emptySet()))
    }
    @Test fun beginnersCanSearchByTaskOrScannerInsteadOfKnowingTheStage(){
        for(query in listOf("Noritsu","норицу","норитсу","Lab Scan","резкость"))assertTrue(query,PhotoTool.SCAN in toolDirectoryResults(query,null,false,emptySet()))
        assertTrue(PhotoTool.OUTPUT_COLOR in toolDirectoryResults("гамут",null,false,emptySet()))
        assertTrue(PhotoTool.NEGATIVE in toolDirectoryResults("калибровка",null,false,emptySet()))
        assertEquals(listOf(PhotoTool.FRAME),toolDirectoryResults("перфорация",null,false,emptySet()))
    }
    @Test fun changedFilterDoesNotInventOrDropTools(){
        val changed=setOf(PhotoTool.GRAIN,PhotoTool.PRESETS)
        assertEquals(changed,toolDirectoryResults("",null,true,changed).toSet())
        assertEquals(listOf(PhotoTool.GRAIN),toolDirectoryResults("",PhotoStage.EFFECTS,true,changed))
        assertTrue(toolDirectoryResults("не существует",null,false,changed).isEmpty())
    }
}
