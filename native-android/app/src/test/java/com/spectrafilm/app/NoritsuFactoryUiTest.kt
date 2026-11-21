package com.spectrafilm.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[35],qualifiers="w320dp-h640dp")
class NoritsuFactoryUiTest {
    @get:Rule(order=0)val host=ComposeHostActivityRule()
    @get:Rule(order=1)val compose=createComposeRule()
    @Test fun builtinCanBeEnabledWithoutImportingAFileAndEveryStageCanBeChanged(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        val s=ParamsState().apply{chooseScanReceiver("noritsu-ls600")}
        compose.setContent{MaterialTheme{Column(Modifier.verticalScroll(rememberScrollState())){NoritsuJobControls(s)}}}
        compose.onNodeWithTag("noritsu-factory-profile").performScrollTo().performClick()
        compose.waitUntil(15000){s.labBoolean("outputModel.noritsuJobEnabled")}
        compose.runOnIdle{
            assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"))
            assertTrue(s.labJson.length<1024)
            NORITSU_JOB_KEYS.forEach{assertTrue(s.labBoolean("outputModel.$it"))}
        }
        compose.onNodeWithText("Согласовать вход с виртуальной плёнкой").performScrollTo().assertExists()
        for((title,key)in listOf("Local Auto Contrast" to "noritsuLocalContrast","Film Sharp" to "noritsuFilmSharp","Hue/Saturation S0" to "noritsuHueSat")){
            compose.onNodeWithText(title).performScrollTo().performClick()
            compose.runOnIdle{assertFalse(s.labBoolean("outputModel.$key"))}
            compose.onNodeWithText(title).performClick()
            compose.runOnIdle{assertTrue(s.labBoolean("outputModel.$key"))}
        }
        compose.onNodeWithText("Отключить профильные стадии").performScrollTo().performClick()
        compose.runOnIdle{NORITSU_JOB_KEYS.forEach{assertFalse(s.labBoolean("outputModel.$it"))};assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"))}
    }
}
