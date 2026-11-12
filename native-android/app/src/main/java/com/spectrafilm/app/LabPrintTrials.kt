/* Five-exposure virtual enlarger from Lab 9.56, using upstream's decoder/engine/display pipeline. GPLv3. */
package com.spectrafilm.app

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.spectrafilm.engine.SpektraEngine
import com.spectrafilm.engine.ColorSpace
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext
import kotlin.math.pow

internal fun labPrintTrials(base:Float,step:Float):List<Float> {
    require(base.isFinite()&&base>0&&step in listOf(.25f,.5f,1f))
    return (-2..2).map{(base*2.0.pow(it*step.toDouble())).toFloat().coerceIn(.2f,3f)}
}
@Composable internal fun LabPrintTrials(s:ParamsState,sourceUri:Uri?,isRaw:Boolean) {
    val ctx=LocalContext.current;val scope=rememberCoroutineScope()
    var step by remember{mutableStateOf(.5f)};var busy by remember{mutableStateOf(false)};var note by remember{mutableStateOf("")}
    var pictures by remember(sourceUri,isRaw){mutableStateOf<List<Pair<Float,Bitmap>>>(emptyList())}
    var sourceKey by remember(sourceUri,isRaw){mutableStateOf<EditorParams?>(null)}
    val alive=remember(sourceUri,isRaw){java.util.concurrent.atomic.AtomicBoolean(true)}
    DisposableEffect(alive){onDispose{alive.set(false)}}
    DisposableEffect(pictures){onDispose{pictures.forEach{it.second.recycle()}}}
    LabNote("Пять пробных выдержек печати на одном исходнике. Рассчитываются оригинальным движком приложения. Выберите подходящую пробу — её выдержка применится к фотографии.")
    Dropdown("Шаг пробы",step,listOf(.25f,.5f,1f),{"$it EV"},{step=it})
    val blocked=s.labScanFilm()
    if(blocked)LabNote("Для пробной печати выберите фотобумагу и отключите прямой скан / цифровой вывод.")
    Button(enabled=!busy&&!blocked,onClick={
        val captured=s.snapshot();val base=s.printExposure;val params=s.toParams();val values=labPrintTrials(base,step)
        busy=true;note="Расчёт пробной печати…"
        scope.launch {
            val made=mutableListOf<Pair<Float,Bitmap>>();var delivered=false
            try{
                withContext(Dispatchers.Default){
                    val request=SourceDecodeRequest(ctx.applicationContext,sourceUri,if(sourceUri==null)SourceKind.DEMO else if(isRaw)SourceKind.RAW else SourceKind.PHOTO,false,captured.rawImport.rawWhiteBalance,captured.rawImport.rawTemperature,captured.rawImport.rawTint,SourceRotation.NONE,captured.look.creativeWbTemp,captured.look.creativeWbTint,captured.look.balanceToFilmStock,captured.profiles.filmProfile)
                    decodeSourceRequest(request,320,Dispatchers.IO).image.use{image->
                        SpektraEngine.fromAssets(ctx.assets).use{engine->
                            for(value in values){
                                coroutineContext.ensureActive()
                                val trial=params.copy(enlarger=params.enlarger.copy(printExposure=params.enlarger.printExposure*value/base),io=params.io.copy(outputColorSpace=ColorSpace.SRGB,outputCctfEncoding=true),settings=params.settings.copy(previewMaxSize=320))
                                engine.simulatePreview(image,trial).use{result->made+=value to simResultToBitmapGraded(result,true,captured.look.saturation,captured.look.vibrance,captured.look.gamutCompress,captured.look.localAdjustments)}
                            }
                        }
                    }
                }
                if(alive.get()){pictures=made.toList();sourceKey=captured;delivered=true;note="Выберите подходящую выдержку."}
            }catch(e:Exception){note=e.message?:"Не удалось рассчитать пробы"}
            finally{if(!delivered)made.forEach{it.second.recycle()};busy=false}
        }
    }){Text(if(busy)"Рассчитываю…"else"Рассчитать пять проб")}
    if(note.isNotBlank())LabNote(note)
    if(pictures.isNotEmpty()){
        val stale=sourceKey!=s.snapshot()
        if(stale)LabNote("Настройки изменились. Рассчитайте пробы заново, чтобы сравнение соответствовало текущему кадру.")
        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(12.dp)){
            for((value,bitmap)in pictures)Column(Modifier.width(150.dp)){
                Image(bitmap.asImageBitmap(),"Проба печати $value",Modifier.fillMaxWidth().height(140.dp))
                OutlinedButton(enabled=!stale,onClick={s.printExposure=value}){Text("Выдержка %.2f".format(java.util.Locale.ROOT,value))}
            }
        }
    }
}
