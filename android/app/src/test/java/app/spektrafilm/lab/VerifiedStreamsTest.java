package app.spektrafilm.lab;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
import java.util.Arrays;

public class VerifiedStreamsTest {
    private VerifiedStreams.Receipt receipt(byte[] bytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        VerifiedStreams.Receipt result = VerifiedStreams.encode(output, stream -> {
            stream.write(bytes, 0, bytes.length / 2);
            for (int i = bytes.length / 2; i < bytes.length; i++) stream.write(bytes[i]);
        });
        assertArrayEquals(bytes, output.toByteArray());
        return result;
    }
    @Test public void acceptsExactRoundTripAcrossChunkBoundary() throws Exception {
        byte[] data = new byte[150000];
        for (int i = 0; i < data.length; i++) data[i] = (byte) i;
        VerifiedStreams.verify(new ByteArrayInputStream(data), receipt(data));
    }
    @Test public void rejectsEmptyEncoding() throws Exception {
        assertThrows(IOException.class, () -> VerifiedStreams.encode(new ByteArrayOutputStream(), output -> {}));
    }
    @Test public void rejectsTruncatedData() throws Exception {
        assertThrows(IOException.class, () -> VerifiedStreams.verify(new ByteArrayInputStream(new byte[] {1}), receipt(new byte[] {1, 2})));
    }
    @Test public void rejectsSameSizeCorruption() throws Exception {
        assertThrows(IOException.class, () -> VerifiedStreams.verify(new ByteArrayInputStream(new byte[] {2, 1}), receipt(new byte[] {1, 2})));
    }
    @Test public void rejectsTrailingBytes() throws Exception {
        assertThrows(IOException.class, () -> VerifiedStreams.verify(new ByteArrayInputStream(new byte[] {1, 2, 3}), receipt(new byte[] {1, 2})));
    }
    @Test public void handlesZeroProgressInput() throws Exception {
        byte[] bytes = {4, 5, 6};
        ByteArrayInputStream source = new ByteArrayInputStream(bytes);
        InputStream stalled = new InputStream() {
            @Override public int read(byte[] buffer) { return 0; }
            @Override public int read() { return source.read(); }
        };
        VerifiedStreams.verify(stalled, receipt(bytes));
    }
    @Test public void doesNotOverwriteExistingDestination() throws Exception {
        File dir = Files.createTempDirectory("export-test-").toFile();
        File original = new File(dir, "photo.jpg");
        Files.write(original.toPath(), new byte[] {7, 8, 9});
        File reserved = VerifiedStreams.reserveDestination(dir, "photo.jpg");
        assertNotEquals(original, reserved);
        assertArrayEquals(new byte[] {7, 8, 9}, Files.readAllBytes(original.toPath()));
        reserved.delete(); original.delete(); dir.delete();
    }
}
