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
class NikonScannerUiTest {
 @get:Rule(order=0)val host=ComposeHostActivityRule()
 @get:Rule(order=1)val compose=createComposeRule()
 @Test fun nikonIsAWorkingReceiverWithExplicitExposureControlsAndPresetRoundTrip(){
  LabCatalog.initialize(RuntimeEnvironment.getApplication());val s=ParamsState();s.chooseScanReceiver("lab-scan")
  compose.setContent{MaterialTheme{Column(Modifier.verticalScroll(rememberScrollState())){ScanWorkspace(s)}}}
  compose.onNodeWithText("Режим сканирования").performScrollTo().performClick()
  compose.onNodeWithText("Nikon Scan · модель v2 (эксперимент)").performClick()
  compose.onNodeWithText("Автоэкспозиция Nikon").performScrollTo().performClick()
  compose.runOnIdle{
   assertEquals("nikon-scan",s.labString("outputModel.mode"));assertFalse(s.labBoolean("outputModel.autoSetup"));assertTrue(s.toParams().io.scanFilm)
   val restored=ParamsState();Presets.decode(Presets.encode(s),restored);assertEquals(s.toParams(),restored.toParams())
  }
 }
 @Test fun monochromeNikonExplainsItsNeutralFallbackWithoutClaimingAutoExposure(){
  LabCatalog.initialize(RuntimeEnvironment.getApplication());val s=ParamsState();s.filmProfile="negs_ilford_hp5_plus_6p5min";s.chooseScanReceiver("nikon-scan")
  compose.setContent{MaterialTheme{Column(Modifier.verticalScroll(rememberScrollState())){ScanWorkspace(s)}}}
  compose.onNodeWithText("Автоэкспозиция Nikon").assertDoesNotExist()
  compose.onNodeWithText("Автоподбор включён в этом режиме всегда.",substring=true).assertDoesNotExist()
  compose.onNodeWithText("модель Nikon обучена на цветном негативе",substring=true).assertExists()
 }

}
