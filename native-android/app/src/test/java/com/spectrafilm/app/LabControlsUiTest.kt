package com.spectrafilm.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],qualifiers="w360dp-h780dp")
class LabControlsUiTest {
 @get:Rule(order=0) val host=ComposeHostActivityRule()
 @get:Rule(order=1) val compose=createComposeRule()
 @Test fun outputDropdownChangesActualEngineRouteAndReturnsToPaper(){
  LabCatalog.initialize(RuntimeEnvironment.getApplication())
  val state=ParamsState()
  compose.setContent{MaterialTheme{Column(Modifier.verticalScroll(rememberScrollState())){LabOutputSection(state)}}}
  compose.onNodeWithText("Получение изображения").performClick()
  compose.onNodeWithText("Lab Scan · минилаб").performClick()
  compose.runOnIdle{assertTrue(state.toParams().io.scanFilm);assertEquals("lab-scan",state.labString("outputModel.mode"))}
  compose.onNodeWithText("Получение изображения").performClick()
  compose.onNodeWithText("Фотобумага / кинопозитив").performClick()
  compose.runOnIdle{assertFalse(state.toParams().io.scanFilm)}
 }
 @Test fun grainModelChoicePersistsBooleanAndIndependentReset(){
  LabCatalog.initialize(RuntimeEnvironment.getApplication())
  val state=ParamsState();state.setLab("dirLangmuir",true)
  compose.setContent{MaterialTheme{LabChoice(state,"grainRms","Модель зерна",listOf("false" to "Spektrafilm","true" to "RMS"),"false")}}
  compose.onNodeWithText("Модель зерна").performClick();compose.onNodeWithText("RMS").performClick()
  compose.runOnIdle{
   assertTrue(state.labBoolean("grainRms"));assertTrue(state.toParams().experimentalJson.contains("\"grainRms\":true"))
   state.resetLabCategory(Category.GRAIN);assertFalse(state.labBoolean("grainRms"));assertTrue(state.labBoolean("dirLangmuir"))
  }
 }
}
