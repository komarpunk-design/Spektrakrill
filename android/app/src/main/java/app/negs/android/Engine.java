package app.negs.android;
final class Engine {
 static { System.loadLibrary("negs"); System.loadLibrary("negs_reference"); }
 static native byte[] request(byte[] data, byte[] request);
 static native byte[] requestReference(byte[] data, byte[] request);
}
