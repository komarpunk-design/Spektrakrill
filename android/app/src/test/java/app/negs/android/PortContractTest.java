package app.negs.android;
import org.junit.*;
import static org.junit.Assert.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.json.*;
import java.io.*;
import java.util.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk={26,35}, qualifiers="w360dp-h640dp-xxhdpi")
public class PortContractTest {
 MainActivity a;
 @Before public void setup(){a=Robolectric.buildActivity(MainActivity.class).get();a.params=MainActivity.obj("{\"camera\":{\"auto_exposure\":true},\"io\":{\"output_color_space\":\"Adobe RGB (1998)\"},\"film_render\":{\"grain\":{\"micro_structure\":[0,30],\"rms_granularity\":null}}}");a.defaults=MainActivity.copy(a.params);}
 @After public void stop(){a.worker.shutdownNow();}
 @Test public void arrayLaneEditsDoNotDestroyOtherChannels(){a.set("film_render.grain.micro_structure.0",.25);assertEquals(.25,((Number)a.get("film_render.grain.micro_structure.0")).doubleValue(),0);assertEquals(30,((Number)a.get("film_render.grain.micro_structure.1")).intValue());}
 @Test public void missingPathIsNullAndNullableDefaultsRemainUnset(){assertSame(JSONObject.NULL,a.get("missing.path"));assertSame(JSONObject.NULL,a.get("film_render.grain.rms_granularity"));a.set("film_render.grain.rms_granularity",new JSONArray(Arrays.asList(1,2,3)));a.set("film_render.grain.rms_granularity",a.def("film_render.grain.rms_granularity"));assertSame(JSONObject.NULL,a.get("film_render.grain.rms_granularity"));}
 @Test public void renderRequestOwnsSettingsSnapshot(){JSONObject p=MainActivity.copy(a.params);JSONObject r=a.requestFor("render",new File("/photos/test.NEF"),p,a.film,a.paper);a.set("camera.auto_exposure",false);assertTrue(r.optJSONObject("params").optJSONObject("camera").optBoolean("auto_exposure"));assertEquals("/photos/test.NEF",r.optString("input"));}
 @Test public void exportKeepsCropBorderRotationIccAndDepth(){JSONObject f=MainActivity.obj("{\"crop\":{\"x\":0.1,\"y\":0,\"width\":0.8,\"height\":1},\"border\":\"35mm\",\"rotate_cw\":3}");JSONObject s=a.saveFor(42,new File("/tmp/export.tiff"),a.params,f,16);assertEquals(42,s.optLong("render_id"));assertEquals("35mm",s.optString("border"));assertEquals(3,s.optInt("rotate_cw"));assertEquals(.8,s.optJSONObject("crop").optDouble("width"),0);assertEquals(16,s.optJSONObject("save_options").optInt("bit_depth"));assertEquals("Adobe RGB (1998)",s.optJSONObject("save_options").optString("color_space"));assertTrue(s.optBoolean("crop_after_post"));}
 @Test public void unicodeAndBinaryFileTransportPreserveBytes()throws Exception{byte[] data=new byte[1000003];new Random(7).nextBytes(data);ByteArrayOutputStream out=new ByteArrayOutputStream();MainActivity.transfer(new ByteArrayInputStream(data),out);assertArrayEquals(data,out.toByteArray());assertArrayEquals(data,MainActivity.read(new ByteArrayInputStream(data)));String text="плёнка 📷 日本語";assertEquals(text,MainActivity.obj("{\"text\":"+JSONObject.quote(text)+"}").optString("text"));}
 @Test public void historyStoresIndependentFullRecipes(){a.snapshot();String first=a.history.get(0);a.set("camera.auto_exposure",false);MainActivity.put(a.finish,"border","film");a.snapshot();assertEquals(2,a.history.size());assertFalse(a.history.get(1).equals(first));a.restore(MainActivity.obj(first));assertTrue((Boolean)a.get("camera.auto_exposure"));assertFalse(a.finish.has("border"));}
 @org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
 @Test public void primaryWorkspaceFitsPhoneAndShowsClearSections()throws Exception{
  a.ready=true;a.catalog=MainActivity.obj("{\"profiles\":[{\"id\":\"kodak_portra_400\",\"name\":\"Kodak Portra 400\",\"paper\":false},{\"id\":\"kodak_portra_endura\",\"name\":\"Kodak Portra Endura\",\"paper\":true}]}");
  a.metadata=MainActivity.obj(new String(MainActivity.read(a.getAssets().open("controls.json")),java.nio.charset.StandardCharsets.UTF_8));
  a.buildUi();a.refresh();assertTrue(a.inspector.getChildCount()>4);assertEquals(6,a.tabs.getChildCount());
  a.root.measure(android.view.View.MeasureSpec.makeMeasureSpec(1080,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(1920,android.view.View.MeasureSpec.EXACTLY));a.root.layout(0,0,1080,1920);assertTrue(a.photo.getHeight()>100);
  android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(1080,1920,android.graphics.Bitmap.Config.ARGB_8888);a.root.draw(new android.graphics.Canvas(bitmap));File dir=new File("/workspace/artifacts");if(dir.isDirectory())try(OutputStream out=new FileOutputStream(new File(dir,"Negs-Android-interface.png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
 }
 @Test public void previewBoundNeverLeaksIntoFullExport(){JSONObject p=MainActivity.copy(a.params);String before=p.toString();JSONObject proxy=a.renderFor(new File("/photo.NEF"),p,a.film,a.paper,false);assertEquals("android_preview",proxy.optString("command"));assertEquals(1280,proxy.optInt("long_side"));JSONObject full=a.renderFor(new File("/photo.NEF"),p,a.film,a.paper,true);assertEquals("render",full.optString("command"));assertFalse(full.optBoolean("limit_preview"));assertFalse(full.has("long_side"));assertEquals(before,p.toString());}
 @Test public void closedPanelsAllocateNoControlsAndKeepTheirContentsWhenToggled(){a.ready=true;android.widget.LinearLayout box=new android.widget.LinearLayout(a);int[] count={0};a.lazyGroup(box,"grain","Зерно",body->{count[0]++;body.addView(new android.widget.TextView(a));});assertEquals(0,count[0]);box.getChildAt(0).performClick();assertEquals(1,count[0]);assertTrue(a.expandedGroups.contains("grain"));box.getChildAt(0).performClick();assertFalse(a.expandedGroups.contains("grain"));box.getChildAt(0).performClick();assertEquals(1,count[0]);}
}
