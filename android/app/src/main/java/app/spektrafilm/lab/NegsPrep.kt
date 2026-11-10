package app.spektrafilm.lab
import com.spectrafilm.engine.LinearImage
import com.spectrafilm.engine.SpektraEngine
import org.json.JSONObject
/** GPLv3. Shared Negs Prep for the digital bypass, preview and export. */
object NegsPrep {
 @JvmStatic fun apply(image:LinearImage,params:JSONObject?) {
  val prep=params?.optJSONObject("prep")?:return
  if (!prep.keys().asSequence().any { key -> val v=prep.optDouble(key,0.0);v.isFinite()&&v!=0.0 }) return
  SpektraEngine.nativeApplyNegsPrep(Images.bytes(image),image.width,image.height,JSONObject().put("negsPrep",prep).toString())
 }
}
