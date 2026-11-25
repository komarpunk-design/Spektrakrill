package com.spectrafilm.app

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk=[35])
class NativeParameterSearchTest {
    @Test fun russianCatalogUsesLocalizedNativeLabelsWithoutChangingParameterIdentities(){
        val application=RuntimeEnvironment.getApplication()
        val config=android.content.res.Configuration(application.resources.configuration)
        config.setLocale(java.util.Locale.forLanguageTag("ru"))
        val russian=application.createConfigurationContext(config)
        val translated=nativeParameterSearchIndex(russian).associateBy{it.path}
        val original=nativeParameterSearchIndex(application).associateBy{it.path}
        assertEquals(original.keys,translated.keys)
        for((path,target) in translated){
            assertEquals(original.getValue(path).tool,target.tool)
            assertEquals(target.groupId,original.getValue(path).resolvedGroupId(russian))
            assertTrue("untranslated control: $path = ${target.label}",target.label.any{it in '\u0400'..'\u04ff'})
        }
    }
    @Test fun parameterNavigationSurvivesSavedStateWithoutLosingItsModelIdentity(){
        val target=ParameterSearchTarget(PhotoTool.GRAIN,"grain.microStructure","Micro structure","native-Grain",native=true,requestSerial=17)
        val scope=object:androidx.compose.runtime.saveable.SaverScope{override fun canBeSaved(value:Any)=true}
        val saved=with(ParameterSearchSaver){scope.save(target)}
        assertEquals(target,ParameterSearchSaver.restore(requireNotNull(saved)))
        assertNull(ParameterSearchSaver.restore(listOf("unknown","path","label","group","true")))
    }
    @Test fun everyIndexedNativeParameterHasARealSerializedValueAndPhotographicTool(){
        val context=RuntimeEnvironment.getApplication()
        val targets=nativeParameterSearchIndex(context)
        assertEquals(nativeParameters.size,targets.size)
        assertEquals(nativeParameters.size,nativeParameters.map{it.path}.distinct().size)
        val defaults=Presets.encode(ParamsState())
        for(target in targets){
            var value:Any?=defaults
            for(part in target.path.split('.'))value=(value as? JSONObject)?.opt(part)
            assertNotNull("missing serialized parameter ${target.path}",value)
            assertTrue(target.native)
            assertTrue(target.label.isNotBlank())
        }
    }
    @Test fun scannerDetailsAndInputGamutResolveToTheirActualWorkspaces(){
        val context=RuntimeEnvironment.getApplication()
        val entries=nativeParameterSearchIndex(context).associateBy{it.path}
        assertEquals(PhotoTool.SCAN,entries.getValue("scanner.lensBlur").tool)
        assertEquals("scan-detail",entries.getValue("scanner.lensBlur").groupId)
        assertEquals(PhotoTool.INPUT_COLOR,entries.getValue("output.inputGamutCompress").tool)
        assertEquals(PhotoTool.DEVELOP,entries.getValue("experimental.filmGammaFactor").tool)
    }
}
