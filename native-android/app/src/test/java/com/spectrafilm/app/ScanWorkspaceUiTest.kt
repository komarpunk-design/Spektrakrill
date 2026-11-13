package com.spectrafilm.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createComposeRule
import org.json.JSONObject
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
@Config(sdk=[35],qualifiers="w360dp-h780dp")
class ScanWorkspaceUiTest {
    @get:Rule(order=0) val host=ComposeHostActivityRule()
    @get:Rule(order=1) val compose=createComposeRule()
    private val s=ParamsState()
    private fun show(navigate:(PhotoTool)->Unit={}) {
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        compose.setContent { MaterialTheme {
            CompositionLocalProvider(LocalPhotoNavigate provides navigate) {
                Column(Modifier.verticalScroll(rememberScrollState())) { ScanWorkspace(s) }
            }
        } }
    }
    @Test fun activationIsExplicitAndDoesNotChangePaperOrFilmExposure() {
        s.printExposure=1.8f;s.exposureCompensationEv=1.2f
        show()
        compose.onNodeWithText("Включить Lab Scan без бумаги").performClick()
        compose.onNodeWithText("Автоподбор кадра").assertExists()
        compose.runOnIdle {
            assertEquals("lab-scan",s.labString("outputModel.mode"))
            assertTrue(s.toParams().io.scanFilm)
            assertEquals(1.8f,s.printExposure,0f);assertEquals(1.2f,s.exposureCompensationEv,0f)
        }
    }
    @Test fun exactNumericEntryReachesTheNativeScanParameters() {
        s.chooseScanReceiver("lab-scan");show()
        compose.onNodeWithText("Тон и уровни").performScrollTo().performClick()
        compose.waitForIdle()
        val number = compose.onNode(hasContentDescription("Чёрная точка",substring=true) and hasClickAction() and hasAnyAncestor(hasTestTag("scan-control-blackPoint")))
        number.performScrollTo()
        compose.waitForIdle()
        number.performSemanticsAction(SemanticsActions.OnClick) { it() }
        compose.onNode(hasSetTextAction()).performTextReplacement("0.027")
        compose.onNodeWithText("Set").performClick()
        compose.waitForIdle()
        compose.runOnIdle {
            val model=JSONObject(s.toParams().experimentalJson).getJSONObject("outputModel")
            assertEquals(.027,model.getDouble("blackPoint"),1e-6)
            assertEquals(0f,s.exposureCompensationEv,0f)
        }
        // The decimal keyboard may omit a minus key. Verify the inline sign action
        // as well, including the actual negative value sent through the recipe.
        number.performSemanticsAction(SemanticsActions.OnClick) { it() }
        compose.onNodeWithContentDescription(RuntimeEnvironment.getApplication().getString(R.string.widget_numeric_entry_sign_toggle)).performClick()
        compose.onNodeWithText("Set").performClick()
        compose.runOnIdle { assertEquals(-.027f,s.labNumber("outputModel.blackPoint"),1e-6f) }

    }
    @Test fun importedOperatorOutsideTheRangeShowsTheEngineLimit() {
        s.chooseScanReceiver("lab-scan");s.setLab("outputModel.contrast",50)
        show()
        compose.onNodeWithText("Тон и уровни",substring=true).performScrollTo().performClick()
        compose.onNode(hasText("2.00") and hasAnyAncestor(hasTestTag("scan-control-contrast"))).assertExists()
    }
    @Test fun groupResetIsIndependentAndDoesNotReturnToPaper() {
        s.chooseScanReceiver("lab-scan");s.setLab("outputModel.contrast",1.4);s.setLab("outputModel.cyan",.3)
        show()
        compose.onNodeWithText("Тон и уровни",substring=true).performScrollTo().performClick()
        compose.onNodeWithText("Сбросить тон и уровни").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(1f,s.labNumber("outputModel.contrast"),0f)
            assertEquals(.3f,s.labNumber("outputModel.cyan"),0f)
            assertEquals("lab-scan",s.labString("outputModel.mode"))
        }
    }
    @Test fun digitalReferenceDoesNotOfferInertAutomaticOrFinishControls() {
        s.chooseScanReceiver("digital");show()
        compose.onNodeWithText("Автоподбор кадра").assertDoesNotExist()
        compose.onNodeWithText("Характер минилаба").assertDoesNotExist()
        compose.onNodeWithText("Яркость скана · EV").assertExists()
        compose.onNodeWithText("Тон и уровни").assertExists()
    }
    @Test fun slidesExplainBypassWithoutClearingSavedScanEdits() {
        s.filmProfile="fujifilm_velvia_100";s.chooseScanReceiver("lab-scan");s.setLab("outputModel.contrast",1.4)
        show()
        compose.onNodeWithText("Выбрать негативную плёнку").assertIsDisplayed()
        compose.onNodeWithText("Яркость скана · EV").assertDoesNotExist()
        compose.runOnIdle { assertEquals(1.4f,s.labNumber("outputModel.contrast"),1e-6f) }
    }
    @Test fun aRealNegativePrintGoesToItsOwnCalibrationRoute() {
        s.setLab("workflow","negative-print");var opened:PhotoTool?=null
        show { opened=it }
        compose.onNodeWithText("Открыть настоящий негатив").performClick()
        compose.runOnIdle { assertEquals(PhotoTool.NEGATIVE,opened);assertEquals("negative-print",s.labString("workflow")) }
    }
    @Test @Config(sdk=[35],qualifiers="w320dp-h640dp") fun colourAndDetailRemainReachableOnASmallPhone() {
        s.chooseScanReceiver("lab-scan");show()
        compose.onNodeWithText("Цветовой баланс · CMY").performScrollTo().performClick()
        compose.onNodeWithText("Синий ↔ жёлтый").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Детализация").performScrollTo().performClick()
        compose.onNodeWithText("Нерезкая маска").performScrollTo().assertIsDisplayed()
    }
}
