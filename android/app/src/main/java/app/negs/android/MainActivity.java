/* Negs Android — GPL-3.0-only. Native client of the upstream Rust engine. */
package app.negs.android;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.provider.*;
import android.graphics.*;
import android.view.*;
import android.widget.*;
import android.text.InputType;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
 final ExecutorService worker=Executors.newSingleThreadExecutor();
 final Handler ui=new Handler(Looper.getMainLooper());
 JSONObject catalog, defaults, params, metadata;
 JSONObject finish=new JSONObject();
 String film="kodak_portra_400",paper="kodak_portra_endura",section="Плёнки",search="";
 File source,pendingSave; Uri batchFolder; String exportFormat="jpg"; int exportDepth=8,quality=95; int currentRating=0; String currentFlag="";
 int previewLongSide=1280; final HashSet<String> expandedGroups=new HashSet<>();
 boolean useReference=false; boolean onReferenceThread=false; boolean ready=false,restoring=false,dirty=false; volatile int revision=0;
 LinearLayout root,inspector,tabs,strip; TextView status; PhotoView photo;
 final ArrayList<String> history=new ArrayList<>(); int historyIndex=-1;
 final ArrayList<File> photos=new ArrayList<>();
 final HashMap<String,JSONObject> fieldSpecs=new HashMap<>();
 final Runnable renderLater=()->render(false,null);
 final Runnable persistLater=()->persist();
 static void transfer(InputStream in,OutputStream out)throws IOException{byte[] b=new byte[65536];for(int n;(n=in.read(b))!=-1;)out.write(b,0,n);}
 static byte[] read(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();transfer(in,out);return out.toByteArray();}
 static JSONObject obj(String text){try{return new JSONObject(text);}catch(Exception e){throw new IllegalArgumentException(e);}}
 static JSONObject copy(JSONObject o){return obj(o.toString());}
 static void put(JSONObject o,String k,Object v){try{o.put(k,v);}catch(Exception e){throw new IllegalArgumentException(e);}}
 int dp(float n){return Math.round(getResources().getDisplayMetrics().density*n);}
 File data(){return new File(getFilesDir(),"data");}
 @Override public void onCreate(Bundle b){
  super.onCreate(b); buildUi(); note("Подготовка исходного движка negs…");
  worker.execute(()->{try{
   String version=new String(read(getAssets().open("assets-version.txt")),StandardCharsets.UTF_8);File marker=new File(getFilesDir(),"assets-version.txt");
   if(!marker.exists()||!new String(java.nio.file.Files.readAllBytes(marker.toPath()),StandardCharsets.UTF_8).equals(version)){extract("data",data());java.nio.file.Files.write(marker.toPath(),version.getBytes(StandardCharsets.UTF_8));}
   metadata=obj(new String(read(getAssets().open("controls.json")),StandardCharsets.UTF_8));
   indexSpecs(metadata);
   JSONObject c=call(cmd("catalog"));
   ui.post(()->{catalog=c; defaults=c.optJSONObject("defaults"); params=copy(defaults); ready=true;
    File state=new File(getFilesDir(),"session.json");
    try { if(state.exists()) restore(obj(new String(java.nio.file.Files.readAllBytes(state.toPath()),StandardCharsets.UTF_8))); }catch(Exception e){note("Не удалось восстановить сеанс: "+e.getMessage());}
    snapshot(); refresh(); note("Откройте фотографию и выберите плёнку. Обработка полностью на устройстве.");
    accept(getIntent()); if(source!=null) changed(false);
   });
  }catch(Throwable e){error(e);}});
 }
 void indexSpecs(Object o)throws Exception{
  if(o instanceof JSONObject){JSONObject j=(JSONObject)o;if(j.has("path"))fieldSpecs.put(j.getString("path"),j);for(Iterator<String> i=j.keys();i.hasNext();)indexSpecs(j.get(i.next()));}
  if(o instanceof JSONArray)for(int i=0;i<((JSONArray)o).length();i++)indexSpecs(((JSONArray)o).get(i));
 }
 void extract(String path,File dst)throws IOException{
  String[] list=getAssets().list(path); if(list!=null&&list.length>0){dst.mkdirs();for(String x:list)extract(path+"/"+x,new File(dst,x));}
  else {dst.getParentFile().mkdirs();try(InputStream in=getAssets().open(path);OutputStream out=new FileOutputStream(dst)){transfer(in,out);}}
 }
 JSONObject cmd(String name){JSONObject c=new JSONObject();put(c,"id",1);put(c,"command",name);return c;}
 JSONObject call(JSONObject c)throws Exception{
  JSONObject r=obj(new String(onReferenceThread?Engine.requestReference(data().getAbsolutePath().getBytes(StandardCharsets.UTF_8),c.toString().getBytes(StandardCharsets.UTF_8)):Engine.request(data().getAbsolutePath().getBytes(StandardCharsets.UTF_8),c.toString().getBytes(StandardCharsets.UTF_8)),StandardCharsets.UTF_8));
  if(r.has("error"))throw new IOException(r.getString("error"));
  return r.optJSONObject("result")==null?new JSONObject():r.getJSONObject("result");
 }
 void note(String s){ui.post(()->status.setText(s));}
 void error(Throwable e){ui.post(()->{note("Ошибка: "+e.getMessage());if(!isFinishing())new AlertDialog.Builder(this).setTitle("Negs").setMessage(e.getMessage()).setPositiveButton("Понятно",null).show();});}
 TextView text(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(0xffe5e4de);t.setPadding(dp(10),dp(7),dp(10),dp(7));return t;}
 Button button(String label,Runnable action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setMinHeight(dp(48));b.setOnClickListener(v->{if(ready)action.run();});return b;}
 LinearLayout line(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);return l;}
 void buildUi(){
  root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xff151816);
  root.setOnApplyWindowInsetsListener((v,in)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets s=in.getInsets(android.view.WindowInsets.Type.systemBars());v.setPadding(s.left,s.top,s.right,s.bottom);}else v.setPadding(in.getSystemWindowInsetLeft(),in.getSystemWindowInsetTop(),in.getSystemWindowInsetRight(),in.getSystemWindowInsetBottom());return in;});
  LinearLayout toolbar=line(); toolbar.addView(text("negs",25),new LinearLayout.LayoutParams(0,-2,1));
  toolbar.addView(button("＋",()->pick(10,"*/*",true)));toolbar.addView(button("Экспорт",()->exportMenu(false)));toolbar.addView(button("⋮",this::menu));root.addView(toolbar);
  photo=new PhotoView(this);root.addView(photo,new LinearLayout.LayoutParams(-1,0,1));
  status=text("",12);status.setMaxLines(3);root.addView(status);
  HorizontalScrollView hs=new HorizontalScrollView(this);strip=line();hs.addView(strip);root.addView(hs);
  HorizontalScrollView nav=new HorizontalScrollView(this);tabs=line();nav.addView(tabs);root.addView(nav);
  for(String name:new String[]{"Плёнки","Подготовка","Лаборатория","Вывод","Негатив","Все параметры"}) tabs.addView(button(name,()->{section=name;refresh();}));
  ScrollView scroll=new ScrollView(this);inspector=new LinearLayout(this);inspector.setOrientation(LinearLayout.VERTICAL);scroll.addView(inspector);
  TextView handle=text("────  потяните, чтобы изменить высоту панели  ────",11);root.addView(handle);
  LinearLayout.LayoutParams panel=new LinearLayout.LayoutParams(-1,dp(getResources().getConfiguration().orientation==2?120:270));
  handle.setOnTouchListener(new View.OnTouchListener(){float y;int h;public boolean onTouch(View v,MotionEvent e){if(e.getAction()==MotionEvent.ACTION_DOWN){y=e.getRawY();h=scroll.getHeight();return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){panel.height=Math.max(dp(80),Math.min((int)(root.getHeight()*.65),h+(int)(y-e.getRawY())));scroll.setLayoutParams(panel);return true;}if(e.getAction()==MotionEvent.ACTION_UP)v.performClick();return true;}});
  handle.setOnClickListener(v->{panel.height=panel.height>dp(150)?dp(100):dp(270);scroll.setLayoutParams(panel);});
  root.addView(scroll,panel);setContentView(root);
 }
 JSONObject state(){JSONObject s=new JSONObject();put(s,"params",params);put(s,"film",film);put(s,"paper",paper);put(s,"finish",finish);put(s,"reference",useReference);put(s,"previewLongSide",previewLongSide);if(source!=null)put(s,"source",source.getAbsolutePath());JSONArray a=new JSONArray();for(File f:photos)a.put(f.getAbsolutePath());put(s,"photos",a);return s;}
 void restore(JSONObject s){params=copy(s.optJSONObject("params"));useReference=s.optBoolean("reference");previewLongSide=s.optInt("previewLongSide",1280);if(previewLongSide!=768&&previewLongSide!=1280&&previewLongSide!=2048)previewLongSide=1280;film=s.optString("film",film);paper=s.optString("paper",paper);finish=copy(s.optJSONObject("finish")==null?new JSONObject():s.optJSONObject("finish"));source=s.has("source")?new File(s.optString("source")):null;if(source!=null&&!source.exists())source=null;photos.clear();JSONArray a=s.optJSONArray("photos");if(a!=null)for(int i=0;i<a.length();i++){File f=new File(a.optString(i));if(f.exists())photos.add(f);}}
 void persist(){if(params==null)return;String s=state().toString();JSONObject recipe=sidecarRecipe();File photoFile=source;worker.execute(()->{try{File tmp=new File(getFilesDir(),"session.tmp");java.nio.file.Files.write(tmp.toPath(),s.getBytes(StandardCharsets.UTF_8));java.nio.file.Files.move(tmp.toPath(),new File(getFilesDir(),"session.json").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);if(photoFile!=null){JSONObject c=cmd("android_sidecar_save");put(c,"input",photoFile.getAbsolutePath());put(c,"state",recipe);call(c);}}catch(Exception e){note("Не удалось сохранить сеанс: "+e.getMessage());}});}
 void snapshot(){String s=state().toString();if(historyIndex>=0&&history.get(historyIndex).equals(s))return;while(history.size()>historyIndex+1)history.remove(history.size()-1);history.add(s);if(history.size()>100)history.remove(0);historyIndex=history.size()-1;}
 void changed(boolean saveHistory){revision++;if(saveHistory)snapshot();ui.removeCallbacks(persistLater);ui.postDelayed(persistLater,1000);ui.removeCallbacks(renderLater);ui.postDelayed(renderLater,250);}
 Object get(String path){return nested(params,path);}
 Object def(String path){return nested(defaults,path);}
 void set(String path,Object value){String[] a=path.split("\\.");Object at=params;for(int i=0;i<a.length-1;i++){Object next=at instanceof JSONObject?((JSONObject)at).opt(a[i]):((JSONArray)at).opt(Integer.parseInt(a[i]));if(next==null||next==JSONObject.NULL)throw new IllegalArgumentException("Сначала задайте родительский параметр: "+path);at=next;}try{if(at instanceof JSONObject)((JSONObject)at).put(a[a.length-1],value);else ((JSONArray)at).put(Integer.parseInt(a[a.length-1]),value);}catch(JSONException e){throw new IllegalArgumentException(e);}}
 String label(String s){Map<String,String> m=new HashMap<>();m.put("Brightness","Яркость");m.put("Tone","Тон");m.put("Color","Цвет");m.put("Film","Плёнка");m.put("Print","Печать");m.put("Grain","Зерно");m.put("Halation","Галяция");m.put("Scanner","Сканер");m.put("Scan & Color","Скан и цвет");m.put("Film Curves","Кривые плёнки");m.put("Print Curves","Кривые бумаги");m.put("Film Base","Основа плёнки");m.put("Print Base","Основа бумаги");m.put("Camera","Камера");m.put("Enlarger","Увеличитель");m.put("DIR Couplers","DIR — межслойное влияние");m.put("RAW White Balance","Баланс белого RAW");m.put("Color Management","Управление цветом");return m.getOrDefault(s,s);}
 void refresh(){
  if(!ready)return;inspector.removeAllViews();strip.removeAllViews();
  for(File f:photos)strip.addView(button((f.equals(source)?"● ":"")+f.getName(),()->{selectPhoto(f);}));
  inspector.addView(text(section,21));if(source!=null)inspector.addView(button("Оценка: "+currentRating+" ★  "+currentFlag,()->ratingMenu()));
  if(section.equals("Плёнки")){inspector.addView(button("Маршрут: "+(Boolean.TRUE.equals(get("io.scan_film"))?"прямой скан без бумаги":"печать на бумаге"),()->{set("io.scan_film",!Boolean.TRUE.equals(get("io.scan_film")));changed(true);refresh();}));stocks(false);inspector.addView(text("Бумага / печатная плёнка",18));stocks(true);return;}
  if(section.equals("Негатив")){negativeUi();return;}
  if(section.equals("Все параметры")){inspector.addView(text("Полная схема исходного движка. Значение null означает профильное значение материала. Неверные значения отклоняются движком.",13));allFields(params,"");return;}
  if(section.equals("Вывод")){finishUi();renderSections(metadata.optJSONArray("output"));return;}
  renderSections(metadata.optJSONArray(section.equals("Подготовка")?"prep":"lab"));
 }
 void stocks(boolean papers){
  JSONArray ps=catalog.optJSONArray("profiles");ArrayList<JSONObject> list=new ArrayList<>();
  for(int i=0;i<ps.length();i++){JSONObject p=ps.optJSONObject(i);if(p.optBoolean("paper")==papers)list.add(p);}
  Button b=button((papers?"Бумага: ":"Плёнка: ")+stockName(papers?paper:film),()->{
   LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);EditText q=new EditText(this);q.setSingleLine();q.setHint("Поиск материала");content.addView(q);ListView lv=new ListView(this);content.addView(lv,new LinearLayout.LayoutParams(-1,dp(380)));
   ArrayList<JSONObject> visible=new ArrayList<>();ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_list_item_1);lv.setAdapter(adapter);
   Runnable update=()->{adapter.clear();visible.clear();for(JSONObject p:list)if(p.optString("name").toLowerCase(Locale.ROOT).contains(q.getText().toString().toLowerCase(Locale.ROOT))){visible.add(p);adapter.add(p.optString("name")+(p.optBoolean("bw")?" · B&W":"")+(p.optBoolean("positive")?" · Slide":""));}};update.run();
   q.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){update.run();}public void afterTextChanged(android.text.Editable e){}});
   AlertDialog d=new AlertDialog.Builder(this).setTitle(papers?"Бумага":"Все плёнки negs").setView(content).setNegativeButton("Отмена",null).create();
   lv.setOnItemClickListener((a,v,pos,id)->{if(papers)paper=visible.get(pos).optString("id");else{film=visible.get(pos).optString("id");String target=visible.get(pos).optString("target_print","");if(!target.isBlank()&&!target.equals("null"))paper=target;}changed(true);refresh();d.dismiss();});d.show();
  });inspector.addView(b);
  if(!papers)inspector.addView(text("Характеристики зерна, галяции и DIR берутся из профиля, пока вы их не переопределили. Параметры обработки сохраняются при смене плёнки.",13));
 }
 String stockName(String id){JSONArray ps=catalog.optJSONArray("profiles");for(int i=0;i<ps.length();i++)if(id.equals(ps.optJSONObject(i).optString("id")))return ps.optJSONObject(i).optString("name");return id;}
 void renderSections(JSONArray ss){if(ss==null)return;for(int i=0;i<ss.length();i++){JSONObject s=ss.optJSONObject(i);if(s==null)continue;inspector.addView(text(label(s.optString("title")),19));if(s.optBoolean("print")&&Boolean.TRUE.equals(get("io.scan_film")))inspector.addView(text("Бумага обходится: выбран прямой скан плёнки. Настройки сохраняются.",13));controls(inspector,s.optJSONArray("controls"));JSONArray groups=s.optJSONArray("groups");if(groups!=null)for(int g=0;g<groups.length();g++){JSONObject group=groups.optJSONObject(g);LinearLayout box=inspector;String key=section+":"+s.optString("title")+":"+group.optString("title");lazyGroup(box,key,label(group.optString("title")),body->{String enable=group.optString("enable","");if(!enable.isEmpty())addField(body,enable,"Включено",fieldSpecs.get(enable));controls(body,group.optJSONArray("controls"));});}if(s.has("footer"))inspector.addView(text(s.optString("footer"),12));}}
 interface Populate {void fill(LinearLayout body);}
 void lazyGroup(LinearLayout box,String key,String title,Populate populate){LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);boolean open=expandedGroups.contains(key);if(open)populate.fill(body);body.setVisibility(open?View.VISIBLE:View.GONE);box.addView(button(title+"  ▾",()->{if(body.getVisibility()==View.VISIBLE){expandedGroups.remove(key);body.setVisibility(View.GONE);}else{if(body.getChildCount()==0)populate.fill(body);expandedGroups.add(key);body.setVisibility(View.VISIBLE);}}));box.addView(body);}
 void controls(LinearLayout box,JSONArray cc){if(cc==null)return;for(int i=0;i<cc.length();i++){JSONObject c=cc.optJSONObject(i);if(c==null)continue;String path=c.optString("path","");if(!path.isEmpty())addField(box,path,c.optString("label",path),c);else if(c.optString("kind").equals("match")){box.addView(button("Согласовать яркость с камерой",this::matchBrightness));}else if(c.optString("kind").equals("action")){String a=c.optString("action");box.addView(button(c.optString("label"),()->engineAction(a)));}}}
 void addField(LinearLayout box,String path,String title,JSONObject spec){
  Object value=get(path);int index=spec==null?-1:spec.optInt("index",-1);Object shown=value;
  if(index>=0&&value instanceof JSONArray)shown=((JSONArray)value).opt(index);
  String display=(shown==JSONObject.NULL?"Профиль / автоматически":String.valueOf(shown));
  boolean modified=!String.valueOf(value).equals(String.valueOf(def(path)));
  LinearLayout row=line();Button b=button((modified?"● ":"")+label(title)+"\n"+display,()->editField(path,title,spec));b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);row.addView(b,new LinearLayout.LayoutParams(0,-2,1));row.addView(button("↺",()->{set(path,def(path));changed(true);refresh();}));box.addView(row);
  if(spec!=null&&spec.has("help"))box.addView(text(spec.optString("help"),12));if(spec!=null&&spec.has("when"))box.addView(text("Зависит от: "+spec.opt("when"),12));
 }
 void editField(String path,String title,JSONObject spec){
  Object old=get(path);int index=spec==null?-1:spec.optInt("index",-1);
  JSONArray options=spec==null?null:spec.optJSONArray("options");if(options==null&&spec!=null&&spec.optJSONObject("filters")!=null){options=new JSONArray();for(Iterator<String> it=spec.optJSONObject("filters").keys();it.hasNext();)options.put(it.next());}
  if(options!=null){String[] a=new String[options.length()];for(int i=0;i<a.length;i++)a[i]=options.optString(i);new AlertDialog.Builder(this).setTitle(label(title)).setItems(a,(d,n)->{set(path,a[n]);changed(true);refresh();}).setNegativeButton("Отмена",null).show();return;}
  if(old instanceof Boolean){set(path,!((Boolean)old));changed(true);refresh();return;}
  EditText e=new EditText(this);e.setText(index>=0&&old instanceof JSONArray?String.valueOf(((JSONArray)old).opt(index)):String.valueOf(old));
  if(old instanceof Number||index>=0)e.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL|InputType.TYPE_NUMBER_FLAG_SIGNED);
  String help=path+(spec!=null&&spec.has("min")?"\nДиапазон регулятора negs: "+spec.opt("min")+" … "+spec.opt("max")+"; шаг "+spec.opt("step"):"");
  LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.addView(text(help,12));content.addView(e);
  if(spec!=null&&spec.has("min")&&spec.has("max")&&index<0&&old instanceof Number){SeekBar seek=new SeekBar(this);seek.setMax(1000);double lo=spec.optDouble("min"),hi=spec.optDouble("max");seek.setProgress((int)(1000*(((Number)old).doubleValue()-lo)/(hi-lo)));seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}public void onProgressChanged(SeekBar s,int p,boolean user){if(user){double v=lo+(hi-lo)*p/1000.;double step=spec.optDouble("step",.01);e.setText(String.format(Locale.ROOT,"%.6f",Math.round(v/step)*step));}}});content.addView(seek);}
  AlertDialog d=new AlertDialog.Builder(this).setTitle(label(title)).setView(content).setPositiveButton("Применить",null).setNeutralButton("Профиль / сброс",(x,n)->{set(path,def(path));changed(true);refresh();}).setNegativeButton("Отмена",null).create();
  d.setOnShowListener(v->d.getButton(-1).setOnClickListener(w->{try{
   String t=e.getText().toString().trim();if(old instanceof Number||index>=0)t=t.replace(',','.');Object result;
   if(t.equals("null"))result=JSONObject.NULL;
   else if(index>=0){JSONArray arr=old instanceof JSONArray?new JSONArray(old.toString()):resolvedArray(path);if(arr==null)throw new IllegalArgumentException("Введите весь массив через «Все параметры» или сначала выберите плёнку");arr.put(index,Double.parseDouble(t));result=arr;}
   else if(old instanceof Number){double n=Double.parseDouble(t);if(!Double.isFinite(n))throw new IllegalArgumentException("Требуется конечное число");result=(old instanceof Integer||old instanceof Long)?(Object)Long.valueOf(Math.round(n)):(Object)Double.valueOf(n);}
   else if(old instanceof JSONArray||old instanceof JSONObject||old==JSONObject.NULL){result=new JSONTokener(t).nextValue();}
   else result=t;
   set(path,result);changed(true);refresh();d.dismiss();
  }catch(Exception ex){e.setError(ex.getMessage());}}));d.show();
 }
 JSONArray resolvedArray(String path){String group=path.contains("grain")?"grain":path.contains("halation")?"halation":"dir_couplers";String key=path.substring(path.lastIndexOf('.')+1);JSONArray profiles=catalog.optJSONArray("profiles");for(int i=0;i<profiles.length();i++){JSONObject p=profiles.optJSONObject(i);if(film.equals(p.optString("id"))&&p.optJSONObject(group)!=null)return p.optJSONObject(group).optJSONArray(key);}return null;}
 void allFields(JSONObject j,String prefix){ArrayList<String> keys=new ArrayList<>();j.keys().forEachRemaining(keys::add);Collections.sort(keys);for(String k:keys){String path=prefix.isEmpty()?k:prefix+"."+k;Object v=j.opt(k);if(v instanceof JSONObject){LinearLayout box=inspector;lazyGroup(box,"all:"+path,path,body->{LinearLayout previous=inspector;inspector=body;allFields((JSONObject)v,path);inspector=previous;});}else addField(inspector,path,path,fieldSpecs.get(path));}}
 void finishUi(){
  inspector.addView(text("Формат, глубина и ICC выбираются при сохранении. Предпросмотр рамки и кадрирования рассчитывает тот же движок, что экспорт.",13));
  inspector.addView(button("Рамка: "+finish.optString("border","нет"),()->new AlertDialog.Builder(this).setTitle("Рамки исходного negs").setItems(new String[]{"Без рамки","Белая кромка","Плёнка 120","Keyline","35mm с маркировкой"},(d,n)->{if(n==0)finish.remove("border");else put(finish,"border",new String[]{"","white","film","keyline","35mm"}[n]);changed(true);refresh();}).show()));
  inspector.addView(button("Ширина / цвет рамки",()->jsonEdit("Параметры рамки",finish.optJSONObject("border_options")==null?obj("{\"width\":0.03,\"line\":0.004,\"color\":\"#ffffff\",\"line_color\":\"#000000\"}"):finish.optJSONObject("border_options"),j->{put(finish,"border_options",j);changed(true);} )));
  inspector.addView(button("Кадрирование и горизонт",this::cropDialog));
  inspector.addView(button("Отразить по горизонтали",()->{put(finish,"flip",!finish.optBoolean("flip"));changed(true);}));
  inspector.addView(button("Повернуть на 90°",()->{put(finish,"rotate_cw",(finish.optInt("rotate_cw")+1)%4);changed(true);}));
  inspector.addView(button("Сбросить кадрирование / рамку",()->{finish=new JSONObject();changed(true);refresh();}));
  inspector.addView(button("Качество JPEG: "+quality,()->{EditText e=new EditText(this);e.setInputType(InputType.TYPE_CLASS_NUMBER);e.setText(String.valueOf(quality));new AlertDialog.Builder(this).setTitle("JPEG · 1–100").setView(e).setPositiveButton("Применить",(d,n)->{try{quality=Math.max(1,Math.min(100,Integer.parseInt(e.getText().toString())));refresh();}catch(Exception ex){error(ex);}}).setNegativeButton("Отмена",null).show();}));
  inspector.addView(button("Экспорт: "+(useReference?"Reference · CPU f64":"Fast · GPU / CPU"),()->{useReference=!useReference;refresh();}));
  inspector.addView(button("Экспорт LUT 33³ (.cube)",()->exportLut()));
  inspector.addView(button("Импорт .negs к текущему кадру",()->pick(12,"*/*",false)));
  inspector.addView(button("Пакетный экспорт · текущий рецепт ко всем",()->exportMenu(true)));
 }
 interface JsonResult {void accept(JSONObject j);}
 void jsonEdit(String title,JSONObject initial,JsonResult result){EditText e=new EditText(this);e.setText(initial.toString());e.setMinLines(4);AlertDialog d=new AlertDialog.Builder(this).setTitle(title).setView(e).setPositiveButton("Применить",null).setNegativeButton("Отмена",null).create();d.setOnShowListener(v->d.getButton(-1).setOnClickListener(w->{try{result.accept(new JSONObject(e.getText().toString()));d.dismiss();}catch(Exception ex){e.setError(ex.getMessage());}}));d.show();}
 void cropDialog(){
  JSONObject crop=finish.optJSONObject("crop");if(crop==null)crop=obj("{\"x\":0,\"y\":0,\"width\":1,\"height\":1,\"angle\":0}");
  final JSONObject initial=crop;
  new AlertDialog.Builder(this).setTitle("Кадрирование").setItems(new String[]{"Свободный прямоугольник на фотографии","3:2","4:3","1:1","Вертикальный 4:5","Точные координаты и горизонт"},(d,n)->{
   if(n==0){photo.requestCrop=true;original();return;}
   if(n==5){jsonEdit("Доли кадра 0…1; угол −45…45°",initial,j->{double x=j.optDouble("x"),y=j.optDouble("y"),w=j.optDouble("width"),h=j.optDouble("height"),a=j.optDouble("angle");if(!Double.isFinite(x+y+w+h+a)||x<0||y<0||w<=0||h<=0||x+w>1.000001||y+h>1.000001||Math.abs(a)>45)throw new IllegalArgumentException("Недопустимые границы или угол");put(finish,"crop",j);changed(true);});return;}
   if(photo.originalWidth<=0)return;double ratio=new double[]{1,1.5,4./3,1,.8}[n],base=(double)photo.originalWidth/photo.originalHeight;
   double w=Math.min(1,ratio/base),h=Math.min(1,base/ratio);put(finish,"crop",obj("{\"x\":"+((1-w)/2)+",\"y\":"+((1-h)/2)+",\"width\":"+w+",\"height\":"+h+",\"angle\":0}"));changed(true);
  }).show();
 }
 JSONObject requestFor(String name,File input,JSONObject p,String f,String pa){JSONObject c=cmd(name);put(c,"input",input.getAbsolutePath());put(c,"film",f);put(c,"paper",pa);put(c,"params",p);return c;}
 JSONObject saveFor(long renderId,File output,JSONObject p,JSONObject finishing,int bits){
  JSONObject c=cmd("save");put(c,"render_id",renderId);put(c,"output",output.getAbsolutePath());
  put(c,"crop_after_post",true);put(c,"save_options",obj("{\"jpeg_quality\":"+quality+",\"copy_metadata\":true,\"bit_depth\":"+bits+",\"color_space\":"+JSONObject.quote(String.valueOf(nested(p,"io.output_color_space")))+"}"));
  for(Iterator<String> i=finishing.keys();i.hasNext();){String k=i.next();put(c,k,finishing.opt(k));}return c;
 }
 Object nested(JSONObject j,String path){Object a=j;for(String k:path.split("\\.")){if(a instanceof JSONObject)a=((JSONObject)a).opt(k);else if(a instanceof JSONArray){try{a=((JSONArray)a).opt(Integer.parseInt(k));}catch(NumberFormatException ex){return JSONObject.NULL;}}else return JSONObject.NULL;}return a==null?JSONObject.NULL:a;}
 void render(boolean full,File export){
  if(source==null)return;final File input=source;final JSONObject p=copy(params),fin=copy(finish);final String f=film,pa=paper;final int rev=revision;final boolean reference=useReference;
  note(full?"Полноразмерная обработка…":"Проявка предпросмотра…");
  worker.execute(()->{try{
   if(!full&&rev!=revision)return;
   long started=SystemClock.elapsedRealtime();JSONObject result=develop(input,p,f,pa,fin,full,export,reference);put(result,"total_ms",SystemClock.elapsedRealtime()-started);
   if(full){ui.post(()->saveDocument(export));return;}
   Bitmap bitmap=BitmapFactory.decodeFile(new File(getCacheDir(),"preview.png").getAbsolutePath());if(bitmap==null)throw new IOException("Не удалось прочитать предпросмотр");
   ui.post(()->{if(rev!=revision){bitmap.recycle();return;}photo.show(bitmap);photo.originalWidth=result.optInt("source_width",bitmap.getWidth());photo.originalHeight=result.optInt("source_height",bitmap.getHeight());note(result.optString("backend")+" · "+result.optInt("output_width")+" × "+result.optInt("output_height")+" · "+result.optLong("total_ms")+" мс");});
  }catch(Throwable e){error(e);}});
 }
 JSONObject renderFor(File input,JSONObject p,String f,String pa,boolean full){JSONObject c=requestFor(full?"render":"android_preview",input,p,f,pa);put(c,"limit_preview",!full);if(!full)put(c,"long_side",previewLongSide);return c;}
 JSONObject develop(File input,JSONObject p,String f,String pa,JSONObject fin,boolean full,File export,boolean reference)throws Exception{
  onReferenceThread=full&&reference;try {
  JSONObject c=renderFor(input,p,f,pa,full);put(c,"preview_path",new File(getCacheDir(),"display.rgba").getAbsolutePath());
  JSONObject r=call(c);long id=c.optLong("id");
  File out=full?export:new File(getCacheDir(),"preview.png");
  JSONObject save=saveFor(id,out,p,fin,full?exportDepth:8);
  if(!full){JSONObject options=save.optJSONObject("save_options");put(options,"color_space","sRGB");put(options,"copy_metadata",false);}
  call(save);return r;
  }finally{if(onReferenceThread){try{call(cmd("android_release"));}catch(Exception ignored){}}onReferenceThread=false;}
 }
 void exportMenu(boolean batch){
  if(source==null){note("Сначала откройте фотографию");return;}
  new AlertDialog.Builder(this).setTitle("Экспорт с ICC и EXIF").setItems(new String[]{"JPEG · 8 бит · качество 95","PNG · 8 бит","PNG · 16 бит","TIFF · 16 бит","TIFF · 8 бит"},(d,n)->{
   exportFormat=new String[]{"jpg","png","png","tiff","tiff"}[n];exportDepth=(n==2||n==3)?16:8;
   if(batch){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);startActivityForResult(i,30);}else render(true,new File(getCacheDir(),"Negs-"+System.currentTimeMillis()+"."+exportFormat));
  }).setNegativeButton("Отмена",null).show();
 }
 void saveDocument(File f){pendingSave=f;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(f.getName().endsWith(".jpg")?"image/jpeg":f.getName().endsWith(".png")?"image/png":f.getName().endsWith(".tiff")?"image/tiff":"application/octet-stream");i.putExtra(Intent.EXTRA_TITLE,f.getName());startActivityForResult(i,20);}
 void exportLut(){JSONObject p=copy(params);String f=film,pa=paper;File out=new File(getCacheDir(),"Negs-"+film+".cube");worker.execute(()->{try{JSONObject c=cmd("export_lut");put(c,"film",f);put(c,"paper",pa);put(c,"params",p);put(c,"size",33);put(c,"output",out.getAbsolutePath());note("Расчёт LUT…");call(c);ui.post(()->saveDocument(out));}catch(Throwable e){error(e);}});}
 void menu(){new AlertDialog.Builder(this).setTitle("Negs Android").setItems(new String[]{"Отменить","Повторить","Импорт пресета JSON","Экспорт пресета JSON","Сравнить с исходником","Тоновая кривая","Сбросить обработку","Лицензии и исходники","Скопировать обработку","Вставить обработку","Дублировать кадр","Открыть папку","Качество предпросмотра"},(d,n)->{
  if(n==0||n==1){int next=historyIndex+(n==0?-1:1);if(next>=0&&next<history.size()){historyIndex=next;restore(obj(history.get(next)));changed(false);refresh();}}
  if(n==2)pick(11,"*/*",false);
  if(n==3){JSONObject c=cmd("preset_export");put(c,"film",film);put(c,"paper",paper);put(c,"params",copy(params));worker.execute(()->{try{JSONObject r=call(c);File out=new File(getCacheDir(),"Negs-preset.json");java.nio.file.Files.write(out.toPath(),r.getString("text").getBytes(StandardCharsets.UTF_8));ui.post(()->saveDocument(out));}catch(Throwable e){error(e);}});}
  if(n==4)original();if(n==5)tone();
  if(n==6)new AlertDialog.Builder(this).setMessage("Сбросить все регулировки? Исходный файл сохранится.").setPositiveButton("Сбросить",(a,b)->{params=copy(defaults);finish=new JSONObject();changed(true);refresh();}).setNegativeButton("Отмена",null).show();
  if(n==8){((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Negs recipe",state().toString()));note("Рецепт скопирован");}
  if(n==9){android.content.ClipboardManager cb=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(cb.hasPrimaryClip())try{JSONObject recipe=new JSONObject(cb.getPrimaryClip().getItemAt(0).coerceToText(this).toString());params=copy(recipe.getJSONObject("params"));film=recipe.getString("film");paper=recipe.getString("paper");finish=copy(recipe.getJSONObject("finish"));changed(true);refresh();}catch(Exception e){error(e);}}
  if(n==10&&source!=null){File from=source;worker.execute(()->{try{File target=new File(from.getParentFile(),UUID.randomUUID().toString().substring(0,6)+"-"+from.getName());java.nio.file.Files.copy(from.toPath(),target.toPath());File sc=new File(from.getAbsolutePath()+".negs");if(sc.exists())java.nio.file.Files.copy(sc.toPath(),new File(target.getAbsolutePath()+".negs").toPath());ui.post(()->{photos.add(target);selectPhoto(target);});}catch(Throwable e){error(e);}});}
  if(n==12)new AlertDialog.Builder(this).setTitle("Экранный предпросмотр · экспорт без ограничений").setItems(new String[]{"Максимальный отклик · 768 px","Сбалансировано · 1280 px","Подробно · 2048 px"},(x,k)->{previewLongSide=new int[]{768,1280,2048}[k];changed(false);}).show();
  if(n==11)startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE),31);
  if(n==7)new AlertDialog.Builder(this).setTitle("Negs 0.18.0 · Android port").setMessage("Оригинальный Rust-движок noahhaasis/negs. GPL-3.0-only. Spektrafilm: Andrea Volpato, Rust port: turbasvin. RAW: rawler и LibRaw.\nhttps://github.com/noahhaasis/negs\n\nAndroid-порт собирается из включённых исходников. Apple RAW и Metal — платформенные возможности macOS.").setPositiveButton("OK",null).show();
 }).show();}
 void original(){if(source==null)return;JSONObject c=requestFor("android_original",source,copy(params),film,paper);put(c,"long_side",previewLongSide);File path=new File(getCacheDir(),"original.rgba");put(c,"preview_path",path.getAbsolutePath());put(c,"limit_preview",true);worker.execute(()->{try{JSONObject r=call(c);int w=r.getInt("width"),h=r.getInt("height");byte[] bytes=java.nio.file.Files.readAllBytes(path.toPath());Bitmap bmp=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);bmp.copyPixelsFromBuffer(java.nio.ByteBuffer.wrap(bytes));ui.post(()->{photo.show(bmp);note("Исходник. Нажмите на фотографию, чтобы вернуться к обработке.");photo.originalShown=true;if(photo.requestCrop){photo.requestCrop=false;photo.cropMode=true;note("Выделите прямоугольник на исходнике");}});}catch(Throwable e){error(e);}});}
 void tone(){JSONObject c=cmd("tone_curve");put(c,"film",film);put(c,"paper",paper);put(c,"params",copy(params));put(c,"count",128);worker.execute(()->{try{JSONObject r=call(c);ui.post(()->showCurve(r));}catch(Throwable e){error(e);}});}
 void showCurve(JSONObject result){View graph=new View(this){Paint p=new Paint(3);protected void onDraw(Canvas c){super.onDraw(c);c.drawColor(0xff151816);p.setStrokeWidth(dp(1));p.setColor(0xff555b53);for(int i=0;i<5;i++){float x=getWidth()*i/4f,y=getHeight()*i/4f;c.drawLine(x,0,x,getHeight(),p);c.drawLine(0,y,getWidth(),y,p);}JSONArray rgb=result.optJSONArray("rgb");if(rgb==null)return;p.setStrokeWidth(dp(2));for(int channel=0;channel<3;channel++){p.setColor(new int[]{0xffff756b,0xff82d494,0xff88afff}[channel]);float oldX=0,oldY=getHeight();for(int i=0;i<rgb.length();i++){JSONArray row=rgb.optJSONArray(i);float x=i*getWidth()/(float)(rgb.length()-1),y=getHeight()*(1-(float)Math.max(0,Math.min(1,row.optDouble(channel))));if(i>0)c.drawLine(oldX,oldY,x,y,p);oldX=x;oldY=y;}}}};LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.addView(text("По горизонтали — экспозиция плёнки; по вертикали — кодированный выход RGB. Кривая рассчитана исходным движком.",13));body.addView(graph,new LinearLayout.LayoutParams(-1,dp(250)));new AlertDialog.Builder(this).setTitle("Тоновая характеристика").setView(body).setPositiveButton("Готово",null).show();}
 void matchBrightness(){if(source==null||photo.originalWidth<=0){note("Дождитесь предпросмотра фотографии");return;}File input=source;JSONObject p=copy(params);String f=film,pa=paper;int rev=revision;int w=photo.originalWidth,h=photo.originalHeight;worker.execute(()->{try{File ref=new File(getCacheDir(),"camera-reference.rgb");JSONObject c=cmd("brightness_reference");put(c,"input",input.getAbsolutePath());put(c,"reference_path",ref.getAbsolutePath());put(c,"expected_width",w);put(c,"expected_height",h);JSONObject answer=call(c);if(!answer.optBoolean("usable"))throw new IOException(answer.optString("reason","Нет подходящего встроенного превью камеры"));JSONObject place=requestFor("place_exposure",input,p,f,pa);put(place,"reference_path",ref.getAbsolutePath());JSONObject found=call(place);ui.post(()->{if(rev!=revision)return;set("prep.exposure_ev",found.optDouble("exposure_ev"));changed(true);refresh();});}catch(Throwable e){error(e);}});}
 void negativeUi(){inspector.addView(button("Вернуться к моделированию плёнки",()->{set("workflow.route","input > film > print > scan");changed(true);refresh();}));
  for(String path:new String[]{"film_render.convert.scan_illuminant","film_render.convert.exposure_compensation_ev","film_render.convert.base_percentile","film_render.convert.calibration","film_render.convert.flat_field"})addField(inspector,path,path.substring(path.lastIndexOf('.')+1),null);
  inspector.addView(text("Настоящий отсканированный негатив. Выберите его плёнку и входную интерпретацию в IO. Эти команды исходного negs измеряют основу и согласуют печать.",14));for(String[] action:new String[][]{{"Определить основу и баланс","negative_base"},{"Автокоррекция печати","negative_auto"},{"Замер экспозиции печати","negative_meter"},{"Проверить негатив","negative_check"},{"Нейтральная точка по центру","negative_neutral"}})inspector.addView(button(action[0],()->negative(action[1])));}
 void negative(String name){if(source==null)return;JSONObject working=copy(params);put(working.optJSONObject("workflow"),"route","input > convert-film > print > scan");JSONObject c=requestFor(name,source,working,film,paper);if(name.equals("negative_neutral"))put(c,"point",new JSONArray(Arrays.asList(.5,.5)));worker.execute(()->{try{JSONObject r=call(c);ui.post(()->{if(name.equals("negative_check")){note(r.optBoolean("looks_negative")?"Похоже на цветной негатив":"Данные не похожи на цветной негатив");return;}
    new AlertDialog.Builder(this).setTitle("Применить калибровку негатива?").setMessage(r.toString()).setPositiveButton("Применить",(d,n)->{
     set("workflow.route","input > convert-film > print > scan");
     if(r.has("base"))set("film_render.base",r.optJSONObject("base"));
     if(r.has("exposure_ev"))set("film_render.convert.exposure_compensation_ev",r.opt("exposure_ev"));
     for(String key:new String[]{"m_filter_shift","y_filter_shift","print_exposure"})if(r.has(key))set("enlarger."+key,r.opt(key));
     changed(true);refresh();
    }).setNegativeButton("Отмена",null).show();});}catch(Throwable e){error(e);}});}
 void engineAction(String action){if(action.toLowerCase(Locale.ROOT).contains("balance")){JSONObject c=cmd("balance_print");put(c,"film",film);put(c,"paper",paper);put(c,"params",copy(params));worker.execute(()->{try{JSONObject r=call(c);ui.post(()->{set("enlarger.m_filter_shift",r.opt("m_filter_shift"));set("enlarger.y_filter_shift",r.opt("y_filter_shift"));changed(true);refresh();});}catch(Throwable e){error(e);}});}else error(new IllegalArgumentException("Неизвестная команда: "+action));}
 void pick(int request,String mime,boolean multi){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(mime);i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multi);startActivityForResult(i,request);}
 @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);View panel=root.getChildAt(root.getChildCount()-1);LinearLayout.LayoutParams lp=(LinearLayout.LayoutParams)panel.getLayoutParams();lp.height=dp(config.orientation==2?120:270);panel.setLayoutParams(lp);photo.zoom=1;photo.tx=photo.ty=0;}
 @Override protected void onNewIntent(Intent i){super.onNewIntent(i);setIntent(i);if(ready)accept(i);}
 void accept(Intent i){Uri u=i.getData();if(u==null&&i.getParcelableExtra(Intent.EXTRA_STREAM) instanceof Uri)u=i.getParcelableExtra(Intent.EXTRA_STREAM);if(u!=null)importUris(Collections.singletonList(u));}
 File copyUri(Uri uri)throws Exception{String name="photo";try(android.database.Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}name=name.replaceAll("[^\\p{L}\\p{N}._-]","_");File dir=new File(getFilesDir(),"photos");dir.mkdirs();File file=new File(dir,System.currentTimeMillis()+"-"+UUID.randomUUID().toString().substring(0,6)+"-"+name);try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(file)){if(in==null)throw new IOException("Файл недоступен");transfer(in,out);}return file;}
 void importUris(List<Uri> uris){note("Импорт файлов…");worker.execute(()->{try{ArrayList<File> loaded=new ArrayList<>();for(Uri u:uris)loaded.add(copyUri(u));ui.post(()->{photos.addAll(loaded);selectPhoto(loaded.get(0));});}catch(Throwable e){error(e);}});}
 @Override protected void onActivityResult(int req,int code,Intent intent){super.onActivityResult(req,code,intent);if(code!=RESULT_OK||intent==null)return;Uri uri=intent.getData();
  if(req==10){ArrayList<Uri> a=new ArrayList<>();ClipData clip=intent.getClipData();if(clip!=null)for(int i=0;i<clip.getItemCount();i++)a.add(clip.getItemAt(i).getUri());else if(uri!=null)a.add(uri);if(!a.isEmpty())importUris(a);}
  if(req==11&&uri!=null){JSONObject before=copy(params);worker.execute(()->{try(InputStream in=getContentResolver().openInputStream(uri)){JSONObject c=cmd("preset_import");put(c,"text",new String(read(in),StandardCharsets.UTF_8));put(c,"params",before);JSONObject r=call(c);ui.post(()->{params=copy(r.optJSONObject("params"));film=r.optString("film",film);paper=r.optString("paper",paper);changed(true);refresh();});}catch(Throwable e){error(e);}});}
  if(req==12&&uri!=null&&source!=null){File photoFile=source;worker.execute(()->{try(InputStream in=getContentResolver().openInputStream(uri)){byte[] b=read(in);if(b.length>1048576)throw new IOException("Файл .negs больше 1 МБ");JSONObject c=cmd("android_sidecar_import");put(c,"input",photoFile.getAbsolutePath());put(c,"text",new String(b,StandardCharsets.UTF_8));JSONObject result=call(c);ui.post(()->{if(photoFile.equals(source)){applySidecar(result);changed(true);refresh();}});}catch(Throwable e){error(e);}});}
  if(req==20&&uri!=null&&pendingSave!=null){File file=pendingSave;worker.execute(()->{try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException("Папка недоступна");transfer(in,out);note("Сохранено: "+file.getName());}catch(Throwable e){error(e);}});}
  if(req==30&&uri!=null)batch(uri);if(req==31&&uri!=null)importFolder(uri);
 }
 void importFolder(Uri tree){note("Чтение папки…");worker.execute(()->{try{ArrayList<Uri> files=new ArrayList<>();Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));try(android.database.Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){if(c!=null)while(c.moveToNext()){String name=c.getString(1).toLowerCase(Locale.ROOT);if(name.matches(".*\\.(jpe?g|png|tiff?|dng|nef|nrw|cr2|cr3|arw|raf|orf|rw2|pef|3fr|iiq|erf|srw|mos|kdc|x3f|raw)$"))files.add(DocumentsContract.buildDocumentUriUsingTree(tree,c.getString(0)));}}if(files.isEmpty()){note("В папке нет поддерживаемых фотографий");return;}ui.post(()->importUris(files));}catch(Throwable e){error(e);}});}
 void batch(Uri tree){JSONObject p=copy(params),fin=copy(finish);String f=film,pa=paper,ext=exportFormat;boolean reference=useReference;ArrayList<File> files=new ArrayList<>(photos);worker.execute(()->{try{int i=0;for(File input:files){note("Пакет: "+(++i)+" / "+files.size());File out=new File(getCacheDir(),"batch."+ext);develop(input,copy(p),f,pa,fin,true,out,reference);Uri parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));Uri target=DocumentsContract.createDocument(getContentResolver(),parent,ext.equals("jpg")?"image/jpeg":ext.equals("png")?"image/png":"image/tiff",input.getName()+"-negs."+ext);if(target==null)throw new IOException("Невозможно создать файл");try(InputStream in=new FileInputStream(out);OutputStream dst=getContentResolver().openOutputStream(target)){transfer(in,dst);}}note("Пакет сохранён: "+files.size()+" файлов");}catch(Throwable e){error(e);}});}
 @Override protected void onStop(){super.onStop();persist();}
 @Override protected void onDestroy(){super.onDestroy();ui.removeCallbacks(renderLater);ui.removeCallbacks(persistLater);worker.shutdown();}
 JSONObject sidecarRecipe(){
  JSONObject r=new JSONObject();put(r,"film",film);put(r,"paper",paper);JSONObject p=copy(params);put(p.optJSONObject("io"),"rotate_cw",finish.optInt("rotate_cw"));put(p.optJSONObject("io"),"flip",finish.optBoolean("flip"));put(r,"params",p);
  JSONObject cr=finish.optJSONObject("crop");if(cr==null)cr=obj("{\"x\":0,\"y\":0,\"width\":1,\"height\":1,\"angle\":0}");
  JSONObject crop=obj("{\"aspect\":\"original\",\"custom\":[5,4]}");
  JSONArray rect=new JSONArray();rect.put(new JSONArray(Arrays.asList(cr.optDouble("x"),cr.optDouble("y"))));rect.put(new JSONArray(Arrays.asList(cr.optDouble("x")+cr.optDouble("width"),cr.optDouble("y")+cr.optDouble("height"))));put(crop,"rect",rect);put(crop,"angle",cr.optDouble("angle"));put(r,"crop",crop);
  JSONObject border=obj("{\"color\":\"#ffffff\",\"lineColor\":\"#000000\",\"line\":0.004,\"width\":0.03,\"filmWidth\":0,\"export\":true}");
  put(border,"enabled",finish.has("border"));put(border,"style",finish.optString("border","white"));put(border,"instagram",finish.optBoolean("instagram"));JSONObject options=finish.optJSONObject("border_options");if(options!=null){for(String k:new String[]{"color","line","width"})if(options.has(k))put(border,k,options.opt(k));if(options.has("line_color"))put(border,"lineColor",options.opt("line_color"));}put(r,"border",border);return r;
 }
 static JSONObject merged(JSONObject base,JSONObject changes){JSONObject result=copy(base);if(changes!=null)for(Iterator<String> i=changes.keys();i.hasNext();){String k=i.next();Object v=changes.opt(k);if(v instanceof JSONObject&&result.opt(k) instanceof JSONObject)put(result,k,merged(result.optJSONObject(k),(JSONObject)v));else put(result,k,v);}return result;}
 void applySidecar(JSONObject result){JSONObject state=result.optJSONObject("state");currentRating=result.optInt("rating");currentFlag=result.optString("flag","");if(currentFlag.equals("null"))currentFlag="";if(state==null)return;
  film=state.optString("film",film);paper=state.optString("paper",paper);params=merged(defaults,state.optJSONObject("params"));finish=new JSONObject();
  put(finish,"rotate_cw",((Number)get("io.rotate_cw")).intValue());set("io.rotate_cw",0);put(finish,"flip",get("io.flip"));set("io.flip",false);
  JSONObject crop=state.optJSONObject("crop");if(crop!=null){JSONArray rect=crop.optJSONArray("rect");if(rect!=null&&rect.length()==2){double x=rect.optJSONArray(0).optDouble(0),y=rect.optJSONArray(0).optDouble(1),w=rect.optJSONArray(1).optDouble(0)-x,h=rect.optJSONArray(1).optDouble(1)-y;JSONObject c=new JSONObject();put(c,"x",x);put(c,"y",y);put(c,"width",w);put(c,"height",h);put(c,"angle",crop.optDouble("angle"));put(finish,"crop",c);}}
  JSONObject border=state.optJSONObject("border");if(border!=null&&border.optBoolean("enabled")){put(finish,"border",border.optString("style","white"));put(finish,"instagram",border.optBoolean("instagram"));JSONObject opt=new JSONObject();for(String k:new String[]{"color","line","width"})if(border.has(k))put(opt,k,border.opt(k));put(opt,"line_color",border.optString("lineColor","#000000"));put(finish,"border_options",opt);}
 }
 void selectPhoto(File file){revision++;worker.execute(()->{try{JSONObject c=cmd("android_sidecar_load");put(c,"input",file.getAbsolutePath());JSONObject r=call(c);ui.post(()->{source=file;applySidecar(r);photo.zoom=1;photo.tx=photo.ty=0;changed(true);refresh();});}catch(Throwable e){error(e);}});}
 void ratingMenu(){new AlertDialog.Builder(this).setTitle("Оценка / флаг").setItems(new String[]{"Без звёзд","★","★★","★★★","★★★★","★★★★★","Отобрать","Отклонить","Снять флаг","Экспорт .negs"},(d,n)->{
  if(n==9){File out=new File(getCacheDir(),source.getName()+".negs");File sc=new File(source.getAbsolutePath()+".negs");worker.execute(()->{try{java.nio.file.Files.copy(sc.toPath(),out.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);ui.post(()->saveDocument(out));}catch(Throwable e){error(e);}});return;}
  JSONObject c=cmd("android_sidecar_save");put(c,"input",source.getAbsolutePath());if(n<=5)put(c,"rating",n);else put(c,"flag",n==6?"pick":n==7?"reject":JSONObject.NULL);worker.execute(()->{try{JSONObject r=call(c);ui.post(()->{currentRating=r.optInt("rating");currentFlag=r.optString("flag","");refresh();});}catch(Throwable e){error(e);}});
 }).show();}
 final class PhotoView extends View {
  Bitmap bitmap;Paint paint=new Paint(3);Matrix matrix=new Matrix();float zoom=1,tx=0,ty=0,lastX,lastY;int originalWidth,originalHeight;boolean requestCrop=false,cropMode=false,originalShown=false;float startX,startY;RectF imageRect=new RectF();ScaleGestureDetector detector;
  PhotoView(Context c){super(c);setContentDescription("Предпросмотр фотографии. Масштаб — двумя пальцами.");detector=new ScaleGestureDetector(c,new ScaleGestureDetector.SimpleOnScaleGestureListener(){public boolean onScale(ScaleGestureDetector d){zoom=Math.max(1,Math.min(12,zoom*d.getScaleFactor()));invalidate();return true;}});setOnClickListener(v->{if(originalShown){originalShown=false;changed(false);}});}
  void show(Bitmap b){Bitmap old=bitmap;bitmap=b;if(old!=null&&old!=b)old.recycle();invalidate();}
  @Override public boolean performClick(){return super.performClick();}
  protected void onDraw(Canvas c){super.onDraw(c);if(bitmap==null){paint.setColor(0xffb8c4b7);paint.setTextSize(dp(16));c.drawText("Откройте фотографию",dp(25),getHeight()/2f,paint);return;}float scale=Math.min((float)getWidth()/bitmap.getWidth(),(float)getHeight()/bitmap.getHeight())*zoom;float x=(getWidth()-bitmap.getWidth()*scale)/2+tx,y=(getHeight()-bitmap.getHeight()*scale)/2+ty;imageRect.set(x,y,x+bitmap.getWidth()*scale,y+bitmap.getHeight()*scale);c.drawBitmap(bitmap,null,imageRect,paint);}
  public boolean onTouchEvent(android.view.MotionEvent e){detector.onTouchEvent(e);float x=e.getX(),y=e.getY();switch(e.getActionMasked()){case MotionEvent.ACTION_DOWN:lastX=startX=x;lastY=startY=y;return true;case MotionEvent.ACTION_MOVE:if(!cropMode&&e.getPointerCount()==1&&zoom>1){tx+=x-lastX;ty+=y-lastY;invalidate();}lastX=x;lastY=y;return true;case MotionEvent.ACTION_UP:if(cropMode&&bitmap!=null){cropMode=false;originalShown=false;float x0=Math.max(0,Math.min(1,(Math.min(startX,x)-imageRect.left)/imageRect.width())),y0=Math.max(0,Math.min(1,(Math.min(startY,y)-imageRect.top)/imageRect.height())),x1=Math.max(0,Math.min(1,(Math.max(startX,x)-imageRect.left)/imageRect.width())),y1=Math.max(0,Math.min(1,(Math.max(startY,y)-imageRect.top)/imageRect.height()));if(x1-x0>.01&&y1-y0>.01){put(finish,"crop",obj("{\"x\":"+x0+",\"y\":"+y0+",\"width\":"+(x1-x0)+",\"height\":"+(y1-y0)+",\"angle\":0}"));changed(true);}}else if(Math.abs(x-startX)<dp(6)&&Math.abs(y-startY)<dp(6))performClick();return true;}return true;}
 }
}
