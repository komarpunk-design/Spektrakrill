package app.spektrafilm.lab;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.ResultReceiver;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Isolated {@code :export} process. This class must NOT reference the native engine —
 * ART would load libspektra.so during verification, before {@link #onCreate} can call
 * {@link #startForeground}. Spektrafilm-android has no WebView, so a 24 MP simulate
 * fits; our UI process cannot share a heap with Chromium. The actual pipeline lives
 * in {@code ExportWorker} and is loaded by name after we are a foreground service.
 *
 * The process is kept alive after a save (engine stays warm) so the next export is
 * the Spektrafilm in-process cost: decode + simulate, no library reload.
 */
public class ExportService extends Service {
    public static final String ACTION_EXPORT = "app.spektrafilm.lab.EXPORT";
    public static final String ACTION_CANCEL = "app.spektrafilm.lab.EXPORT_CANCEL";
    public static final String ACTION_WARM = "app.spektrafilm.lab.EXPORT_WARM";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_RAW = "raw";
    public static final String EXTRA_PARAMS = "params";
    public static final String EXTRA_FORMAT = "format";
    public static final String EXTRA_QUALITY = "quality";
    public static final String EXTRA_ORIENT = "orient";
    public static final String EXTRA_NAME = "name";
    public static final String EXTRA_RECEIVER = "receiver";
    public static final String STATUS_FILE = "spektra-export-status.json";

    static final String TAG = "SpektraExport";
    static final AtomicBoolean cancelled = new AtomicBoolean(false);

    private static final String CHANNEL = "spektra-export";
    private static final int NOTIF = 42;

    private final ExecutorService exec = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "spektra-export");
        t.setPriority(Thread.NORM_PRIORITY + 1);
        return t;
    });

    private Thread heartbeat;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            Log.e(TAG, "uncaught in " + t, e);
            LabLog.e("crash", "uncaught in " + t, e);
            stopHeartbeat();
            writeStatus(false, messageOf(e), 0, 0, 0, null);
        });
        LabLog.init(this);
        startFg("Готовлю проявочную…");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CANCEL.equals(intent.getAction())) {
            cancelled.set(true);
            stopHeartbeat();
            writeStatus(false, "cancelled", 0, 0, 0, null);
            exec.execute(() -> {
                invokeWorker("shutdown");
                try {
                    stopForeground(true);
                } catch (Throwable ignored) {
                }
                stopSelf();
            });
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_WARM.equals(intent.getAction())) {
            exec.execute(() -> {
                try {
                    Class<?> cls = Class.forName("app.spektrafilm.lab.ExportWorker");
                    Method warm = cls.getMethod("warm", android.content.Context.class);
                    warm.invoke(null, getApplicationContext());
                } catch (Throwable t) {
                    Log.w(TAG, "warm failed", t);
                } finally {
                    try {
                        stopForeground(true);
                    } catch (Throwable ignored) {
                    }
                }
            });
            return START_STICKY;
        }
        cancelled.set(false);
        writeRunning(this);
        startHeartbeat();
        startFg("Проявляю полный кадр…");
        final Intent job = intent;
        exec.execute(() -> {
            PowerManager.WakeLock wake = null;
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) {
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "spektra:export");
                    wake.setReferenceCounted(false);
                    wake.acquire(20L * 60L * 1000L);
                }
            } catch (Throwable ignored) {
            }
            ResultReceiver rr = null;
            if (job != null) {
                if (Build.VERSION.SDK_INT >= 33) {
                    rr = job.getParcelableExtra(EXTRA_RECEIVER, ResultReceiver.class);
                } else {
                    rr = job.getParcelableExtra(EXTRA_RECEIVER);
                }
            }
            try {
                Class<?> cls = Class.forName("app.spektrafilm.lab.ExportWorker");
                Method run = cls.getMethod("run", android.content.Context.class, Intent.class);
                Bundle out = (Bundle) run.invoke(null, getApplicationContext(), job);
                if (out == null) {
                    out = failBundle("export");
                }
                stopHeartbeat();
                writeStatusBundle(out);
                notifyFinished(out);
                if (rr != null) rr.send(1, out);
            } catch (Throwable t) {
                Log.e(TAG, "export process failed", t);
                LabLog.e("export", "service failed", t);
                Throwable cause = t.getCause() != null ? t.getCause() : t;
                Bundle b = failBundle(messageOf(cause));
                stopHeartbeat();
                writeStatusBundle(b);
                notifyFinished(b);
                if (rr != null) rr.send(2, b);
            } finally {
                stopHeartbeat();
                if (wake != null && wake.isHeld()) {
                    try {
                        wake.release();
                    } catch (Throwable ignored) {
                    }
                }
                // Notification stays (success or error). Do not strip it — Xiaomi
                // killed the UI in 7.9 and the user never saw that the file landed.
            }
        });
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        cancelled.set(true);
        stopHeartbeat();
        invokeWorker("shutdown");
        try {
            exec.shutdownNow();
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }

    private static void invokeWorker(String method) {
        try {
            Class<?> cls = Class.forName("app.spektrafilm.lab.ExportWorker");
            cls.getMethod(method).invoke(null);
        } catch (Throwable ignored) {
        }
    }

    static void updateProgress(Context ctx, String text) {
        if (ctx == null || text == null) return;
        try {
            Notification n = new NotificationCompat.Builder(ctx, CHANNEL)
                    .setContentTitle("Кириллковая Пленка")
                    .setContentText(text)
                    .setSmallIcon(android.R.drawable.stat_sys_upload)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .build();
            NotificationManager nm =
                    (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF, n);
        } catch (Throwable ignored) {
        }
    }

    private void startFg(String text) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL, "Экспорт", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Проявка полного кадра");
                ch.enableVibration(false);
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) nm.createNotificationChannel(ch);
            }
            Notification n = new NotificationCompat.Builder(this, CHANNEL)
                    .setContentTitle("Кириллковая Пленка")
                    .setContentText(text)
                    .setSmallIcon(android.R.drawable.stat_sys_upload)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(openAppIntent())
                    .build();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else if (Build.VERSION.SDK_INT >= 26) {
                startForeground(NOTIF, n);
            }
        } catch (Throwable t) {
            Log.w(TAG, "foreground failed — continuing as a started service", t);
        }
    }

    static String messageOf(Throwable t) {
        if (t instanceof java.util.concurrent.CancellationException) return "cancelled";
        String msg = t.getMessage();
        if (t instanceof OutOfMemoryError
                || (msg != null
                        && (msg.toLowerCase().contains("memory")
                                || msg.toLowerCase().contains("allocat")
                                || msg.contains("памяти")))) {
            return "Не хватило памяти для оригинального размера";
        }
        if (msg == null || msg.isEmpty()) return "export";
        if ("cancelled".equals(msg)) return msg;
        return msg;
    }

    static Bundle failBundle(String error) {
        Bundle b = new Bundle();
        b.putBoolean("ok", false);
        b.putString("error", error == null || error.isEmpty() ? "export" : error);
        return b;
    }

    static File statusFile(Context ctx) {
        return new File(ctx.getApplicationContext().getFilesDir(), STATUS_FILE);
    }

    static void writeRunning(Context ctx) {
        if (ctx == null) return;
        try {
            File f = statusFile(ctx);
            String json = "{\"ok\":false,\"running\":true,\"error\":null,\"width\":0,\"height\":0,\"ms\":0,\"uri\":null,\"t\":"
                    + System.currentTimeMillis() + "}";
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
        }
    }

    private synchronized void startHeartbeat() {
        stopHeartbeat();
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted() && !cancelled.get()) {
                writeRunning(ExportService.this);
                try {
                    Thread.sleep(4000);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }, "spektra-hb");
        t.setDaemon(true);
        heartbeat = t;
        t.start();
    }

    private synchronized void stopHeartbeat() {
        Thread t = heartbeat;
        heartbeat = null;
        if (t != null) {
            t.interrupt();
        }
    }

    static void writeStatusFor(Context ctx, Bundle out) {
        if (ctx == null) return;
        try {
            boolean ok = out != null && out.getBoolean("ok", false);
            String error = out != null ? out.getString("error") : "export";
            int w = out != null ? out.getInt("width", 0) : 0;
            int h = out != null ? out.getInt("height", 0) : 0;
            int ms = out != null ? out.getInt("ms", 0) : 0;
            String uri = out != null ? out.getString("uri") : null;
            File f = statusFile(ctx);
            String json = "{"
                    + "\"ok\":" + ok
                    + ",\"running\":false"
                    + ",\"error\":" + jsonStr(error)
                    + ",\"width\":" + w
                    + ",\"height\":" + h
                    + ",\"ms\":" + ms
                    + ",\"uri\":" + jsonStr(uri)
                    + ",\"t\":" + System.currentTimeMillis()
                    + "}";
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
        }
    }

    private void writeStatusBundle(Bundle out) {
        writeStatusFor(this, out);
    }

    private void writeStatus(boolean ok, String error, int w, int h, int ms, String uri) {
        Bundle b = new Bundle();
        b.putBoolean("ok", ok);
        if (error != null) b.putString("error", error);
        b.putInt("width", w);
        b.putInt("height", h);
        b.putInt("ms", ms);
        if (uri != null) b.putString("uri", uri);
        writeStatusFor(this, b);
    }

    private PendingIntent openAppIntent() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 1, i, flags);
    }

    private void notifyFinished(Bundle out) {
        boolean ok = out != null && out.getBoolean("ok", false);
        int w = out != null ? out.getInt("width", 0) : 0;
        int h = out != null ? out.getInt("height", 0) : 0;
        String err = out != null ? out.getString("error") : null;
        String text = ok
                ? (w > 0 ? (w + "×" + h + " · Pictures/Spektrafilm") : "Pictures/Spektrafilm")
                : (err == null || err.isEmpty() ? "Ошибка экспорта" : err);
        try {
            Notification n = new NotificationCompat.Builder(this, CHANNEL)
                    .setContentTitle(ok ? "Кадр сохранён" : "Экспорт не удался")
                    .setContentText(text)
                    .setSmallIcon(ok
                            ? android.R.drawable.stat_sys_download_done
                            : android.R.drawable.stat_notify_error)
                    .setOngoing(false)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(openAppIntent())
                    .build();
            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(STOP_FOREGROUND_DETACH);
            } else {
                stopForeground(false);
            }
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF, n);
        } catch (Throwable t) {
            Log.w(TAG, "notifyFinished", t);
        }
    }

    private static String jsonStr(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}

