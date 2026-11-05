package app.spektrafilm.lab;

import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Cross-process ring log written to app files. Both {@code :ui} and the default
 * export process append here so the Журнал tab can copy a real export trace.
 */
public final class LabLog {
    public static final String FILE = "spektra-lab.log";
    private static final String TAG = "SpektraLog";
    private static final int MAX_BYTES = 220 * 1024;
    private static final Object LOCK = new Object();
    private static File file;
    private static String proc = "?";
    private static String version = "9.35";

    private LabLog() {}

    public static void init(Context ctx) {
        if (ctx == null) return;
        Context app = ctx.getApplicationContext();
        synchronized (LOCK) {
            file = new File(app.getFilesDir(), FILE);
            proc = processName(app);
        }
        i("boot", "pid=" + android.os.Process.myPid()
                + " proc=" + proc
                + " sdk=" + Build.VERSION.SDK_INT
                + " " + Build.MANUFACTURER + " " + Build.MODEL
                + " abi=" + (Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?")
                + " v=" + version);
    }

    public static void i(String tag, String msg) {
        write("I", tag, msg, null);
    }

    public static void w(String tag, String msg) {
        write("W", tag, msg, null);
    }

    public static void e(String tag, String msg) {
        write("E", tag, msg, null);
    }

    public static void e(String tag, String msg, Throwable t) {
        write("E", tag, msg, t);
    }

    public static String readAll(Context ctx) {
        init(ctx);
        StringBuilder sb = new StringBuilder(16 * 1024);
        sb.append("Spektrafilm ").append(version).append(" journal\n");
        sb.append("device ").append(Build.MANUFACTURER).append(" ").append(Build.MODEL)
                .append(" sdk=").append(Build.VERSION.SDK_INT).append("\n");
        synchronized (LOCK) {
            File f = file;
            if (f != null && f.exists() && f.length() > 0) {
                try (FileInputStream in = new FileInputStream(f);
                        InputStreamReader ir = new InputStreamReader(in, StandardCharsets.UTF_8);
                        BufferedReader br = new BufferedReader(ir, 8192)) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line).append('\n');
                    }
                } catch (Throwable t) {
                    sb.append("(read failed: ").append(t.getMessage()).append(")\n");
                }
            } else {
                sb.append("(empty)\n");
            }
        }
        String cat = scrapeLogcat();
        if (cat != null && !cat.isEmpty()) {
            sb.append("--- logcat ---\n").append(cat);
            if (cat.charAt(cat.length() - 1) != '\n') sb.append('\n');
        }
        return sb.toString();
    }

    public static void clear(Context ctx) {
        File status = new File(ctx.getApplicationContext().getFilesDir(), ExportService.STATUS_FILE);
        if (status.exists()) {
            try {
                byte[] bytes = new byte[(int) Math.min(status.length(), 4096)];
                try (FileInputStream in = new FileInputStream(status)) {
                    int n = in.read(bytes);
                    String s = n > 0 ? new String(bytes, 0, n, StandardCharsets.UTF_8) : "";
                    if (s.contains("\"running\":true")) {
                        i("boot", "skip clear, export running");
                        return;
                    }
                }
            } catch (Throwable ignored) {
            }
        }
        init(ctx);
        synchronized (LOCK) {
            File f = file;
            if (f != null && f.exists()) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
        i("boot", "cleared");
    }

    private static void write(String level, String tag, String msg, Throwable t) {
        String line = format(level, tag, msg, t);
        Log.println(priority(level), TAG, tag + ": " + (msg == null ? "" : msg));
        if (t != null) Log.println(priority(level), TAG, Log.getStackTraceString(t));
        File f;
        synchronized (LOCK) {
            f = file;
        }
        if (f == null) return;
        byte[] bytes = (line + "\n").getBytes(StandardCharsets.UTF_8);
        synchronized (LOCK) {
            FileChannel ch = null;
            FileLock lock = null;
            try {
                rotateIfNeeded(f, bytes.length);
                FileOutputStream fos = new FileOutputStream(f, true);
                ch = fos.getChannel();
                try {
                    lock = ch.lock();
                } catch (Throwable ignored) {
                }
                fos.write(bytes);
                fos.flush();
                fos.close();
                ch = null;
            } catch (Throwable ignored) {
            } finally {
                if (lock != null) {
                    try {
                        lock.release();
                    } catch (Throwable ignored) {
                    }
                }
                if (ch != null) {
                    try {
                        ch.close();
                    } catch (Throwable ignored) {
                    }
                }
            }
        }
    }

    private static void rotateIfNeeded(File f, int incoming) {
        if (f == null || !f.exists()) return;
        if (f.length() + incoming < MAX_BYTES) return;
        File bak = new File(f.getAbsolutePath() + ".1");
        //noinspection ResultOfMethodCallIgnored
        bak.delete();
        //noinspection ResultOfMethodCallIgnored
        f.renameTo(bak);
    }

    private static String format(String level, String tag, String msg, Throwable t) {
        String ts = new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
        StringBuilder sb = new StringBuilder(128);
        sb.append(ts).append(' ').append(level).append('/').append(tag == null ? "-" : tag)
                .append(" [").append(proc).append("] ")
                .append(msg == null ? "" : msg);
        if (t != null) {
            sb.append(" | ").append(t.getClass().getSimpleName());
            String m = t.getMessage();
            if (m != null && !m.isEmpty()) sb.append(": ").append(m);
            Throwable c = t.getCause();
            if (c != null && c != t) {
                sb.append(" caused ").append(c.getClass().getSimpleName());
                if (c.getMessage() != null) sb.append(": ").append(c.getMessage());
            }
            String trace = Log.getStackTraceString(t);
            if (trace != null && !trace.isEmpty()) {
                String[] lines = trace.split("\n");
                int n = Math.min(lines.length, 8);
                for (int i = 0; i < n; i++) {
                    sb.append("\n  ").append(lines[i].trim());
                }
            }
        }
        return sb.toString();
    }

    private static int priority(String level) {
        if ("E".equals(level)) return Log.ERROR;
        if ("W".equals(level)) return Log.WARN;
        return Log.INFO;
    }

    private static String processName(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= 28) {
                String n = Application.getProcessName();
                if (n != null) {
                    String pkg = ctx.getPackageName();
                    if (n.equals(pkg)) return "main";
                    if (n.startsWith(pkg)) return n.substring(pkg.length());
                    return n;
                }
            }
        } catch (Throwable ignored) {
        }
        return "p" + android.os.Process.myPid();
    }

    private static String scrapeLogcat() {
        Process p = null;
        try {
            p = Runtime.getRuntime().exec(new String[] {
                "logcat",
                "-d",
                "-t",
                "180",
                "-v",
                "time",
                "Spektra:I",
                "SpektraEngine:I",
                "SpektraExport:I",
                "SpektraLog:I",
                "AndroidRuntime:E",
                "DEBUG:I",
                "*:S",
            });
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                int n = 0;
                while ((line = br.readLine()) != null) {
                    sb.append(line).append('\n');
                    if (++n > 220) break;
                }
            }
            return sb.toString();
        } catch (Throwable t) {
            return "";
        } finally {
            if (p != null) p.destroy();
        }
    }
}
