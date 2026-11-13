package com.spectrafilm.app
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
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
class PresetCatalogUiTest {
 @get:Rule(order=0) val host=ComposeHostActivityRule()
 @get:Rule(order=1) val compose=createComposeRule()
 private var applied="";private var exported="";private var saves=0
 private fun show(insideEditor:Boolean=false) {
  val ctx=RuntimeEnvironment.getApplication();LabCatalog.initialize(ctx)
  ctx.getSharedPreferences("preset-catalog",0).edit().clear().commit()
  val builtin=BuiltInPreset("night","Ночной город","Кино","Свечение фонарей",JSONObject(),"negs_cinestill_800t","kodak_portra_endura")
  compose.setContent {
   MaterialTheme {
    var selected by remember{mutableStateOf("Первый")};var name by remember{mutableStateOf("Мой рецепт")}
    val catalog:@Composable ()->Unit={
     PresetPanel(builtInGroups=mapOf("Кино" to listOf(builtin)),onApplyBuiltIn={applied=it.id},amount=1f,amountEnabled=false,onAmountChange={},presets=listOf("Первый","Мягкий свет"),selected=selected,name=name,onNameChange={name=it},onSelect={selected=it},onSave={saves++},nameExists={it=="Мой рецепт"},resolveName=Presets::resolveName,onApply={applied=selected},onDelete={},onImport={},onExport={},onExportSelected={exported=selected},onCopySettings={},canPasteSettings=false,onPasteSettings={},previousEditName=null,onApplyPrevious={},onExportLut={_,_->},bakingLut=false,onImportText={},savedInfo=mapOf("Первый" to SavedPresetInfo("kodak_gold_200","kodak_portra_endura"),"Мягкий свет" to SavedPresetInfo("kodak_portra_400","kodak_portra_endura")),onApplySaved={applied=it;selected=it})
    }
    if(!insideEditor)Box(Modifier.fillMaxSize()){catalog()}else Column(Modifier.fillMaxSize()) {
     val state=remember{ParamsState()}
     EditorBody(foldingFeature=null,state=state,onParamsChanged={},activeCategory=Category.PRESETS,onActiveCategoryChange={},toolShown={true},wide=false,chromeHidden=false,panelBackEnabled=true,sliderInteraction=remember{SliderInteraction()},interacting=remember{mutableStateOf(false)},sliderReadout=remember{mutableStateOf<SliderReadout?>(null)},panelBackProgress=0f,exportVisible=false,exportInFlight=false,onExport={},onShare={},onOpenCrop={},toolContent={catalog()},previewRegion={_,_->Box(Modifier.fillMaxSize())})
    }
   }
  }
  compose.waitForIdle()
 }
 @Test fun searchUsesFilmMetadataAndDescriptions(){show();compose.onNodeWithTag("preset-search").performTextInput("фонарей");compose.onNodeWithTag("preset-card-b:night").assertExists();compose.onNodeWithTag("preset-card-u:Первый").assertDoesNotExist()}
 @Test fun favoriteFilterShowsOnlyMarkedRecipes(){show();compose.onNodeWithContentDescription("В избранное: Мягкий свет").performClick();compose.onNodeWithTag("preset-source-favorites").performClick();compose.onNodeWithTag("preset-card-u:Мягкий свет").assertExists();compose.onNodeWithTag("preset-card-u:Первый").assertDoesNotExist()}
 @Test fun appliesTheTappedRecipeInsteadOfThePreviouslySelectedOne(){show();compose.onNodeWithTag("preset-card-u:Мягкий свет").performClick();assertEquals("Мягкий свет",applied)}
 @Test fun exportUsesTheCardName(){show();compose.onNodeWithContentDescription("Действия: Мягкий свет").performClick();compose.onNodeWithText("Экспортировать JSON").performClick();assertEquals("Мягкий свет",exported)}
 @Test fun overwritingStillNeedsAnExplicitConfirmation(){
  show()
  compose.onNodeWithTag("preset-save-open").performClick()
  compose.onNodeWithTag("preset-save-confirm").performClick()
  assertEquals(0,saves)
  compose.onNodeWithText("Заменить").performClick()
  assertEquals(1,saves)
 }

 @Test @GraphicsMode(GraphicsMode.Mode.NATIVE) fun catalogueFitsTheRealEditorPanelWithoutNestedScrollFailure(){
  show(insideEditor=true);compose.onNodeWithTag("preset-catalog").assertIsDisplayed();compose.onNodeWithTag("preset-search").assertIsDisplayed()
  for(source in listOf("all","favorites","builtin","mine"))compose.onNodeWithTag("preset-source-$source").assertIsDisplayed()
  System.getProperty("preset.capture")?.let{path->val f=java.io.File(path);f.parentFile?.mkdirs();f.outputStream().use{assertTrue(compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG,100,it))}}
 }
}
