package app.spektrafilm.lab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ColorSpace;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.ResultReceiver;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.spectrafilm.engine.LinearImage;
import com.spectrafilm.engine.SimResult;
import com.spectrafilm.engine.SpektraEngine;
import com.spectrafilm.engine.SpektraParams;
import com.spectrafilm.libraw.LinearResult;
import com.spectrafilm.libraw.RawDecoder;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
        name = "RawDecoder",
        permissions = {
            @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = "images"),
            @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        }
)
public class RawDecoderPlugin extends Plugin {
    private static final String TAG = "SpektraEngine";

    private SpektraEngine engine;
    private ByteBuffer linearData;
    private int linearWidth;
    private int linearHeight;
    private String linearColorSpace = "ProPhoto RGB";
    private boolean linearNeedsCctf;
    private boolean linearOffHeap;
    private String currentName = "frame";
    private byte[] lastJpeg;
    private String lastMime = "image/jpeg";
    private int lastOutWidth;
    private int lastOutHeight;
    private File cachedSourceFile;
    private boolean cachedIsRaw;
    /** "as_shot" keeps camera WB. "daylight" is the base the temperature slider corrects once. */
    private String linearWbBase = "as_shot";
    private int heldPreviewEdge = 960;
    private LinearImage previewBase;
    private int previewBaseEdge;
    private ByteBuffer previewCopyBuf;
    private int previewSlot;
    private final Object lock = new Object();
    private final AtomicInteger simEpoch = new AtomicInteger();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final java.util.concurrent.atomic.AtomicInteger openEpoch = new java.util.concurrent.atomic.AtomicInteger();
    private final AtomicBoolean exporting = new AtomicBoolean(false);
    private volatile long exportStartedAt;
    private final ExecutorService work = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "spektra-work");
        t.setPriority(Thread.NORM_PRIORITY + 1);
        t.setUncaughtExceptionHandler((th, ex) -> Log.e(TAG, "uncaught", ex));
        return t;
    });
    private final ExecutorService libraryWork = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "spektra-library");
        t.setPriority(Thread.NORM_PRIORITY - 1);
        return t;
    });

    @Override
    public void load() {
        try {
            LabLog.init(getContext());
        } catch (Throwable ignored) {
        }
        try {
            long freed = trimCache(null);
            if (freed > 0) LabLog.i("cache", "boot trim " + (freed / (1024 * 1024)) + "MB");
        } catch (Throwable t) {
            LabLog.w("cache", "boot trim failed " + t.getMessage());
        }
        try {
            File last = new File(getContext().getFilesDir(), "spektra-last-export.json");
            if (last.exists() && last.length() > 8 && last.length() < 4000) {
                byte[] buf = new byte[(int) last.length()];
                try (FileInputStream in = new FileInputStream(last)) {
                    int n = in.read(buf);
                    if (n > 0) LabLog.i("export", "last " + new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8));
                }
            }
        } catch (Throwable ignored) {
        }
        try {
            Intent warm = new Intent(getContext(), ExportService.class);
            warm.setAction(ExportService.ACTION_WARM);
            getContext().startService(warm);
        } catch (Throwable t) {
            LabLog.w("boot", "warm start failed " + t.getMessage());
        }
    }

    @PluginMethod
    public void pickAndDecode(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
            "image/*",
            "*/*",
        });
        startActivityForResult(call, intent, "onPicked");
    }

    @PluginMethod
    public void pickText(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/json",
            "text/json",
            "text/plain",
            "*/*",
        });
        startActivityForResult(call, intent, "onPickedText");
    }

    @ActivityCallback
    private void onPickedText(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        final Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled");
            return;
        }
        work.execute(() -> {
            try {
                byte[] bytes;
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("Could not read file");
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream(32 * 1024);
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    int total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 8_000_000) throw new Exception("too large");
                        bos.write(buf, 0, n);
                    }
                    bytes = bos.toByteArray();
                }
                if (bytes.length < 8) {
                    call.reject("not a preset");
                    return;
                }
                String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8).trim();
                if (!text.startsWith("{") && !text.startsWith("[")) {
                    call.reject("not a preset");
                    return;
                }
                JSObject out = new JSObject();
                out.put("name", queryName(uri));
                out.put("text", text);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "read" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void installUserProfile(PluginCall call) {
        String id = call.getString("id");
        String json = call.getString("json");
        if (id == null || json == null) {
            call.reject("id");
            return;
        }
        work.execute(() -> {
            try {
                UserProfiles.write(getContext(), id, json);
                synchronized (lock) {
                    if (engine != null) {
                        UserProfiles.attach(engine, getContext());
                        try {
                            engine.forgetProfile(id);
                        } catch (Throwable ignored) {
                        }
                    }
                }
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("id", id);
                call.resolve(out);
                LabLog.i("profile", "install " + id + " " + json.length() + "b");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "write" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeUserProfile(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id");
            return;
        }
        try {
            UserProfiles.remove(getContext(), id);
            synchronized (lock) {
                if (engine != null) {
                    try {
                        engine.forgetProfile(id);
                    } catch (Throwable ignored) {
                    }
                }
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "delete" : e.getMessage());
        }
    }

    @PluginMethod
    public void listUserProfiles(PluginCall call) {
        try {
            JSObject out = new JSObject();
            org.json.JSONArray ids = new org.json.JSONArray();
            for (String id : UserProfiles.list(getContext())) ids.put(id);
            out.put("ids", ids);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "list" : e.getMessage());
        }
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        final Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled");
            return;
        }
        final int maxEdge = call.getInt("maxEdge", 2560);
        JSONObject paramsJson = call.getObject("params");
        cancelled.set(false);
        work.execute(() -> {
            try {
                simEpoch.incrementAndGet();
                call.resolve(decodeUri(uri, maxEdge, paramsJson));
            } catch (Throwable e) {
                LabLog.e("decode", "decode failed", e);
                Log.e(TAG, "decode failed", e);
                call.reject(friendlyError(e));
            }
        });
    }

    @PluginMethod
    public void processTrials(PluginCall call) {
        final JSONArray variants = call.getArray("variants");
        if (variants == null || variants.length() < 1 || variants.length() > 6) {
            call.reject("Допустимо от одного до шести вариантов"); return;
        }
        final int epoch = simEpoch.get(); cancelled.set(false);
        work.execute(() -> {
            synchronized (lock) {
                byte[] savedJpeg = lastJpeg; String savedMime = lastMime;
                int savedWidth = lastOutWidth, savedHeight = lastOutHeight;
                try {
                    if (exporting.get()) throw new Exception("Дождитесь экспорта");
                    JSONArray images = new JSONArray();
                    for (int i = 0; i < variants.length(); i++) {
                        if (cancelled.get() || epoch != simEpoch.get()) throw new Exception("cancelled");
                        JSONObject trial = new JSONObject(variants.getJSONObject(i).toString());
                        if (!trial.optString("filmStock", "").matches("[a-z0-9_]{1,96}")) throw new Exception("Недопустимый профиль");
                        if (!trial.optString("rawEngine", "spektrafilm").equals("spektrafilm")) throw new Exception("Выберите Spektrafilm");
                        trial.put("previewMaxSize",384);
                        byte[] jpeg = simulateLocked(trial,false,false);
                        JSONObject image = new JSONObject(); image.put("jpeg",Base64.encodeToString(jpeg,Base64.NO_WRAP));
                        image.put("width",lastOutWidth);image.put("height",lastOutHeight);images.put(image);
                    }
                    if (cancelled.get() || epoch != simEpoch.get()) throw new Exception("cancelled");
                    JSObject result = new JSObject();result.put("images",images);call.resolve(result);
                } catch (Throwable error) {call.reject(friendlyError(error));}
                finally {lastJpeg=savedJpeg;lastMime=savedMime;lastOutWidth=savedWidth;lastOutHeight=savedHeight;}
            }
        });
    }

    @PluginMethod
    public void testPrint(PluginCall call) {
        final JSONObject original = call.getObject("params");
        final JSONArray exposures = call.getArray("exposures");
        if (original == null || exposures == null || exposures.length() != 5) {
            call.reject("Нужны настройки и пять выдержек"); return;
        }
        final int epoch = simEpoch.get();
        cancelled.set(false);
        work.execute(() -> {
            synchronized (lock) {
                byte[] savedJpeg = lastJpeg;
                String savedMime = lastMime;
                int savedWidth = lastOutWidth, savedHeight = lastOutHeight;
                try {
                    if (exporting.get()) throw new Exception("Дождитесь завершения экспорта");
                    JSONArray images = new JSONArray();
                    for (int index = 0; index < 5; index++) {
                        if (cancelled.get() || epoch != simEpoch.get()) throw new Exception("cancelled");
                        double exposure = exposures.getDouble(index);
                        if (Double.isNaN(exposure) || Double.isInfinite(exposure) || exposure < 0.2 || exposure > 3) throw new Exception("Недопустимая выдержка");
                        JSONObject trial = new JSONObject(original.toString());
                        trial.put("printExposure", exposure);
                        trial.put("previewMaxSize", 384);
                        byte[] jpeg = simulateLocked(trial, false, false);
                        JSONObject image = new JSONObject();
                        image.put("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
                        image.put("width", lastOutWidth); image.put("height", lastOutHeight);
                        images.put(image);
                    }
                    if (cancelled.get() || epoch != simEpoch.get()) throw new Exception("cancelled");
                    JSObject result = new JSObject(); result.put("images", images); call.resolve(result);
                } catch (Throwable error) {
                    call.reject(friendlyError(error));
                } finally {
                    lastJpeg = savedJpeg; lastMime = savedMime;
                    lastOutWidth = savedWidth; lastOutHeight = savedHeight;
                }
            }
        });
    }

    @PluginMethod
    public void simulate(PluginCall call) {
        JSONObject paramsJson = call.getObject("params");
        boolean preview = Boolean.TRUE.equals(call.getBoolean("preview", true));
        boolean exp = Boolean.TRUE.equals(call.getBoolean("export", false));
        boolean returnJpeg = call.getBoolean("returnJpeg", !exp) != Boolean.FALSE;
        cancelled.set(false);
        final int epoch = simEpoch.incrementAndGet();
        work.execute(() -> {
            try {
                if (epoch != simEpoch.get()) {
                    JSObject stale = new JSObject();
                    stale.put("stale", true);
                    stale.put("jpeg", "");
                    stale.put("width", 0);
                    stale.put("height", 0);
                    stale.put("ms", 0);
                    call.resolve(stale);
                    return;
                }
                if (exp) {
                    exporting.set(true);
                    try {
                        call.resolve(startExportFireForget(paramsJson));
                    } catch (Throwable t) {
                        exporting.set(false);
                        throw t;
                    }
                    return;
                }
                call.resolve(runSimulate(paramsJson, preview, false, returnJpeg));
            } catch (Throwable e) {
                String why = friendlyError(e);
                if (!"cancelled".equals(why)) {
                    LabLog.e("sim", preview ? "preview failed" : (exp ? "export failed" : "simulate failed"), e);
                    Log.e(TAG, "simulate failed", e);
                }
                call.reject(why);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled.set(true);
        simEpoch.incrementAndGet();
        exporting.set(false);
        try {
            ExportService.writeStatusFor(getContext(), ExportService.failBundle("cancelled"));
        } catch (Throwable ignored) {
        }
        try {
            Intent i = new Intent(getContext(), ExportService.class);
            i.setAction(ExportService.ACTION_CANCEL);
            getContext().startService(i);
        } catch (Throwable ignored) {
        }
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }


    @PluginMethod
    public void readChunk(PluginCall call) {
        JSObject out = new JSObject();
        out.put("data", "");
        out.put("n", 0);
        call.resolve(out);
    }

    @PluginMethod
    public void releaseFile(PluginCall call) {
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    @PluginMethod
    public void saveJpeg(PluginCall call) {
        String name = call.getString("name", "spektrafilm.jpg");
        if (name == null || name.trim().isEmpty()) name = "spektrafilm.jpg";
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        String mime = call.getString("mime");
        String lower = name.toLowerCase();
        boolean png = (mime != null && mime.toLowerCase().contains("png"))
                || lower.endsWith(".png");
        if (png) {
            if (!lower.endsWith(".png")) name = name + ".png";
            mime = "image/png";
        } else {
            if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) name = name + ".jpg";
            mime = "image/jpeg";
        }
        String data = call.getString("data");
        byte[] bytes = null;
        if (data != null && !data.isEmpty()) {
            try {
                bytes = Base64.decode(data, Base64.DEFAULT);
            } catch (Exception ignored) {
            }
        }
        if (bytes == null || bytes.length < 32) {
            synchronized (lock) {
                bytes = lastJpeg;
                if (mime == null) mime = lastMime;
            }
        }
        if (bytes == null || bytes.length < 32) {
            call.reject("empty");
            return;
        }
        final String fileName = name;
        final String fileMime = mime;
        final byte[] payload = bytes;
        new Thread(() -> {
            try {
                android.net.Uri uri = writeToPictures(fileName, fileMime, payload);
                try {
                    ExportGallery.record(getContext(), fileName, uri, 0, 0, null);
                } catch (Throwable ignored) {
                }
                JSObject out = new JSObject();
                out.put("ok", true);
                if (uri != null) out.put("uri", uri.toString());
                call.resolve(out);
            } catch (Throwable e) {
                Log.e(TAG, "save failed", e);
                call.reject(e.getMessage() == null ? "save" : e.getMessage());
            }
        }, "spektra-save").start();
    }

    @PluginMethod
    public void libraryAccess(PluginCall call) {
        if (PhoneLibrary.hasAccess(getContext())) {
            JSObject out = new JSObject();
            out.put("granted", true);
            out.put("limited", PhoneLibrary.isLimited(getContext()));
            call.resolve(out);
            return;
        }
        String alias = Build.VERSION.SDK_INT >= 33 ? "images" : "storage";
        requestPermissionForAlias(alias, call, "onLibraryAccess");
    }

    @PermissionCallback
    private void onLibraryAccess(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", PhoneLibrary.hasAccess(getContext()));
        out.put("limited", PhoneLibrary.isLimited(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void listPhone(PluginCall call) {
        final int offset = Math.max(0, call.getInt("offset", 0));
        int asked = call.getInt("limit", 48);
        if (asked < 1) asked = 1;
        if (asked > 60) asked = 60;
        final int limit = asked;
        libraryWork.execute(() -> {
            try {
                JSObject out = new JSObject();
                boolean granted = PhoneLibrary.hasAccess(getContext());
                out.put("granted", granted);
                out.put("limited", PhoneLibrary.isLimited(getContext()));
                if (!granted) {
                    out.put("items", new org.json.JSONArray());
                    out.put("more", false);
                    call.resolve(out);
                    return;
                }
                org.json.JSONArray items = PhoneLibrary.list(getContext(), offset, limit + 1);
                boolean more = items.length() > limit;
                if (more) items.remove(limit);
                out.put("items", items);
                out.put("more", more);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "library" : t.getMessage());
            }
        });
    }

    @PluginMethod
    public void wbBase(PluginCall call) {
        final int edge = call.getInt("maxEdge", 0);
        work.execute(() -> {
            synchronized (lock) {
                try {
                    if (linearData == null) {
                        call.reject("no image");
                        return;
                    }
                    if (cachedIsRaw) {
                        int cap = edge > 0 ? edge : Math.max(heldPreviewEdge, Math.max(linearWidth, linearHeight));
                        ensureWbBase(true, cap);
                    }
                    byte[] jpeg = linearToJpeg();
                    JSObject out = new JSObject();
                    putJpegRef(out, "path", "jpeg", jpeg, "spk-wb-base.jpg");
                    out.put("base", linearWbBase);
                    out.put("width", linearWidth);
                    out.put("height", linearHeight);
                    call.resolve(out);
                } catch (Throwable t) {
                    call.reject(t.getMessage() == null ? "wb" : t.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void openLibrary(PluginCall call) {
        final String uriText = call.getString("uri", "");
        if (uriText == null || uriText.isEmpty()) {
            call.reject("uri");
            return;
        }
        final int maxEdge = call.getInt("maxEdge", 2048);
        final JSONObject paramsJson = call.getObject("params");
        final int epoch = openEpoch.incrementAndGet();
        cancelled.set(false);
        work.execute(() -> {
            if (epoch != openEpoch.get()) {
                call.reject("cancelled");
                return;
            }
            try {
                simEpoch.incrementAndGet();
                JSObject decoded = decodeUri(Uri.parse(uriText), maxEdge, paramsJson);
                if (epoch != openEpoch.get()) {
                    call.reject("cancelled");
                    return;
                }
                call.resolve(decoded);
            } catch (Throwable e) {
                if (epoch != openEpoch.get()) {
                    call.reject("cancelled");
                    return;
                }
                LabLog.e("decode", "library open failed", e);
                call.reject(friendlyError(e));
            }
        });
    }

    @PluginMethod
    public void listGallery(PluginCall call) {
        work.execute(() -> {
            try {
                JSONArray arr = ExportGallery.listJson(getContext());
                JSObject out = new JSObject();
                out.put("items", arr);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "gallery" : t.getMessage());
            }
        });
    }

    @PluginMethod
    public void loadGallery(PluginCall call) {
        final String uri = call.getString("uri", "");
        final int maxEdge = call.getInt("maxEdge", 960);
        work.execute(() -> {
            try {
                byte[] jpeg = ExportGallery.loadPreview(getContext(), uri, maxEdge);
                if (jpeg == null || jpeg.length < 32) {
                    call.reject("empty");
                    return;
                }
                JSObject out = new JSObject();
                out.put("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
                call.resolve(out);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "gallery" : t.getMessage());
            }
        });
    }

    @PluginMethod
    public void engineInfo(PluginCall call) {
        try {
            SpektraEngine eng = ensureEngine();
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("profiles", String.join(",", eng.listProfiles()));
            out.put("hasImage", linearData != null);
            try {
                out.put("gpu", SpektraEngine.gpuDiagnostics());
            } catch (Throwable ignored) {
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "engine" : e.getMessage());
        }
    }

    @PluginMethod
    public void getLog(PluginCall call) {
        try {
            JSObject out = new JSObject();
            out.put("text", LabLog.readAll(getContext()));
            call.resolve(out);
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "log" : t.getMessage());
        }
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        try {
            LabLog.clear(getContext());
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "log" : t.getMessage());
        }
    }

    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "tick");
        int code = HapticFeedbackConstants.CLOCK_TICK;
        if ("edge".equals(kind)) code = HapticFeedbackConstants.VIRTUAL_KEY;
        else if ("select".equals(kind) || "menu".equals(kind)) code = HapticFeedbackConstants.CONTEXT_CLICK;
        try {
            View v = getBridge() != null ? getBridge().getWebView() : null;
            if (v == null && getActivity() != null) {
                v = getActivity().getWindow().getDecorView();
            }
            if (v != null) {
                v.performHapticFeedback(code, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING);
            }
        } catch (Throwable ignored) {
            /* web vibrate is the fallback */
        }
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("https://t.me/") || url.startsWith("https://telegram.me/"))) {
            call.reject("url");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "open" : t.getMessage());
        }
    }

    @PluginMethod
    public void keepStockSource(PluginCall call) {
        final String id = call.getString("id");
        work.execute(() -> {
            try {
                File src;
                boolean raw;
                String name;
                int w;
                int h;
                synchronized (lock) {
                    if (cachedSourceFile == null || !cachedSourceFile.exists()) {
                        call.reject("Open a RAW or photo first");
                        return;
                    }
                    src = cachedSourceFile;
                    raw = cachedIsRaw;
                    name = currentName;
                    w = linearWidth;
                    h = linearHeight;
                }
                File dest = stockFile(id);
                copyFile(src, dest);
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("raw", raw);
                out.put("name", name == null ? "frame" : name);
                out.put("width", w);
                out.put("height", h);
                out.put("size", dest.length());
                LabLog.i("stock", "keep " + dest.getName() + " " + dest.length() + "b raw=" + raw);
                call.resolve(out);
            } catch (Throwable e) {
                LabLog.e("stock", "keep failed", e);
                call.reject(e.getMessage() == null ? "stock" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void dropStockSource(PluginCall call) {
        final String id = call.getString("id");
        work.execute(() -> {
            try {
                File f = stockFile(id == null ? "" : id);
                if (f.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
                File part = new File(f.getAbsolutePath() + ".part");
                if (part.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    part.delete();
                }
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
            } catch (Throwable e) {
                call.reject(e.getMessage() == null ? "stock" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void exportStock(PluginCall call) {
        final String id = call.getString("id");
        final JSONObject paramsJson = call.getObject("params");
        final boolean raw = Boolean.TRUE.equals(call.getBoolean("raw", false));
        cancelled.set(false);
        work.execute(() -> {
            try {
                File src = stockFile(id == null ? "" : id);
                if (!src.exists()) {
                    call.reject("stock missing");
                    return;
                }
                exporting.set(true);
                try {
                    call.resolve(startExportFromFile(paramsJson, src, raw, false));
                } catch (Throwable t) {
                    exporting.set(false);
                    throw t;
                }
            } catch (Throwable e) {
                String why = friendlyError(e);
                if (!"cancelled".equals(why)) {
                    LabLog.e("export", "stock export failed", e);
                }
                call.reject(why);
            }
        });
    }

    @PluginMethod
    public void loadStockSource(PluginCall call) {
        final String id = call.getString("id");
        final String name = call.getString("name", "frame");
        final int maxEdge = call.getInt("maxEdge", 2560);
        final JSONObject paramsJson = call.getObject("params");
        cancelled.set(false);
        work.execute(() -> {
            try {
                simEpoch.incrementAndGet();
                call.resolve(openStockFile(id, name, maxEdge, paramsJson));
            } catch (Throwable e) {
                LabLog.e("decode", "stock load failed", e);
                call.reject(friendlyError(e));
            }
        });
    }

    private JSObject decodeUri(Uri uri, int maxEdge, JSONObject paramsJson) throws Exception {
        String name = queryName(uri);
        File tmp = copyToCache(uri, name);
        File previous = cachedSourceFile;
        cachedSourceFile = null;
        cachedIsRaw = false;
        try {
            boolean raw = RawDecoder.INSTANCE.isRawFileName(name);
            boolean daylight = raw && WhiteBalance.needed(paramsJson);
            if (raw) {
                int cap = Math.max(256, Math.min(4096, maxEdge));
                LinearResult decoded = decodePreviewRaw(tmp, daylight, cap);
                adoptLinear(decoded.getData(), decoded.getWidth(), decoded.getHeight(),
                        decoded.getColorSpace(), false, true, name);
                cachedIsRaw = true;
                linearWbBase = daylight ? "daylight" : "as_shot";
            } else {
                LinearImage img = decodeBitmapFile(tmp, Math.max(256, Math.min(4096, maxEdge)), true);
                if (img == null) throw new Exception("Could not open that JPEG or photo");
                adoptLinear(Images.bytes(img), img.getWidth(), img.getHeight(), img.getColorSpace(), false, false, name);
                cachedIsRaw = false;
                linearWbBase = "jpeg";
            }
            cachedSourceFile = tmp;
            tmp = null;
            byte[] sourceJpeg = linearToJpeg();
            byte[] processed = null;
            long ms = 0;
            if (paramsJson != null) {
                try {
                    long t0 = System.nanoTime();
                    processed = simulateLocked(paramsJson, true, false);
                    ms = (System.nanoTime() - t0) / 1_000_000L;
                } catch (Throwable simFail) {
                    Log.w(TAG, "pick preview sim failed, returning source", simFail);
                    processed = null;
                }
            }
            JSObject out = new JSObject();
            out.put("name", name);
            out.put("width", linearWidth);
            out.put("height", linearHeight);
            out.put("colorSpace", linearColorSpace);
            out.put("raw", raw);
            putJpegRef(out, "sourcePath", "sourceJpeg", sourceJpeg, "spk-source.jpg");
            if (processed != null) {
                putJpegRef(out, "processedPath", "processedJpeg", processed, null);
                out.put("ms", ms);
                out.put("mode", "draft");
            }
            out.put("engine", "spektra-android");
            if (cachedSourceFile != null) out.put("path", cachedSourceFile.getAbsolutePath());
            warmExportProcess();
            return out;
        } finally {
            if (tmp != null && tmp.exists() && tmp != cachedSourceFile) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            if (previous != null && previous.exists() && previous != cachedSourceFile) {
                //noinspection ResultOfMethodCallIgnored
                previous.delete();
            }
        }
    }

    /** Start the :export process and load libspektra while the user is still editing. */
    private void warmExportProcess() {
        try {
            Intent w = new Intent(getContext(), ExportService.class);
            w.setAction(ExportService.ACTION_WARM);
            getContext().startService(w);
        } catch (Throwable t) {
            Log.w(TAG, "warm start failed", t);
        }
    }

    /**
     * Spektrafilm-v0.8.0 runs simulate in the UI process. Chromium in this app
     * already holds ~200–350 MB, so a 24 MP spectral peak (~0.9 GB) plus WebView
     * is LMK-kill territory below ~1.4 GB free. Isolated :export is the same
     * C++ path, just without Chromium on the heap.
     */
    private boolean enoughRamForInProcess() {
        try {
            android.app.ActivityManager am =
                    (android.app.ActivityManager) getContext().getSystemService(
                            android.content.Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            return !mi.lowMemory && mi.availMem > 1400L * 1024L * 1024L;
        } catch (Throwable t) {
            return false;
        }
    }

    private void closeUiEngine() {
        synchronized (lock) {
            if (engine != null) {
                try {
                    engine.close();
                } catch (Throwable ignored) {
                }
                engine = null;
            }
        }
        System.gc();
    }

    private JSObject runSimulate(JSONObject paramsJson, boolean preview, boolean exp, boolean returnJpeg)
            throws Exception {
        long t0 = System.nanoTime();
        String[] mode = new String[1];
        byte[] jpeg = simulateLocked(paramsJson, preview, exp, mode);
        JSObject out = new JSObject();
        if (returnJpeg) {
            String path = writePreviewJpeg(jpeg);
            if (path != null) {
                out.put("path", path);
                out.put("jpeg", "");
            } else {
                out.put("jpeg", Base64.encodeToString(jpeg, Base64.NO_WRAP));
            }
        } else {
            out.put("jpeg", "");
        }
        out.put("width", lastOutWidth > 0 ? lastOutWidth : linearWidth);
        out.put("height", lastOutHeight > 0 ? lastOutHeight : linearHeight);
        out.put("ms", (System.nanoTime() - t0) / 1_000_000L);
        out.put("engine", "spektra-android");
        out.put("mode", mode[0] != null ? mode[0] : (preview ? "draft" : "full"));
        out.put("mime", lastMime);
        return out;
    }

    private JSObject startExportFireForget(JSONObject paramsJson) throws Exception {
        return startExportFromFile(paramsJson, null, false, true);
    }

    /**
     * Isolated {@code :export} process, fire-and-forget. Capacitor must not hold a
     * PluginCall across a 26 MP simulate — Xiaomi kills the WebView. Status is
     * polled via {@link #exportStatus}.
     *
     * {@code releaseUi=false} leaves the current preview engine alone so a stock
     * batch can run while the user keeps grading another frame.
     */
    private JSObject startExportFromFile(
            JSONObject paramsJson, File sourceOverride, boolean rawOverride, boolean releaseUi)
            throws Exception {
        File source;
        boolean raw;
        synchronized (lock) {
            if (sourceOverride != null) {
                source = sourceOverride;
                raw = rawOverride;
            } else {
                if (cachedSourceFile == null || !cachedSourceFile.exists()) {
                    throw new Exception("Open a RAW or photo first");
                }
                source = cachedSourceFile;
                raw = cachedIsRaw;
            }
            if (releaseUi) dropPreviewLinear();
        }
        if (releaseUi) {
            closeUiEngine();
            System.gc();
        }
        String format = paramsJson != null ? paramsJson.optString("exportFormat", "jpeg") : "jpeg";
        int quality = paramsJson != null ? paramsJson.optInt("exportQuality", 98) : 98;
        int orient = paramsJson != null ? paramsJson.optInt("orientation", 0) : 0;
        String name = paramsJson != null ? paramsJson.optString("exportName", "") : "";
        if (name == null || name.isEmpty()) {
            name = (currentName == null ? "frame" : currentName).replaceAll("[^A-Za-z0-9._-]", "_");
            if (format.toLowerCase().contains("png")) {
                if (!name.toLowerCase().endsWith(".png")) name = name + ".png";
            } else if (!name.toLowerCase().endsWith(".jpg") && !name.toLowerCase().endsWith(".jpeg")) {
                name = name + ".jpg";
            }
        }
        if (paramsJson != null) {
            try {
                paramsJson.put("upscaleFactor", 1);
                paramsJson.put("exportMaxEdge", 0);
            } catch (Exception ignored) {
            }
        }
        LabLog.i("export", "fire-forget raw=" + raw
                + " gpuExport=" + (paramsJson == null || paramsJson.optBoolean("gpuExport", true))
                + " format=" + format
                + " " + source.getName()
                + " " + source.length() + "b");
        Intent i = new Intent(getContext(), ExportService.class);
        i.setAction(ExportService.ACTION_EXPORT);
        i.putExtra(ExportService.EXTRA_SOURCE, source.getAbsolutePath());
        i.putExtra(ExportService.EXTRA_RAW, raw);
        i.putExtra(ExportService.EXTRA_PARAMS, paramsJson != null ? paramsJson.toString() : "{}");
        i.putExtra(ExportService.EXTRA_FORMAT, format);
        i.putExtra(ExportService.EXTRA_QUALITY, quality);
        i.putExtra(ExportService.EXTRA_ORIENT, orient);
        i.putExtra(ExportService.EXTRA_NAME, name);

        File oldCache = new File(getContext().getCacheDir(), ExportService.STATUS_FILE);
        //noinspection ResultOfMethodCallIgnored
        oldCache.delete();
        exportStartedAt = System.currentTimeMillis();
        ExportService.writeRunning(getContext());

        final Activity host = getActivity();
        if (host != null) {
            host.runOnUiThread(() -> {
                try {
                    host.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } catch (Throwable ignored) {
                }
            });
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                getContext().startForegroundService(i);
            } else {
                getContext().startService(i);
            }
        } catch (Throwable t) {
            LabLog.w("export", "foreground service failed, plain start " + t.getMessage());
            try {
                getContext().startService(i);
            } catch (Throwable t2) {
                exporting.set(false);
                ExportService.writeStatusFor(getContext(), ExportService.failBundle("export"));
                throw t2;
            }
        }
        JSObject out = new JSObject();
        out.put("jpeg", "");
        out.put("width", 0);
        out.put("height", 0);
        out.put("ms", 0);
        out.put("pending", true);
        out.put("engine", "spektra-android");
        out.put("mode", "full");
        return out;
    }

    @PluginMethod
    public void exportStatus(PluginCall call) {
        File statusFile = ExportService.statusFile(getContext());
        Bundle b = readStatusFile(statusFile);
        JSObject out = new JSObject();
        boolean running = b != null && b.getBoolean("running", false);
        long now = System.currentTimeMillis();
        long beat = b != null ? b.getLong("t", 0) : 0;
        long beatAge = beat > 0 ? now - beat : Long.MAX_VALUE;
        long launchAge = exportStartedAt > 0 ? now - exportStartedAt : Long.MAX_VALUE;
        boolean finished = b != null && !running;

        if (!finished) {
            boolean liveBeat = running && beatAge <= 20_000L;
            boolean inFlight = exporting.get();
            boolean justLaunched = inFlight && launchAge <= 25_000L;
            if (liveBeat || justLaunched) {
                out.put("pending", true);
                out.put("jpeg", "");
                out.put("width", 0);
                out.put("height", 0);
                out.put("ms", 0);
                call.resolve(out);
                return;
            }
            exporting.set(false);
            resumeAfterExport();
            if (inFlight) {
                out.put("pending", false);
                out.put("ok", false);
                out.put("error", "export");
                out.put("jpeg", "");
                out.put("width", 0);
                out.put("height", 0);
                out.put("ms", 0);
                call.resolve(out);
                return;
            }
            out.put("pending", false);
            out.put("idle", true);
            out.put("ok", false);
            out.put("jpeg", "");
            out.put("width", 0);
            out.put("height", 0);
            out.put("ms", 0);
            call.resolve(out);
            return;
        }

        boolean ok = b.getBoolean("ok", false);
        String err = b.getString("error");
        if (!ok) {
            exporting.set(false);
            resumeAfterExport();
            out.put("pending", false);
            out.put("ok", false);
            out.put("error", err == null || err.isEmpty() ? "export" : err);
            out.put("jpeg", "");
            out.put("width", 0);
            out.put("height", 0);
            out.put("ms", 0);
            call.resolve(out);
            return;
        }
        exporting.set(false);
        resumeAfterExport();
        lastOutWidth = b.getInt("width", 0);
        lastOutHeight = b.getInt("height", 0);
        out.put("pending", false);
        out.put("ok", true);
        out.put("saved", true);
        out.put("jpeg", "");
        out.put("width", lastOutWidth);
        out.put("height", lastOutHeight);
        out.put("ms", b.getInt("ms", 0));
        out.put("t", b.getLong("t", 0));
        out.put("engine", "spektra-android");
        out.put("mode", "full");
        String uri = b.getString("uri");
        if (uri != null) out.put("uri", uri);
        synchronized (lock) {
            if (linearData == null) restorePreviewLinear();
        }
        call.resolve(out);
    }

    private void resumeAfterExport() {
        final Activity host = getActivity();
        if (host == null) return;
        host.runOnUiThread(() -> {
            try {
                host.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Throwable ignored) {
            }
        });
    }

    private JSObject runExportIsolated(JSONObject paramsJson) throws Exception {
        return startExportFireForget(paramsJson);
    }

    private Bundle awaitExport(File statusFile, Intent job) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(20);
        while (System.nanoTime() < deadline) {
            Bundle fromFile = readStatusFile(statusFile);
            if (fromFile != null && !fromFile.getBoolean("running", false)) return fromFile;
            try {
                Thread.sleep(400);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        Bundle late = readStatusFile(statusFile);
        if (late != null && !late.getBoolean("running", false)) return late;
        throw new Exception("Экспорт занял слишком много времени");
    }

    private JSObject jsFromExport(Bundle b, String format) throws Exception {
        if (b == null) throw new Exception("export");
        if (!b.getBoolean("ok", false)) {
            String err = b.getString("error", "export");
            throw new Exception(err == null || err.isEmpty() ? "export" : err);
        }
        lastOutWidth = b.getInt("width", 0);
        lastOutHeight = b.getInt("height", 0);
        lastMime = format.toLowerCase().contains("png") ? "image/png" : "image/jpeg";
        JSObject out = new JSObject();
        out.put("jpeg", "");
        out.put("width", lastOutWidth);
        out.put("height", lastOutHeight);
        out.put("ms", b.getInt("ms", 0));
        out.put("engine", "spektra-android");
        out.put("mode", "full");
        out.put("mime", lastMime);
        out.put("saved", true);
        String uri = b.getString("uri");
        if (uri != null) out.put("uri", uri);
        return out;
    }

    private static Bundle readStatusFile(File f) {
        if (f == null || !f.exists() || f.length() < 8) return null;
        try {
            byte[] bytes = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int off = 0;
                while (off < bytes.length) {
                    int n = in.read(bytes, off, bytes.length - off);
                    if (n < 0) break;
                    off += n;
                }
            }
            JSONObject j = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            Bundle b = new Bundle();
            if (j.optBoolean("running", false)) {
                b.putBoolean("running", true);
                b.putBoolean("ok", false);
                b.putLong("t", j.optLong("t", 0));
                return b;
            }
            b.putBoolean("ok", j.optBoolean("ok", false));
            if (j.has("error") && !j.isNull("error")) b.putString("error", j.optString("error"));
            b.putInt("width", j.optInt("width", 0));
            b.putInt("height", j.optInt("height", 0));
            b.putInt("ms", j.optInt("ms", 0));
            b.putLong("t", j.optLong("t", 0));
            if (j.has("uri") && !j.isNull("uri")) b.putString("uri", j.optString("uri"));
            return b;
        } catch (Exception e) {
            return null;
        }
    }


    private byte[] simulateLocked(JSONObject paramsJson, boolean preview, boolean exp) throws Exception {
        return simulateLocked(paramsJson, preview, exp, new String[1]);
    }

    private byte[] simulateLocked(JSONObject paramsJson, boolean preview, boolean exp, String[] modeOut)
            throws Exception {
        synchronized (lock) {
            if (!exp && linearData == null) throw new Exception("Open a RAW or photo first");
            if (exp && (cachedSourceFile == null || !cachedSourceFile.exists()) && linearData == null) {
                throw new Exception("Open a RAW or photo first");
            }
            SpektraEngine eng = ensureEngine();
            boolean skipGrain = preview && !exp;
            String format = "jpeg";
            int userPreview = 960;
            if (paramsJson != null) {
                userPreview = paramsJson.optInt("previewMaxSize", 960);
                if (userPreview < 256) userPreview = 256;
                if (userPreview > 4096) userPreview = 4096;
            }
            // Draft is the scrub frame. Settle is one pass at the preview size.
            int previewTarget = userPreview;
            int simEdge = preview ? Math.min(512, userPreview) : userPreview;
            int quality = preview ? 75 : 80;
            LinearImage image;
            ByteBuffer exportBuf = null;
            LinearImage exportImage = null;
            LinearImage previewWork = null;
            boolean droppedPreview = false;
            if (exp) {
                if (paramsJson != null) {
                    format = paramsJson.optString("exportFormat", "jpeg");
                    quality = paramsJson.optInt("exportQuality", 98);
                    if (quality < 70) quality = 70;
                    if (quality > 100) quality = 100;
                    try {
                        paramsJson.put("upscaleFactor", 1);
                        paramsJson.put("exportMaxEdge", 0);
                    } catch (Exception ignored) {
                    }
                }
                dropPreviewLinear();
                droppedPreview = true;
                System.gc();
                LinearImage full;
                try {
                    full = tryDecodeCached(0, false, WhiteBalance.needed(paramsJson));
                } catch (Throwable t) {
                    Log.w(TAG, "full decode OOM, gc retry", t);
                    System.gc();
                    try {
                        Thread.sleep(50);
                    } catch (InterruptedException ignored) {
                    }
                    try {
                        full = tryDecodeCached(0, false, WhiteBalance.needed(paramsJson));
                    } catch (Throwable t2) {
                        restorePreviewLinear();
                        throw new Exception("Не хватило памяти для оригинального размера");
                    }
                }
                if (full == null) {
                    restorePreviewLinear();
                    throw new Exception("Не удалось декодировать оригинал");
                }
                image = full;
                exportImage = full;
                exportBuf = Images.bytes(full);
                WhiteBalance.applyInPlace(image, paramsJson);
                RawEngine.applyInPlace(image, paramsJson);
            } else {
                ensureWbBase(WhiteBalance.needed(paramsJson), previewTarget);
                ensurePreviewSource(previewTarget);
                heldPreviewEdge = previewTarget;
                LinearImage base = previewBaseFor(previewTarget);
                int baseLong = Math.max(base.getWidth(), base.getHeight());
                LinearImage work = (simEdge > 0 && simEdge < baseLong)
                        ? ImageConvert.limitLongEdge(base, simEdge)
                        : copyLinear(base);
                previewWork = work;
                image = work;
                if (WhiteBalance.needed(paramsJson)) {
                    WhiteBalance.applyInPlace(image, paramsJson);
                }
                if (RawEngine.needed(paramsJson)) {
                    RawEngine.applyInPlace(image, paramsJson);
                }
            }
            String inCs = image.getColorSpace() != null ? image.getColorSpace() : linearColorSpace;
            int paramSize = exp ? 16384 : simEdge;
            final int epoch = simEpoch.get();
            try {
                if (cancelled.get()) throw new Exception("cancelled");
                if (FilmLook.bypass(paramsJson)) {
                    LinearImage work = image;
                    LinearImage cropped = null;
                    try {
                        cropped = ExportWorker.applyCropIfNeeded(image, paramsJson);
                        if (cropped != null && cropped != image) work = cropped;
                        if (paramsJson == null || paramsJson.optBoolean("autoExposure", true)) {
                            ImageConvert.applyMidGrayGain(work);
                        }
                        double ev = paramsJson != null
                                ? paramsJson.optDouble("exposureCompensationEv", 0)
                                : 0;
                        if (Double.isFinite(ev) && ev != 0.0) {
                            ImageConvert.applyGainInPlace(work, (float) Math.pow(2.0, ev));
                        }
                        ImageConvert.applyDigitalTone(work, paramsJson);
                        int orient = paramsJson != null ? paramsJson.optInt("orientation", 0) : 0;
                        byte[] encoded = ImageConvert.linearToDisplayEncoded(
                                work, format, quality, orient);
                        lastOutWidth = work.getWidth();
                        lastOutHeight = work.getHeight();
                        if (orient == 90 || orient == 270) {
                            int t = lastOutWidth;
                            lastOutWidth = lastOutHeight;
                            lastOutHeight = t;
                        }
                        lastJpeg = encoded;
                        lastMime = format != null && format.toLowerCase().contains("png")
                                ? "image/png"
                                : "image/jpeg";
                        if (modeOut != null) {
                            modeOut[0] = preview ? (skipGrain ? "draft" : "full") : "full";
                        }
                        LabLog.i("preview", "plain no-film "
                                + work.getWidth() + "x" + work.getHeight()
                                + " engine=" + (paramsJson != null
                                    ? paramsJson.optString("rawEngine", "spektrafilm")
                                    : "spektrafilm"));
                        return encoded;
                    } finally {
                        if (cropped != null && cropped != image) {
                            try {
                                cropped.close();
                            } catch (Throwable ignored) {
                            }
                        }
                    }
                }
                SpektraParams params = ParamsBuilder.fromJson(
                        paramsJson, inCs, linearNeedsCctf, skipGrain, paramSize, exp);
                SimResult result = null;
                if (exp) {
                    try {
                        result = eng.simulate(image, params);
                    } catch (Throwable t) {
                        Log.e(TAG, "export simulate failed", t);
                        throw new Exception(friendlyError(t));
                    } finally {
                        releaseExportImage(exportImage, exportBuf);
                        exportImage = null;
                        exportBuf = null;
                        System.gc();
                    }
                    if (modeOut != null) modeOut[0] = "full";
                } else {
                    result = eng.simulatePreview(image, params);
                    if (modeOut != null) modeOut[0] = skipGrain ? "draft" : "full";
                }
                if (result == null) {
                    throw new Exception("engine returned no image");
                }
                if (cancelled.get() || epoch != simEpoch.get()) {
                    result.close();
                    throw new Exception("cancelled");
                }
                lastOutWidth = result.getWidth();
                lastOutHeight = result.getHeight();
                int orient = paramsJson != null ? paramsJson.optInt("orientation", 0) : 0;
                if (orient == 90 || orient == 270) {
                    int t = lastOutWidth;
                    lastOutWidth = lastOutHeight;
                    lastOutHeight = t;
                }
                byte[] encoded = ImageConvert.simResultToEncoded(result, format, quality, orient);
                lastJpeg = encoded;
                lastMime = format != null && format.toLowerCase().contains("png")
                        ? "image/png"
                        : "image/jpeg";
                return encoded;
            } catch (Throwable t) {
                if (t instanceof Exception && "cancelled".equals(t.getMessage())) {
                    throw (Exception) t;
                }
                throw new Exception(friendlyError(t));
            } finally {
                if (previewWork != null) {
                    try {
                        previewWork.close();
                    } catch (Throwable ignored) {
                    }
                }
                releaseExportImage(exportImage, exportBuf);
                if (droppedPreview && linearData == null) {
                    restorePreviewLinear();
                }
            }
        }
    }

    private static boolean previewHalf(int edge) {
        return edge <= 1600;
    }

    /** Preview decode. Small sizes stay half-res. Larger sizes are real pixels, with a half-res fallback. */
    private LinearResult decodePreviewRaw(File file, boolean daylight, int edge) throws Exception {
        int cap = Math.max(256, Math.min(4096, edge));
        boolean half = previewHalf(cap);
        try {
            return decodeRawFile(file, new RawDecoder.Settings(rawWb(daylight), 6504.0, 1.0, half, cap));
        } catch (Throwable t) {
            if (half) {
                if (t instanceof Exception) throw (Exception) t;
                throw new Exception(t.getMessage() == null ? "decode" : t.getMessage());
            }
            Log.w(TAG, "full preview decode failed, using half", t);
            return decodeRawFile(file, new RawDecoder.Settings(rawWb(daylight), 6504.0, 1.0, true, cap));
        }
    }

    private static com.spectrafilm.libraw.WhiteBalance rawWb(boolean daylight) {
        return daylight
                ? com.spectrafilm.libraw.WhiteBalance.DAYLIGHT
                : com.spectrafilm.libraw.WhiteBalance.AS_SHOT;
    }

    /**
     * Camera WB and the temperature slider must not stack.
     * As-shot keeps the camera decode. Any other mode re-reads the file once
     * as LibRaw daylight, and the slider is the only adaptation after that.
     */
    private void ensureWbBase(boolean daylight, int edge) {
        if (!cachedIsRaw || cachedSourceFile == null || !cachedSourceFile.exists()) return;
        String want = daylight ? "daylight" : "as_shot";
        if (want.equals(linearWbBase)) return;
        int cap = Math.max(edge, Math.max(linearWidth, linearHeight));
        if (cap < 256) cap = 256;
        if (cap > 4096) cap = 4096;
        try {
            LinearResult decoded = decodePreviewRaw(cachedSourceFile, daylight, cap);
            adoptLinear(
                    decoded.getData(),
                    decoded.getWidth(),
                    decoded.getHeight(),
                    decoded.getColorSpace(),
                    false,
                    true,
                    currentName);
            linearWbBase = want;
            Log.i(TAG, "wb base " + want + " " + linearWidth + "x" + linearHeight);
        } catch (Throwable t) {
            Log.w(TAG, "wb base re-decode failed", t);
        }
    }

    private LinearImage tryDecodeCached(int maxEdge) {
        return tryDecodeCached(maxEdge, false, "daylight".equals(linearWbBase));
    }

    private LinearImage tryDecodeCached(int maxEdge, boolean proxy) {
        return tryDecodeCached(maxEdge, proxy, "daylight".equals(linearWbBase));
    }

    private LinearImage tryDecodeCached(int maxEdge, boolean proxy, boolean daylight) {
        if (cachedSourceFile == null || !cachedSourceFile.exists()) return null;
        try {
            LinearImage img;
            if (cachedIsRaw) {
                int nativeCap = proxy && maxEdge > 0 ? maxEdge : 0;
                RawDecoder.Settings settings = new RawDecoder.Settings(
                        rawWb(daylight),
                        6504.0,
                        1.0,
                        false,
                        nativeCap);
                LinearResult decoded;
                try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(
                        cachedSourceFile, ParcelFileDescriptor.MODE_READ_ONLY)) {
                    decoded = RawDecoder.INSTANCE.decodeToLinear(pfd.getFd(), settings);
                } catch (Throwable fdFail) {
                    Log.w(TAG, "fd decode failed, bytes", fdFail);
                    byte[] bytes = readAll(cachedSourceFile);
                    decoded = RawDecoder.INSTANCE.decodeToLinear(bytes, settings);
                }
                img = Images.wrap(
                        decoded.getData(), decoded.getWidth(), decoded.getHeight(), decoded.getColorSpace());
                Log.i(TAG, "export re-decode RAW " + img.getWidth() + "x" + img.getHeight()
                        + (proxy ? " proxy" : " full"));
            } else {
                img = decodeBitmapFile(cachedSourceFile, proxy ? Math.max(maxEdge, 1) : 0, true);
                if (img != null) {
                    Log.i(TAG, "export re-decode JPEG " + img.getWidth() + "x" + img.getHeight());
                }
            }
            if (img == null) return null;
            if (!proxy && maxEdge > 0) {
                LinearImage scaled = ImageConvert.limitLongEdge(img, maxEdge);
                if (scaled != img) {
                    Log.i(TAG, "export scale " + img.getWidth() + "x" + img.getHeight()
                            + " -> " + scaled.getWidth() + "x" + scaled.getHeight());
                    if (cachedIsRaw) {
                        try {
                            RawDecoder.INSTANCE.freeOffHeap(Images.bytes(img));
                        } catch (Throwable ignored) {
                        }
                    }
                    img = scaled;
                }
            }
            return img;
        } catch (Throwable e) {
            Log.w(TAG, "export re-decode failed", e);
            if (e instanceof Error) throw (Error) e;
            return null;
        }
    }

    private void releaseExportImage(LinearImage img, ByteBuffer buf) {
        if (img != null && !cachedIsRaw) {
            try {
                img.close();
            } catch (Throwable ignored) {
            }
            return;
        }
        ByteBuffer data = buf;
        if (data == null && img != null) data = Images.bytes(img);
        if (data != null && cachedIsRaw) {
            try {
                RawDecoder.INSTANCE.freeOffHeap(data);
            } catch (Throwable ignored) {
            }
        }
    }

    private static String friendlyError(Throwable t) {
        if (t == null) return "Ошибка экспорта";
        if (t instanceof OutOfMemoryError) return "Не хватило памяти для оригинального размера";
        String msg = t.getMessage();
        if (msg == null || msg.isEmpty()) {
            Throwable c = t.getCause();
            msg = c != null ? c.getMessage() : null;
        }
        if (msg == null || msg.isEmpty()) return "Ошибка экспорта";
        String lower = msg.toLowerCase();
        if (lower.contains("memory") || lower.contains("allocat") || lower.contains("oom")
                || msg.contains("памяти")) {
            return "Не хватило памяти для оригинального размера";
        }
        if ("cancelled".equals(msg) || lower.contains("cancel")) return "cancelled";
        return msg;
    }

    private void closePreviewBase() {
        if (previewBase != null) {
            try {
                previewBase.close();
            } catch (Throwable ignored) {
            }
            previewBase = null;
            previewBaseEdge = 0;
        }
    }

    private LinearImage ownedCopy(LinearImage src) {
        ByteBuffer s = Images.bytes(src).duplicate();
        s.order(ByteOrder.nativeOrder());
        s.rewind();
        int n = s.remaining();
        ByteBuffer buf = ByteBuffer.allocateDirect(n);
        buf.order(ByteOrder.nativeOrder());
        buf.put(s);
        buf.flip();
        return Images.wrap(buf, src.getWidth(), src.getHeight(), src.getColorSpace());
    }

    /** Re-decode the open file when the chosen preview is larger than what we hold. */
    private void ensurePreviewSource(int edge) {
        int want = Math.max(256, Math.min(4096, edge));
        int have = Math.max(linearWidth, linearHeight);
        if (have >= want - 16) return;
        if (cachedSourceFile == null || !cachedSourceFile.exists()) return;
        try {
            if (cachedIsRaw) {
                LinearResult decoded = decodePreviewRaw(cachedSourceFile, "daylight".equals(linearWbBase), want);
                int got = Math.max(decoded.getWidth(), decoded.getHeight());
                if (got <= have) {
                    try {
                        RawDecoder.INSTANCE.freeOffHeap(decoded.getData());
                    } catch (Throwable ignored) {
                    }
                    return;
                }
                adoptLinear(
                        decoded.getData(),
                        decoded.getWidth(),
                        decoded.getHeight(),
                        decoded.getColorSpace(),
                        false,
                        true,
                        currentName);
            } else {
                LinearImage img = decodeBitmapFile(cachedSourceFile, want, true);
                if (img == null) return;
                int got = Math.max(img.getWidth(), img.getHeight());
                if (got <= have) return;
                adoptLinear(
                        Images.bytes(img),
                        img.getWidth(),
                        img.getHeight(),
                        img.getColorSpace(),
                        false,
                        false,
                        currentName);
            }
            Log.i(TAG, "preview source " + linearWidth + "x" + linearHeight + " for " + want);
        } catch (Throwable t) {
            Log.w(TAG, "preview re-decode failed", t);
        }
    }

    private LinearImage copyLinear(LinearImage src) {
        ByteBuffer s = Images.bytes(src).duplicate();
        s.order(ByteOrder.nativeOrder());
        s.rewind();
        int n = s.remaining();
        if (previewCopyBuf == null || previewCopyBuf.capacity() < n) {
            previewCopyBuf = ByteBuffer.allocateDirect(n);
            previewCopyBuf.order(ByteOrder.nativeOrder());
        }
        ByteBuffer copy = previewCopyBuf.duplicate();
        copy.order(ByteOrder.nativeOrder());
        copy.clear();
        copy.limit(n);
        copy.put(s);
        copy.flip();
        ByteBuffer view = copy.slice();
        view.order(ByteOrder.nativeOrder());
        return Images.wrap(view, src.getWidth(), src.getHeight(), src.getColorSpace());
    }

    private LinearImage previewBaseFor(int edge) {
        if (previewBase != null && previewBaseEdge == edge && previewBase.getWidth() >= 8) {
            return previewBase;
        }
        closePreviewBase();
        ByteBuffer src = linearData.duplicate();
        src.order(ByteOrder.nativeOrder());
        src.rewind();
        LinearImage image = Images.wrap(src, linearWidth, linearHeight, linearColorSpace);
        LinearImage scaled = ImageConvert.limitLongEdge(image, edge);
        if (scaled == image) {
            // Own buffer. copyLinear reuses previewCopyBuf, and the working
            // copy writes that same buffer — white balance would stack.
            previewBase = ownedCopy(image);
        } else {
            previewBase = scaled;
        }
        previewBaseEdge = edge;
        return previewBase;
    }

    private void dropPreviewLinear() {
        closePreviewBase();
        ByteBuffer prev = linearData;
        boolean off = linearOffHeap;
        linearData = null;
        if (prev != null && off) {
            try {
                RawDecoder.INSTANCE.freeOffHeap(prev);
            } catch (Throwable ignored) {
            }
        }
    }

    private void restorePreviewLinear() {
        try {
            LinearImage img = tryDecodeCached(Math.max(256, heldPreviewEdge), true);
            if (img == null) return;
            adoptLinear(
                    Images.bytes(img),
                    img.getWidth(),
                    img.getHeight(),
                    img.getColorSpace(),
                    false,
                    cachedIsRaw,
                    currentName);
        } catch (Throwable t) {
            Log.w(TAG, "restore preview failed", t);
        }
    }

    private SpektraEngine ensureEngine() throws Exception {
        synchronized (lock) {
            if (engine != null) return engine;
            try {
                engine = SpektraEngine.fromAssets(getContext().getAssets());
                SpektraEngine.setBigCores(0);
                UserProfiles.attach(engine, getContext());
                Log.i(TAG, "engine from assets, profiles=" + engine.listProfiles());
                return engine;
            } catch (Throwable t) {
                Log.w(TAG, "fromAssets failed, extracting", t);
            }
            File dir = new File(getContext().getFilesDir(), "spektra");
            extractAssetDir("spektra", dir);
            engine = new SpektraEngine(dir.getAbsolutePath());
            SpektraEngine.setBigCores(0);
            UserProfiles.attach(engine, getContext());
            Log.i(TAG, "engine from files, profiles=" + engine.listProfiles());
            return engine;
        }
    }

    private void extractAssetDir(String prefix, File dest) throws Exception {
        android.content.res.AssetManager am = getContext().getAssets();
        extractRecursive(am, prefix, dest);
    }

    private void extractRecursive(android.content.res.AssetManager am, String path, File dest) throws Exception {
        String[] kids = am.list(path);
        if (kids == null || kids.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = am.open(path); FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String child : kids) {
            extractRecursive(am, path + "/" + child, new File(dest, child));
        }
    }

    private void adoptLinear(ByteBuffer data, int w, int h, String colorSpace, boolean cctf,
            boolean offHeap, String name) throws Exception {
        if (data == null || w < 8 || h < 8) throw new Exception("empty image");
        closePreviewBase();
        ByteBuffer prev = linearData;
        boolean prevOff = linearOffHeap;
        data.order(ByteOrder.nativeOrder());
        data.rewind();
        linearData = data;
        linearWidth = w;
        linearHeight = h;
        linearColorSpace = normalizeColorSpace(colorSpace);
        linearNeedsCctf = cctf;
        linearOffHeap = offHeap;
        currentName = name;
        if (prev != null && prevOff && prev != data) {
            try {
                RawDecoder.INSTANCE.freeOffHeap(prev);
            } catch (Throwable ignored) {
            }
        }
        Log.i(TAG, "linear " + name + " " + w + "x" + h + " cs=" + linearColorSpace);
    }

    private boolean adoptBitmap(File file, int maxEdge, String name) throws Exception {
        LinearImage img = decodeBitmapFile(file, maxEdge, true);
        if (img == null) return false;
        adoptLinear(Images.bytes(img), img.getWidth(), img.getHeight(), img.getColorSpace(), false, false, name);
        return true;
    }

    private LinearImage decodeBitmapFile(File file, int maxEdge, boolean jpegScene) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth < 8 || bounds.outHeight < 8) return null;
        int sample = 1;
        if (maxEdge > 0) {
            int longEdge = Math.max(bounds.outWidth, bounds.outHeight);
            while (longEdge / (sample * 2) >= maxEdge) sample *= 2;
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        opts.inScaled = false;
        opts.inDither = false;
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            opts.inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
        }
        Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
        if (bmp == null) return null;
        bmp = applyExif(bmp, file.getAbsolutePath());
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        if (maxEdge > 0 && Math.max(w, h) > maxEdge) {
            float s = maxEdge / (float) Math.max(w, h);
            int nw = Math.max(1, Math.round(w * s));
            int nh = Math.max(1, Math.round(h * s));
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, nw, nh, true);
            if (scaled != bmp) bmp.recycle();
            bmp = scaled;
        }
        LinearImage img = ImageConvert.bitmapToLinearProPhoto(bmp, false, jpegScene);
        bmp.recycle();
        return img;
    }

    private static Bitmap applyExif(Bitmap bmp, String path) {
        try {
            ExifInterface ex = new ExifInterface(path);
            int o = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            int deg = 0;
            if (o == ExifInterface.ORIENTATION_ROTATE_90) deg = 90;
            else if (o == ExifInterface.ORIENTATION_ROTATE_180) deg = 180;
            else if (o == ExifInterface.ORIENTATION_ROTATE_270) deg = 270;
            if (deg == 0) return bmp;
            Matrix m = new Matrix();
            m.postRotate(deg);
            Bitmap rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (rotated != bmp) bmp.recycle();
            return rotated;
        } catch (Exception e) {
            return bmp;
        }
    }

    private byte[] linearToJpeg() {
        ByteBuffer src = linearData.duplicate();
        src.order(ByteOrder.nativeOrder());
        src.rewind();
        LinearImage img = Images.wrap(src, linearWidth, linearHeight, linearColorSpace);
        return ImageConvert.linearToDisplayJpeg(img, 86);
    }

    private LinearResult decodeRawFile(File file, RawDecoder.Settings settings) throws Exception {
        try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)) {
            return RawDecoder.INSTANCE.decodeToLinear(pfd.getFd(), settings);
        } catch (Throwable fdFail) {
            Log.w(TAG, "fd decode failed, bytes", fdFail);
            byte[] bytes = readAll(file);
            return RawDecoder.INSTANCE.decodeToLinear(bytes, settings);
        }
    }

    private String writeNamedJpeg(String name, byte[] jpeg) {
        if (jpeg == null || jpeg.length < 32) return null;
        try {
            File f = new File(getContext().getCacheDir(), name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(jpeg);
                out.flush();
                try {
                    out.getFD().sync();
                } catch (Throwable ignored) {
                }
            }
            return f.getAbsolutePath();
        } catch (Throwable t) {
            Log.w(TAG, "write jpeg " + name, t);
            return null;
        }
    }

    private String writePreviewJpeg(byte[] jpeg) {
        int slot = previewSlot;
        previewSlot = 1 - previewSlot;
        return writeNamedJpeg("spk-preview-" + slot + ".jpg", jpeg);
    }

    private void putJpegRef(JSObject out, String pathKey, String b64Key, byte[] jpeg, String fixedName) {
        String path = fixedName != null ? writeNamedJpeg(fixedName, jpeg) : writePreviewJpeg(jpeg);
        if (path != null) {
            out.put(pathKey, path);
            return;
        }
        if (jpeg != null && jpeg.length >= 32) {
            out.put(b64Key, Base64.encodeToString(jpeg, Base64.NO_WRAP));
        }
    }

    private static String normalizeColorSpace(String cs) {
        if (cs == null || cs.isEmpty()) return "ProPhoto RGB";
        String t = cs.trim();
        String u = t.toUpperCase();
        if (u.contains("ACES")) return "ACES2065-1";
        if (u.contains("PROPHOTO")) return "ProPhoto RGB";
        if (u.contains("REC2020") || u.contains("BT2020")) return "Rec. 2020";
        if (u.contains("LINEAR") && u.contains("SRGB")) return "Linear sRGB";
        if (u.equals("SRGB") || u.equals("S-RGB")) return "sRGB";
        return t;
    }

    private android.net.Uri writeToPictures(String name, String mime, byte[] bytes) throws Exception {
        if (bytes == null || bytes.length == 0) throw new Exception("Файл экспорта пуст");
        return VerifiedMediaWriter.save(getContext(), name, mime, output -> output.write(bytes));
    }

    private static byte[] readAll(File f) throws Exception {
        byte[] buf = new byte[(int) f.length()];
        try (FileInputStream in = new FileInputStream(f)) {
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
        }
        return buf;
    }

    private File stockDir() {
        File dir = new File(getContext().getFilesDir(), "stock");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private File stockFile(String id) throws Exception {
        String safe = id == null ? "" : id.replaceAll("[^A-Za-z0-9._-]", "");
        if (safe.length() < 2) throw new Exception("stock id");
        return new File(stockDir(), safe);
    }

    private void copyFile(File from, File to) throws Exception {
        if (from == null || !from.exists()) throw new Exception("Open a RAW or photo first");
        File parent = to.getParentFile();
        if (parent != null && !parent.exists()) {
            //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        }
        if (from.getAbsolutePath().equals(to.getAbsolutePath())) return;
        File part = new File(to.getAbsolutePath() + ".part");
        try (FileInputStream in = new FileInputStream(from);
                FileOutputStream out = new FileOutputStream(part)) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (to.exists() && !to.delete()) {
            LabLog.w("stock", "could not replace " + to.getName());
        }
        if (!part.renameTo(to)) {
            try (FileInputStream in = new FileInputStream(part);
                    FileOutputStream out = new FileOutputStream(to)) {
                byte[] buf = new byte[256 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            //noinspection ResultOfMethodCallIgnored
            part.delete();
        }
    }

    private JSObject openStockFile(String id, String name, int maxEdge, JSONObject paramsJson)
            throws Exception {
        File stock = stockFile(id);
        if (!stock.exists()) throw new Exception("stock missing");
        String safeName = name == null || name.isEmpty() ? "frame" : name;
        File tmp = stageSourceCopy(stock, safeName);
        File previous = cachedSourceFile;
        cachedSourceFile = null;
        cachedIsRaw = false;
        try {
            boolean raw = RawDecoder.INSTANCE.isRawFileName(safeName);
            boolean daylight = raw && WhiteBalance.needed(paramsJson);
            JSObject out = adoptSourceFile(tmp, safeName, raw, daylight, maxEdge, paramsJson);
            tmp = null;
            return out;
        } finally {
            if (tmp != null && tmp.exists() && tmp != cachedSourceFile) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            if (previous != null && previous.exists() && previous != cachedSourceFile) {
                //noinspection ResultOfMethodCallIgnored
                previous.delete();
            }
        }
    }

    private File stageSourceCopy(File from, String name) throws Exception {
        String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() < 3) safe = "incoming.raw";
        File dest = new File(getContext().getCacheDir(), "spektra-source-" + safe);
        copyFile(from, dest);
        trimCache(dest);
        return dest;
    }

    private JSObject adoptSourceFile(File tmp, String name, boolean raw, boolean daylight, int maxEdge, JSONObject paramsJson)
            throws Exception {
        if (raw) {
            int cap = Math.max(256, Math.min(4096, maxEdge));
            LinearResult decoded = decodePreviewRaw(tmp, daylight, cap);
            adoptLinear(decoded.getData(), decoded.getWidth(), decoded.getHeight(),
                    decoded.getColorSpace(), false, true, name);
            cachedIsRaw = true;
            linearWbBase = daylight ? "daylight" : "as_shot";
        } else {
            LinearImage img = decodeBitmapFile(tmp, Math.max(256, Math.min(4096, maxEdge)), true);
            if (img == null) throw new Exception("Could not open that JPEG or photo");
            adoptLinear(Images.bytes(img), img.getWidth(), img.getHeight(), img.getColorSpace(), false, false, name);
            cachedIsRaw = false;
            linearWbBase = "jpeg";
        }
        cachedSourceFile = tmp;
        byte[] sourceJpeg = linearToJpeg();
        byte[] processed = null;
        long ms = 0;
        if (paramsJson != null) {
            try {
                long t0 = System.nanoTime();
                processed = simulateLocked(paramsJson, true, false);
                ms = (System.nanoTime() - t0) / 1_000_000L;
            } catch (Throwable simFail) {
                Log.w(TAG, "pick preview sim failed, returning source", simFail);
                processed = null;
            }
        }
        JSObject out = new JSObject();
        out.put("name", name);
        out.put("width", linearWidth);
        out.put("height", linearHeight);
        out.put("colorSpace", linearColorSpace);
        out.put("raw", raw);
        putJpegRef(out, "sourcePath", "sourceJpeg", sourceJpeg, "spk-source.jpg");
        if (processed != null) {
            putJpegRef(out, "processedPath", "processedJpeg", processed, null);
            out.put("ms", ms);
            out.put("mode", "draft");
        }
        out.put("engine", "spektra-android");
        if (cachedSourceFile != null) out.put("path", cachedSourceFile.getAbsolutePath());
        warmExportProcess();
        return out;
    }

    private File copyToCache(Uri uri, String name) throws Exception {
        String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() < 3) safe = "incoming.raw";
        File dir = getContext().getCacheDir();
        File tmp = new File(dir, "spektra-source-" + safe);
        File part = new File(dir, "spektra-source.part");
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                FileOutputStream out = new FileOutputStream(part)) {
            if (in == null) throw new Exception("Could not read file");
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (tmp.exists() && !tmp.equals(part) && !tmp.delete()) {
            LabLog.w("cache", "could not replace " + tmp.getName());
        }
        if (!part.renameTo(tmp)) {
            try (FileInputStream in = new FileInputStream(part);
                    FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[256 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            //noinspection ResultOfMethodCallIgnored
            part.delete();
        }
        trimCache(tmp);
        return tmp;
    }

    /** Keep at most the current RAW/JPEG in cacheDir. Old spektra-* copies were the 400 MB. */
    private long trimCache(File keep) {
        long freed = 0;
        File dir = getContext().getCacheDir();
        File[] files = dir != null ? dir.listFiles() : null;
        if (files != null) {
            for (File f : files) {
                if (f == null || !f.isFile()) continue;
                String n = f.getName();
                if (!n.startsWith("spektra-")) continue;
                if (n.equals(ExportService.STATUS_FILE)) continue;
                if (keep != null && f.getAbsolutePath().equals(keep.getAbsolutePath())) continue;
                long sz = f.length();
                if (f.delete()) freed += sz;
            }
        }
        if (freed > 0) {
            LabLog.i("cache", "freed " + (freed / (1024 * 1024)) + "MB keep="
                    + (keep == null ? "-" : keep.getName()));
        }
        return freed;
    }

    private String queryName(Uri uri) {
        String name = "capture.raw";
        try (Cursor c = getContext()
                .getContentResolver()
                .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String v = c.getString(0);
                if (v != null && !v.isEmpty()) name = v;
            }
        } catch (Exception ignored) {
        }
        return name;
    }
}
