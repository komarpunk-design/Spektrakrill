/* Spektrafilm — verified gallery publication. GPLv3.
 * Inspired by Spektrafilm-android's VerifiedDocumentWriter.kt (Akshay Sharma
 * and contributors). Adapted for our MediaStore and legacy gallery routes.
 * See THIRD_PARTY_NOTICES.md for source revision and attribution. */
package app.spektrafilm.lab;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;

final class VerifiedMediaWriter {
    static Uri save(Context context, String name, String mime, VerifiedStreams.Encoder encoder) throws Exception {
        if (name == null || name.isEmpty() || !name.equals(new File(name).getName()) || name.equals(".") || name.equals("..")) {
            throw new IOException("Недопустимое имя файла");
        }
        String contentType = mime == null || mime.isEmpty() ? "image/jpeg" : mime;
        if (Build.VERSION.SDK_INT >= 29) return saveMediaStore(context, name, contentType, encoder);
        return saveLegacy(context, name, contentType, encoder);
    }

    private static Uri saveMediaStore(Context context, String name, String mime, VerifiedStreams.Encoder encoder) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        ContentValues pending = new ContentValues();
        pending.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        pending.put(MediaStore.Images.Media.MIME_TYPE, mime);
        pending.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Spektrafilm");
        pending.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, pending);
        if (uri == null) throw new IOException("Не удалось создать файл в галерее");
        try {
            VerifiedStreams.Receipt expected;
            try (OutputStream output = resolver.openOutputStream(uri, "w")) {
                if (output == null) throw new IOException("Не удалось открыть файл для записи");
                expected = VerifiedStreams.encode(output, encoder);
                if (output instanceof FileOutputStream) ((FileOutputStream) output).getFD().sync();
            }
            try (InputStream input = resolver.openInputStream(uri)) {
                if (input == null) throw new IOException("Не удалось проверить сохранённый файл");
                VerifiedStreams.verify(input, expected);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            if (resolver.update(uri, done, null, null) != 1) throw new IOException("Не удалось опубликовать файл в галерее");
            return uri;
        } catch (Exception | Error failure) {
            try {
                if (resolver.delete(uri, null, null) != 1) failure.addSuppressed(new IOException("Не удалось удалить незавершённый экспорт"));
            } catch (Exception cleanup) { failure.addSuppressed(cleanup); }
            throw failure;
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri saveLegacy(Context context, String name, String mime, VerifiedStreams.Encoder encoder) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Spektrafilm");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Не удалось создать папку экспорта");
        File staging = File.createTempFile("sf-export-", ".part", dir);
        File destination = null;
        boolean complete = false;
        try {
            VerifiedStreams.Receipt expected;
            try (FileOutputStream output = new FileOutputStream(staging)) {
                expected = VerifiedStreams.encode(output, encoder);
                output.getFD().sync();
            }
            try (InputStream input = new FileInputStream(staging)) { VerifiedStreams.verify(input, expected); }
            // Reserve our destination atomically; never overwrite an existing photograph.
            destination = VerifiedStreams.reserveDestination(dir, name);
            if (!staging.renameTo(destination)) throw new IOException("Не удалось завершить сохранение");
            complete = true;
            MediaScannerConnection.scanFile(context, new String[] { destination.getAbsolutePath() }, new String[] { mime }, null);
            return Uri.fromFile(destination);
        } finally {
            if (staging.exists() && !staging.delete()) staging.deleteOnExit();
            if (!complete && destination != null && destination.exists() && !destination.delete()) destination.deleteOnExit();
        }
    }
    private VerifiedMediaWriter() {}
}
