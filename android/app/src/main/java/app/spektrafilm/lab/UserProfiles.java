package app.spektrafilm.lab;

import android.content.Context;
import com.spectrafilm.engine.SpektraEngine;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Writable overlay of Volpato spectral JSON next to the bundled APK assets. */
public final class UserProfiles {
    public static final String DIR = "user-profiles";

    private UserProfiles() {}

    public static boolean validId(String id) {
        if (id == null || id.isEmpty() || id.length() > 64) return false;
        for (int i = 0; i < id.length(); i++) {
            char c = id.charAt(i);
            if (!(Character.isLetterOrDigit(c) || c == '_' || c == '-')) return false;
        }
        return true;
    }

    public static File dir(Context ctx) {
        File d = new File(ctx.getFilesDir(), DIR);
        if (!d.exists() && !d.mkdirs()) {
            LabLog.w("profile", "mkdir " + d.getAbsolutePath());
        }
        return d;
    }

    public static void attach(SpektraEngine eng, Context ctx) {
        if (eng == null || ctx == null) return;
        try {
            File d = dir(ctx);
            eng.setUserProfilesDir(d.getAbsolutePath());
        } catch (Throwable t) {
            LabLog.w("profile", "attach " + t.getMessage());
        }
    }

    public static File file(Context ctx, String id) {
        if (!validId(id)) throw new IllegalArgumentException("id");
        return new File(dir(ctx), id + ".json");
    }

    public static void write(Context ctx, String id, String json) throws Exception {
        if (!validId(id)) throw new IllegalArgumentException("id");
        if (json == null || json.length() < 32) throw new IllegalArgumentException("json");
        if (json.length() > 1_000_000) throw new IllegalArgumentException("too large");
        File tmp = new File(dir(ctx), id + ".json.tmp");
        File dest = file(ctx, id);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        if (dest.exists() && !dest.delete()) {
            LabLog.w("profile", "replace " + id);
        }
        if (!tmp.renameTo(dest)) {
            throw new Exception("write " + id);
        }
    }

    public static void remove(Context ctx, String id) {
        if (!validId(id)) return;
        File f = file(ctx, id);
        if (f.exists() && !f.delete()) LabLog.w("profile", "delete " + id);
    }

    public static List<String> list(Context ctx) {
        List<String> out = new ArrayList<>();
        File[] files = dir(ctx).listFiles();
        if (files == null) return out;
        for (File f : files) {
            String name = f.getName();
            if (name.endsWith(".json")) out.add(name.substring(0, name.length() - 5));
        }
        return out;
    }
}
