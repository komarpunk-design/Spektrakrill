/* Spektrafilm — checked export streams. GPLv3.
 * Adapted from the write/close/reopen/SHA-256 publication contract in
 * Spektrafilm-android VerifiedDocumentWriter.kt. See THIRD_PARTY_NOTICES.md. */
package app.spektrafilm.lab;

import java.io.IOException;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

final class VerifiedStreams {
    interface Encoder { void write(OutputStream output) throws Exception; }
    static final class Receipt {
        final long bytes;
        final byte[] digest;
        Receipt(long bytes, byte[] digest) { this.bytes = bytes; this.digest = digest; }
    }

    static Receipt encode(OutputStream output, Encoder encoder) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        long[] bytes = {0};
        OutputStream checked = new OutputStream() {
            @Override public void write(int value) throws IOException {
                output.write(value); hash.update((byte) value); bytes[0]++;
            }
            @Override public void write(byte[] buffer, int offset, int length) throws IOException {
                output.write(buffer, offset, length); hash.update(buffer, offset, length); bytes[0] += length;
            }
            @Override public void flush() throws IOException { output.flush(); }
        };
        encoder.write(checked);
        checked.flush();
        if (bytes[0] == 0) throw new IOException("Файл экспорта пуст");
        return new Receipt(bytes[0], hash.digest());
    }

    static void verify(InputStream input, Receipt expected) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        long bytes = 0;
        while (true) {
            int read = input.read(buffer);
            if (read < 0) break;
            if (read == 0) {
                int one = input.read();
                if (one < 0) break;
                hash.update((byte) one); bytes++;
            } else {
                hash.update(buffer, 0, read); bytes += read;
            }
            if (bytes > expected.bytes) throw new IOException("Размер сохранённого файла не совпадает");
        }
        if (bytes != expected.bytes || !MessageDigest.isEqual(hash.digest(), expected.digest)) {
            throw new IOException("Сохранённый файл не прошёл проверку целостности");
        }
    }
    static File reserveDestination(File dir, String name) throws IOException {
        File candidate = new File(dir, name);
        if (candidate.createNewFile()) return candidate;
        int dot = name.lastIndexOf('.');
        String prefix = dot > 0 ? name.substring(0, dot) : name;
        String suffix = dot > 0 ? name.substring(dot) : "";
        return File.createTempFile(prefix.length() < 3 ? "sf-" + prefix : prefix, suffix, dir);
    }
    private VerifiedStreams() {}
}
