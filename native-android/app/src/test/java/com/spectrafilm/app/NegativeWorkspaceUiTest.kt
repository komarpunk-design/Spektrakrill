package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Text
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
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h780dp")
class NegativeWorkspaceUiTest {
    @get:Rule(order=0) val host = ComposeHostActivityRule()
    @get:Rule(order=1) val compose = createComposeRule()
    private val s = ParamsState().apply { negativeSourceKey = "RAW|content://one|0" }
    private fun show() {
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        compose.setContent { MaterialTheme {
            CompositionLocalProvider(LocalPhotoNavigate provides {}) {
                Column(Modifier.verticalScroll(rememberScrollState())) { ScanWorkspace(s) }
            }
        } }
    }
    @Test fun negativeViewReturnsToTheSamePositiveWithoutRealNegativeConversion() {
        show()
        compose.onNodeWithTag("negative-start").performClick()
        compose.onNodeWithTag("negative-freeze").performScrollTo().performClick()
        compose.onNodeWithText("Виртуальный негатив · зафиксирован").performScrollTo().performClick()
        compose.onNodeWithTag("negative-view").performScrollTo().performClick()
        compose.onNodeWithText("При сохранении будет выведен этот негатив", substring = true).assertExists()
        compose.runOnIdle { assertEquals("normal", s.labString("workflow", "normal")); assertTrue(s.negativeIsFrozen()) }
        compose.onNodeWithTag("negative-positive").performClick()
        compose.onNodeWithText("Автоподбор адаптера").performScrollTo().assertExists()
        compose.runOnIdle { assertEquals("noritsu-ls600", s.labString("outputModel.mode")) }
    }
    @Test @Config(sdk=[35],qualifiers="w320dp-h640dp")
    fun variantsAndScannerControlsRemainReachableOnSmallPhone() {
        show()
        compose.onNodeWithTag("negative-start").performClick()
        compose.onNodeWithTag("negative-add-variant").performScrollTo().performClick()
        compose.runOnIdle { s.chooseScanReceiver("digital"); s.setLab("outputModel.exposure", .7) }
        compose.onNodeWithTag("negative-variant-0").performScrollTo().performClick()
        compose.runOnIdle { assertEquals("noritsu-ls600", s.labString("outputModel.mode")); assertEquals(0f, s.labNumber("outputModel.exposure"), 0f) }
        compose.onNodeWithTag("negative-variant-1").performClick()
        compose.runOnIdle { assertEquals("digital", s.labString("outputModel.mode")); assertEquals(.7f, s.labNumber("outputModel.exposure"), 1e-6f) }
        compose.onNodeWithText("Детализация").performScrollTo().performClick()
        compose.onNodeWithText("Нерезкая маска").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("negative-freeze").performScrollTo().performClick()
        val directory = File("build/reports/negative-workspace").apply { mkdirs() }
        File(directory,"phone-320.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
    }
    @Test fun negativeWorkspaceIsNotOfferedForPhysicalNegatives() {
        s.setLab("workflow", "negative-scan")
        show()
        compose.onNodeWithTag("negative-start").assertDoesNotExist()
    }
    @Test fun canvasSwitchIsAvailableOutsideScannerPanel() {
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        s.startNegativeWorkspace()
        var opened = false
        compose.setContent { MaterialTheme { NegativeCanvasToolbar(s) { opened = true } } }
        compose.onNodeWithTag("canvas-negative").performClick()
        compose.runOnIdle { assertEquals("negative", s.labString("outputModel.mode")) }
        compose.onNodeWithTag("canvas-positive").performClick()
        compose.onNodeWithTag("canvas-scan-variants").performClick()
        compose.onNodeWithText("Настройки скана").performClick()
        compose.runOnIdle { assertTrue(opened); assertEquals("noritsu-ls600", s.labString("outputModel.mode")) }
    }

    @Test @Config(sdk=[35],qualifiers="w320dp-h640dp")
    fun actualEditorBodyKeepsNegativeSwitchVisibleAndProtectsDevelopment() {
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        s.startNegativeWorkspace(); s.freezeNegative()
        compose.setContent { MaterialTheme {
            var active by remember { mutableStateOf<Category?>(Category.SCANNER) }
            Column(Modifier.fillMaxSize()) {
                EditorBody(foldingFeature=null,state=s,onParamsChanged={},activeCategory=active,
                    onActiveCategoryChange={active=it},toolShown={true},wide=false,chromeHidden=false,
                    panelBackEnabled=true,sliderInteraction=remember{SliderInteraction()},
                    interacting=remember{mutableStateOf(false)},sliderReadout=remember{mutableStateOf<SliderReadout?>(null)},
                    panelBackProgress=0f,exportVisible=false,exportInFlight=false,onExport={},onShare={},onOpenCrop={},
                    toolContent={ if(LocalPhotoTool.current == PhotoTool.SCAN) ScanWorkspace(s) },
                    previewRegion={_,_->Box(Modifier.fillMaxSize().background(Color.DarkGray))},sourceKey="content://one")
            }
        } }
        compose.onNodeWithTag("canvas-negative").assertIsDisplayed().performClick()
        compose.onNodeWithTag("canvas-positive").assertIsDisplayed().performClick()
        val directory=File("build/reports/negative-workspace").apply{mkdirs()}
        File(directory,"editor-320.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)
        }
        compose.onNodeWithTag("workflow-stage-DEVELOPMENT").performClick()
        compose.onNodeWithText("Проявка зафиксирована.",substring=true).assertExists()
        compose.onNodeWithText("Вернуться к проявке").performClick()
        compose.runOnIdle { assertFalse(s.negativeIsFrozen()); assertEquals(1,s.negativeWorkspace().getJSONArray("variants").length()) }
    }
}
