package com.spectrafilm.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsActions
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
class QuietWorkbenchUiTest {
    @get:Rule(order=0)val host=ComposeHostActivityRule()
    @get:Rule(order=1)val compose=createComposeRule()
    private val s=ParamsState()
    @Test fun nativeSearchOpensTheExactAdvancedGrainControlWithoutChangingTheRecipe(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        s.setLab("grainRms",true)
        val before=Presets.encode(s).toString()
        compose.setContent{MaterialTheme{
            var target by remember{mutableStateOf<ParameterSearchTarget?>(null)}
            if(target==null)ToolDirectory(PhotoTool.FILMS,emptySet(),true,{},onParameter={target=it},onSelect={})
            else CompositionLocalProvider(LocalQuietEditor provides true,LocalFlatSections provides true,
                LocalPhotoTool provides PhotoTool.GRAIN,LocalParameterFocus provides remember{ParameterFocus()},LocalParameterSearch provides target){
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())){GrainSection(s)}
            }
        }}
        compose.onNodeWithTag("tool-directory-search").performTextInput("grain.microStructure")
        compose.onNodeWithTag("search-parameter-grain.microStructure").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("parameter-grain.microStructure").assertIsDisplayed()
        compose.runOnIdle{assertEquals(before,Presets.encode(s).toString());assertTrue(s.labBoolean("grainRms"))}
    }
    @Test fun nativeDiffusionSearchRevealsBothTheParentGroupAndItsDetails(){
        val context=RuntimeEnvironment.getApplication()
        val target=mutableStateOf(nativeParameterSearchIndex(context).single{it.path=="camera.diffusion.haloSize"})
        val before=Presets.encode(s).toString()
        compose.setContent{MaterialTheme{
            CompositionLocalProvider(LocalQuietEditor provides true,LocalFlatSections provides true,
                LocalPhotoTool provides PhotoTool.LENS,LocalParameterFocus provides remember{ParameterFocus()},LocalParameterSearch provides target.value){
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())){
                    SectionCard(context.getString(Category.CAMERA_DIFFUSION.labelRes),false,{}){
                        DiffusionGroup("Diffusion",s.cameraDiffusionState,"camera.diffusion")
                    }
                }
            }
        }}
        compose.waitForIdle()
        compose.onNodeWithTag("parameter-camera.diffusion.haloSize").assertIsDisplayed()
        compose.onNodeWithText(context.getString(Category.CAMERA_DIFFUSION.labelRes)).performScrollTo().performClick()
        compose.onNodeWithTag("parameter-camera.diffusion.haloSize").assertDoesNotExist()
        compose.runOnIdle{target.value=target.value.copy(requestSerial=1)}
        compose.waitForIdle()
        compose.onNodeWithTag("parameter-camera.diffusion.haloSize").assertIsDisplayed()
        compose.runOnIdle{assertEquals(before,Presets.encode(s).toString())}
    }
    private fun showScan(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        compose.setContent{MaterialTheme{
            val focus=remember{ParameterFocus()}
            CompositionLocalProvider(LocalQuietEditor provides true,LocalParameterFocus provides focus){
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())){ScanWorkspace(s)}
            }
        }}
    }
    private fun capture(name:String){
        System.getenv("QUIET_CAPTURE_DIR")?.let { path->
            val f=java.io.File(path,name);f.parentFile?.mkdirs()
            f.outputStream().use{assertTrue(compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG,100,it))}
        }
    }
    @Test fun searchFindsScannerWithoutKnowingItsSectionAndDoesNotEditTheRecipe(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication())
        val before=Presets.encode(s).toString();var selected:PhotoTool?=null
        compose.setContent{MaterialTheme{PhotoToolTabs(PhotoTool.EXPOSURE,emptySet()){selected=it}}}
        compose.onNodeWithTag("tool-directory-global").performClick()
        compose.onNodeWithTag("tool-directory-search").performTextInput("норитсу")
        compose.onNodeWithTag("tool-directory-list").performScrollToNode(hasTestTag("workflow-tool-scan"))
        capture("directory-search.png")
        compose.onNodeWithTag("workflow-tool-scan").performClick()
        compose.runOnIdle{assertEquals(PhotoTool.SCAN,selected);assertEquals(before,Presets.encode(s).toString())}
        compose.onNodeWithTag("tool-directory-search").assertDoesNotExist()
    }
    @Test fun parameterSearchOpensAndScrollsToActualScannerControl(){
        s.chooseScanReceiver("lab-scan")
        compose.setContent{MaterialTheme{
            var target by remember{mutableStateOf<ParameterSearchTarget?>(null)}
            if(target==null)ToolDirectory(PhotoTool.FILMS,emptySet(),true,{},onParameter={target=it},onSelect={})
            else CompositionLocalProvider(LocalQuietEditor provides true,LocalParameterFocus provides remember{ParameterFocus()},LocalParameterSearch provides target){
                Column(Modifier.verticalScroll(rememberScrollState())){ScanWorkspace(s)}
            }
        }}
        compose.onNodeWithTag("tool-directory-search").performTextInput("Чёрная точка")
        compose.onNodeWithTag("search-parameter-outputModel.blackPoint").performClick()
        compose.waitForIdle()
        capture("parameter-search.png")
        compose.onNodeWithTag("parameter-outputModel.blackPoint").assertIsDisplayed()
        compose.runOnIdle{assertEquals(0f,s.labNumber("outputModel.blackPoint"),0f)}
    }
    @Test fun onlyOneScanGroupIsOpenAndExactValuesSurviveSwitching(){
        s.chooseScanReceiver("noritsu-ls600");s.useBuiltinFactoryNoritsuJob();showScan()
        compose.onNodeWithText("Тон и уровни").performScrollTo().performClick()
        val number=compose.onNode(hasContentDescription("Чёрная точка",substring=true) and hasClickAction() and hasAnyAncestor(hasTestTag("scan-control-blackPoint")))
        number.performScrollTo()
        number.performSemanticsAction(SemanticsActions.OnClick){it()}
        compose.onNode(hasSetTextAction()).performTextReplacement("0.027")
        compose.onNodeWithText("Set").performClick()
        compose.onNodeWithText("Цветовой баланс · CMY").performScrollTo().performClick()
        compose.onNodeWithTag("scan-control-blackPoint").assertDoesNotExist()
        compose.runOnIdle{assertEquals(.027f,s.labNumber("outputModel.blackPoint"),1e-6f)}
        compose.onNodeWithText("Профильные стадии Noritsu").performScrollTo().performClick()
        compose.waitUntil(15000){compose.onAllNodesWithText("Film Sharp").fetchSemanticsNodes().isNotEmpty()}
        compose.onNodeWithText("Film Sharp").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("scan-control-cyan").assertDoesNotExist()
        capture("scanner-profile.png")
        compose.onNodeWithText("Данные профиля и файлы").performScrollTo().performClick()
        compose.onNodeWithTag("noritsu-job-import").performScrollTo().assertIsDisplayed()
        compose.runOnIdle{assertEquals(NORITSU_FACTORY_ID,s.labString("noritsuJobId"));assertEquals(.027f,s.labNumber("outputModel.blackPoint"),1e-6f)}
    }
    @Test fun collapsedRmsGroupsKeepTheirParametersAndExplainTheirContents(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication());s.setLab("grainFloorRed",.21)
        val before=Presets.encode(s).toString()
        compose.setContent{MaterialTheme{CompositionLocalProvider(LocalQuietEditor provides true,LocalParameterFocus provides remember{ParameterFocus()}){
            Column(Modifier.verticalScroll(rememberScrollState())){LabGroup(s,"grain")}
        }}}
        compose.onNodeWithText("Равномерность и плотность").performScrollTo().performClick()
        compose.onNodeWithText("Минимальная плотность R").assertExists()
        compose.onNodeWithText("Частицы и резкость").performScrollTo().performClick()
        compose.onNodeWithText("Минимальная плотность R",useUnmergedTree=true).assertDoesNotExist()
        compose.onNodeWithText("Размер частиц · слой 1").assertExists()
        compose.runOnIdle{assertEquals(before,Presets.encode(s).toString())}
    }
    @Test fun nativePaperGroupsKeepAllControlsAndNeverResetWhenCollapsed(){
        LabCatalog.initialize(RuntimeEnvironment.getApplication());s.preflashExposure=.2f
        val before=Presets.encode(s).toString();val ctx=RuntimeEnvironment.getApplication()
        compose.setContent{MaterialTheme{CompositionLocalProvider(LocalQuietEditor provides true,LocalPhotoTool provides PhotoTool.PAPER,LocalFlatSections provides true,LocalParameterFocus provides remember{ParameterFocus()}){
            Column(Modifier.verticalScroll(rememberScrollState())){PreflashSection(s);ExperimentalSection(s,film=false)}
        }}}
        compose.onNodeWithText(ctx.getString(R.string.editor_preflash_title)).performScrollTo().performClick()
        compose.onNodeWithText(ctx.getString(R.string.editor_preflash_exposure)).assertExists()
        compose.onNodeWithText(RuntimeEnvironment.getApplication().getString(R.string.native_print_characteristic)).performScrollTo().performClick()
        compose.onNodeWithText(ctx.getString(R.string.editor_preflash_exposure)).assertDoesNotExist()
        compose.onNodeWithText(ctx.getString(R.string.editor_exp_print_gamma)).assertExists()
        compose.runOnIdle{assertEquals(before,Presets.encode(s).toString())}
    }

    @Test fun virtualNegativeWorkflowRemainsDiscoverableWithoutTakingOverScanControls(){
        s.chooseScanReceiver("lab-scan");showScan()
        compose.onNodeWithText("Режим сканирования").assertExists()
        compose.onNodeWithTag("negative-start").assertDoesNotExist()
        compose.onNodeWithText("Виртуальный негатив и варианты").performScrollTo().performClick()
        compose.onNodeWithTag("negative-start").performScrollTo().performClick()
        compose.onNodeWithText("Варианты сканирования").performScrollTo().assertIsDisplayed()
        compose.runOnIdle{assertEquals(1,s.negativeWorkspace().getJSONArray("variants").length());assertEquals("lab-scan",s.labString("outputModel.mode"))}
    }

    @Test fun helpDoesNotToggleTheEffect(){
        val text="Подробное объяснение влияния на результат"
        compose.setContent{MaterialTheme{CompositionLocalProvider(LocalQuietEditor provides true){SwitchRow("Эффект",s.grainActive,{s.grainActive=it},text)}}}
        val before=s.grainActive
        compose.onNodeWithContentDescription("Пояснение: Эффект").performClick()
        compose.onNodeWithText(text).assertIsDisplayed()
        compose.onNodeWithText("Понятно").performClick()
        compose.runOnIdle{assertEquals(before,s.grainActive)}
    }
}
