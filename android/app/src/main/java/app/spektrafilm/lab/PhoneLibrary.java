package app.spektrafilm.lab;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Phone camera roll: images MediaStore already indexes, plus raw filenames. */
public final class PhoneLibrary {
    private static final String READ_IMAGES = "android.permission.READ_MEDIA_IMAGES";
    private static final String READ_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";
    private static final String[] RAW_EXT = {
        "dng", "nef", "nrw", "arw", "srf", "sr2", "cr2", "cr3", "raf", "orf",
        "rw2", "pef", "raw", "rwl", "3fr", "fff", "iiq", "mef", "mos", "mrw", "x3f",
    };

    private PhoneLibrary() {}

    public static boolean hasAccess(Context ctx) {
        if (ctx == null) return false;
        if (Build.VERSION.SDK_INT >= 34) {
            return granted(ctx, READ_IMAGES) || granted(ctx, READ_SELECTED);
        }
        if (Build.VERSION.SDK_INT >= 33) return granted(ctx, READ_IMAGES);
        return granted(ctx, android.Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    /** Android 14 "выбранные фото", not the whole roll. */
    public static boolean isLimited(Context ctx) {
        if (ctx == null || Build.VERSION.SDK_INT < 34) return false;
        return !granted(ctx, READ_IMAGES) && granted(ctx, READ_SELECTED);
    }

    public static JSONArray list(Context ctx, int offset, int limit) throws Exception {
        JSONArray out = new JSONArray();
        if (!hasAccess(ctx)) return out;
        Uri collection = MediaStore.Files.getContentUri("external");
        String[] full = new String[] {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.MediaColumns.WIDTH,
            MediaStore.MediaColumns.HEIGHT,
        };
        String[] slim = new String[] {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.MIME_TYPE,
        };
        String selection = "(" + MediaStore.Files.FileColumns.MEDIA_TYPE + "="
                + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE + " OR (" + rawClause() + "))";
        android.database.Cursor cursor = null;
        try {
            cursor = query(ctx, collection, full, selection, offset, limit);
            if (cursor == null) cursor = query(ctx, collection, slim, selection, offset, limit);
            if (cursor == null) {
                String imagesOnly = MediaStore.Files.FileColumns.MEDIA_TYPE + "="
                        + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE;
                cursor = query(ctx, collection, slim, imagesOnly, offset, limit);
            }
            if (cursor == null) return out;
            int skip = Build.VERSION.SDK_INT >= 26 ? 0 : offset;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
            int dateCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED);
            int mimeCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE);
            int wCol = cursor.getColumnIndex(MediaStore.MediaColumns.WIDTH);
            int hCol = cursor.getColumnIndex(MediaStore.MediaColumns.HEIGHT);
            int n = 0;
            while (cursor.moveToNext()) {
                if (skip > 0) {
                    skip--;
                    continue;
                }
                if (n >= limit) break;
                long id = cursor.getLong(idCol);
                String name = cursor.getString(nameCol);
                if (name == null || name.isEmpty()) name = "кадр";
                long added = dateCol >= 0 ? cursor.getLong(dateCol) : 0L;
                String mime = mimeCol >= 0 ? cursor.getString(mimeCol) : "";
                int w = wCol >= 0 ? cursor.getInt(wCol) : 0;
                int h = hCol >= 0 ? cursor.getInt(hCol) : 0;
                Uri item = ContentUris.withAppendedId(collection, id);
                boolean raw = isRawName(name);
                JSONObject row = new JSONObject();
                row.put("id", String.valueOf(id));
                row.put("name", name);
                row.put("uri", item.toString());
                row.put("w", w);
                row.put("h", h);
                row.put("t", added * 1000L);
                row.put("raw", raw);
                row.put("mime", mime == null ? "" : mime);
                String thumb = thumb(ctx, item);
                if (!thumb.isEmpty()) row.put("thumb", thumb);
                out.put(row);
                n++;
            }
        } finally {
            if (cursor != null) cursor.close();
        }
        return out;
    }

    private static android.database.Cursor query(
            Context ctx,
            Uri collection,
            String[] proj,
            String selection,
            int offset,
            int limit) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Bundle args = new Bundle();
                args.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
                args.putInt(ContentResolver.QUERY_ARG_LIMIT, limit);
                args.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
                args.putStringArray(
                        ContentResolver.QUERY_ARG_SORT_COLUMNS,
                        new String[] { MediaStore.Files.FileColumns.DATE_ADDED });
                args.putInt(
                        ContentResolver.QUERY_ARG_SORT_DIRECTION,
                        ContentResolver.QUERY_SORT_DIRECTION_DESCENDING);
                return ctx.getContentResolver().query(collection, proj, args, null);
            }
            return ctx.getContentResolver().query(
                    collection,
                    proj,
                    selection,
                    null,
                    MediaStore.Files.FileColumns.DATE_ADDED + " DESC");
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static boolean granted(Context ctx, String perm) {
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }

    private static String rawClause() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < RAW_EXT.length; i++) {
            if (i > 0) sb.append(" OR ");
            sb.append("LOWER(").append(MediaStore.Files.FileColumns.DISPLAY_NAME)
                    .append(") LIKE '%.").append(RAW_EXT[i]).append("'");
        }
        return sb.toString();
    }

    private static boolean isRawName(String name) {
        String lower = name.toLowerCase();
        int dot = lower.lastIndexOf('.');
        if (dot < 0 || dot == lower.length() - 1) return false;
        String ext = lower.substring(dot + 1);
        for (String raw : RAW_EXT) {
            if (raw.equals(ext)) return true;
        }
        return false;
    }

    private static String thumb(Context ctx, Uri uri) {
        if (Build.VERSION.SDK_INT < 29) return "";
        Bitmap bmp = null;
        try {
            bmp = ctx.getContentResolver().loadThumbnail(uri, new Size(256, 256), null);
            if (bmp == null) return "";
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 62, bos);
            return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable ignored) {
            return "";
        } finally {
            if (bmp != null) bmp.recycle();
        }
    }
}
