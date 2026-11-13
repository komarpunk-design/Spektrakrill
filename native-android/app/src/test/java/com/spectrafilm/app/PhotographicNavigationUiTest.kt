package com.spectrafilm.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.semantics.SemanticsActions
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Exercise the real adaptive editor body and panel navigation, not a separate mock menu. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],qualifiers="w360dp-h780dp")
class PhotographicNavigationUiTest {
 @get:Rule(order=0) val host=ComposeHostActivityRule()
 @get:Rule(order=1) val compose=createComposeRule()
 private val state=ParamsState()
 private fun show(wide:Boolean=false) {
  LabCatalog.initialize(RuntimeEnvironment.getApplication())
  compose.setContent {
   MaterialTheme {
    var active by remember { mutableStateOf<Category?>(Category.SIMULATION) }
    var crop by remember { mutableStateOf(false) }
    val interacting=remember{mutableStateOf(false)};val readout=remember{mutableStateOf<SliderReadout?>(null)}
    Column(Modifier.fillMaxSize()) {
     EditorBody(foldingFeature=null,state=state,onParamsChanged={},activeCategory=active,
      onActiveCategoryChange={active=it;if(it!=null)crop=false},toolShown={it!=Category.RAW_CLEANUP},wide=wide,
      chromeHidden=false,panelBackEnabled=true,sliderInteraction=remember{SliderInteraction()},interacting=interacting,
      sliderReadout=readout,panelBackProgress=0f,exportVisible=true,exportInFlight=false,onExport={},onShare={},
      onOpenCrop={crop=!crop},cropOpen=crop,cropPanelContent={Text("Native crop controls")},
      previewRegion={_,_->Box(Modifier.fillMaxSize().background(Color.Gray).testTag("preview"))},
      toolContent={
       val page=LocalPhotoTool.current!!
       Text("Page: ${page.id}",Modifier.testTag("open-page"))
       if(page==PhotoTool.OUTPUT)LabOutputSection(state)
      })
    }
   }
  }
  compose.waitForIdle()
 }
 private fun stage(id:String){compose.onNodeWithTag("workflow-stage-$id").performScrollTo().performClick();compose.waitForIdle()}
 private fun tool(id:String){compose.onNodeWithTag("workflow-tool-$id").performClick();compose.waitForIdle()}
 @Test @GraphicsMode(GraphicsMode.Mode.NATIVE) fun labScanOpensDirectlyFromPrintAndChangesActualEngineParameters(){
  show()
  for(stage in PhotoStage.entries) {
   compose.onNodeWithTag("workflow-stage-${stage.name}").assertIsDisplayed()
   val layouts=mutableListOf<TextLayoutResult>()
   compose.onNodeWithText(stage.title,useUnmergedTree=true).performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
   assertTrue("Stage label must fit: ${stage.title}; ${layouts.map { "${it.size}, width=${it.didOverflowWidth}, height=${it.didOverflowHeight}" }}",layouts.isNotEmpty()&&layouts.none{it.hasVisualOverflow})
  }
  stage("PRINT")
  compose.onNodeWithText("Page: output").assertIsDisplayed()
  compose.onNodeWithText("Получение изображения").performClick();compose.onNodeWithText("Lab Scan · минилаб").performClick()
  compose.runOnIdle{assertEquals("lab-scan",state.labString("outputModel.mode"));assertTrue(state.toParams().io.scanFilm)}
  compose.onNodeWithTag("preview").assertExists()
  System.getProperty("workflow.capture")?.let { path ->
   val file=java.io.File(path);file.parentFile?.mkdirs()
   file.outputStream().use { stream -> assertTrue(compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream)) }
  }
 }
 @Test fun negativeRouteDoesNotRequireOpeningAnExperimentalSubmenu(){
  show();stage("SCAN");tool("negative");compose.onNodeWithText("Page: negative").assertIsDisplayed()
 }
 @Test fun cameraPrepAndExposureRemainDifferentPagesDespiteSharingNativeCategory(){
  show();stage("CAMERA");tool("prep");compose.onNodeWithText("Page: prep").assertIsDisplayed()
  tool("exposure");compose.onNodeWithText("Page: exposure").assertIsDisplayed()
 }
 @Test fun canLeaveCropDirectlyForFrames(){
  show();stage("FINISH");tool("crop");compose.onNodeWithText("Native crop controls").assertIsDisplayed()
  tool("frame");compose.onNodeWithText("Page: frame").assertIsDisplayed()
 }
 @Test fun closingAndReopeningStageKeepsItsLastTool(){
  show();stage("SCAN");tool("negative");stage("SCAN");compose.onNodeWithTag("open-page").assertDoesNotExist()
  stage("SCAN");compose.onNodeWithText("Page: negative").assertIsDisplayed()
 }
 @Test @Config(sdk=[35],qualifiers="w1000dp-h700dp") fun widePaneUsesSameWorkflowRoutes(){
  show(wide=true);stage("PRINT");compose.onNodeWithText("Page: output").assertIsDisplayed()
 }
}
