package app.spektrafilm.lab;

import android.app.Application;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ColorSpace;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import com.spectrafilm.engine.LinearImage;
import com.spectrafilm.engine.RenderKind;
import com.spectrafilm.engine.SimResult;
import com.spectrafilm.engine.SpektraEngine;
import com.spectrafilm.engine.SpektraParams;
import com.spectrafilm.libraw.LinearResult;
import com.spectrafilm.libraw.RawDecoder;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import org.json.JSONObject;

/**
 * Spektrafilm-android export pipeline (MainActivity.kt ~1766 + ImagePipeline.saveToGallery):
 * load full-res off-heap → {@code simulate(state.toParams())} (exact spectral, LUTs off
 * unless the user enabled them) → {@code image.close()} immediately → band-by-band Bitmap →
 * {@code Bitmap.compress} into MediaStore.
 *
 * In the {@code :export} process the engine is cached so a second save is as fast as
 * Spektrafilm's warm in-process engine. UI-process fallback creates a throwaway engine.
 */
public final class ExportWorker {
    private static final Object ENG_LOCK = new Object();
    private static SpektraEngine cached;
    /** 26 MP whole-frame hangs; 12 MP already finishes in ~12s. Tile only huge frames. */
    private static final long TILE_NPIX = 16_000_000L;
    private static final long TILE_RGB_BYTES = 72L << 20;
    private static final int TILE_HALO = 96;

    private ExportWorker() {}

    public static void warm(Context ctx) {
        try {
            LabLog.init(ctx);
            engine(ctx, true);
            LabLog.i("export", "engine warm " + SpektraEngine.gpuDiagnostics());
            Log.i(ExportService.TAG, "engine warm");
        } catch (Throwable t) {
            LabLog.e("export", "warm failed", t);
            Log.w(ExportService.TAG, "warm failed", t);
        }
    }

    public static void shutdown() {
        synchronized (ENG_LOCK) {
            if (cached != null) {
                try {
                    cached.close();
                } catch (Throwable ignored) {
                }
                cached = null;
            }
        }
    }

    public static Bundle run(Context ctx, Intent job) throws Exception {
        return run(ctx, job, null);
    }

    public static Bundle run(Context ctx, Intent job, SpektraEngine provided) throws Exception {
        if (job == null) throw new Exception("empty");
        if (ExportService.cancelled.get()) throw new Exception("cancelled");
        String path = job.getStringExtra(ExportService.EXTRA_SOURCE);
        boolean raw = job.getBooleanExtra(ExportService.EXTRA_RAW, false);
        String paramsStr = job.getStringExtra(ExportService.EXTRA_PARAMS);
        String format = job.getStringExtra(ExportService.EXTRA_FORMAT);
        if (format == null || format.isEmpty()) format = "jpeg";
        int quality = job.getIntExtra(ExportService.EXTRA_QUALITY, 98);
        int orient = job.getIntExtra(ExportService.EXTRA_ORIENT, 0);
        String name = job.getStringExtra(ExportService.EXTRA_NAME);
        if (name == null || name.isEmpty()) name = "spektrafilm.jpg";
        if (path == null) throw new Exception("Open a RAW or photo first");
        File source = new File(path);
        if (!source.exists()) throw new Exception("Open a RAW or photo first");
        JSONObject paramsJson = paramsStr != null && !paramsStr.isEmpty()
                ? new JSONObject(paramsStr)
                : new JSONObject();
        boolean wantGpu = paramsJson.optBoolean("gpuExport", true);
        try {
            paramsJson.put("gpuExport", wantGpu);
            paramsJson.put("upscaleFactor", 1);
            paramsJson.put("exportMaxEdge", 0);
        } catch (Exception ignored) {
        }
        LabLog.init(ctx);
        try {
            android.os.Process.setThreadPriority(
                    android.os.Process.THREAD_PRIORITY_FOREGROUND);
        } catch (Throwable ignored) {
        }
        try {
            SpektraEngine.setBigCores(0);
            SpektraEngine.setParallelPool(1);
        } catch (Throwable ignored) {
        }
        LabLog.i("export", "start raw=" + raw
                + " gpuExport=" + wantGpu
                + " format=" + format
                + " q=" + quality
                + " orient=" + orient
                + " name=" + name
                + " file=" + source.getName()
                + " bytes=" + source.length());

        LinearImage image = null;
        SimResult result = null;
        SpektraEngine eng = null;
        boolean keepEngine = true;
        Bitmap bmp = null;
        long t0 = System.nanoTime();
        try {
            System.gc();
            long tDecode = System.nanoTime();
            image = decodeSource(ctx, source, raw, paramsJson);
            LabLog.i("export", "decoded " + image.getWidth() + "x" + image.getHeight()
                    + " cs=" + image.getColorSpace()
                    + " ms=" + ((System.nanoTime() - tDecode) / 1_000_000L));
            long npix = (long) image.getWidth() * (long) image.getHeight();
            String progress = "Проявляю " + image.getWidth() + "×" + image.getHeight();
            if (npix > 9_000_000L) progress += " · подождите";
            ExportService.updateProgress(ctx, progress);
            LabLog.i("export", "size " + image.getWidth() + "x" + image.getHeight()
                    + " rgbMiB=" + String.format(java.util.Locale.US, "%.1f",
                    npix * 12.0 / (1024.0 * 1024.0))
                    + " bigCores=" + SpektraEngine.bigCoreCount());
            if (ExportService.cancelled.get()) throw new Exception("cancelled");
            WhiteBalance.applyInPlace(image, paramsJson);
            RawEngine.applyInPlace(image, paramsJson);
            try {
                LabLog.i("engine", "rawEngine=" + paramsJson.optString("rawEngine", "spektrafilm")
                    + " style=" + paramsJson.optString("rawEngineStyle", "standard"));
            } catch (Throwable ignored) {
            }
            try {
                LabLog.i("pixels", "input " + ImageConvert.linearStats(image));
            } catch (Throwable t) {
                LabLog.w("pixels", "input stats failed " + t.getMessage());
            }
            String inCs = image.getColorSpace() != null ? image.getColorSpace() : "ProPhoto RGB";
            LinearImage cropped = applyCropIfNeeded(image, paramsJson);
            if (cropped != image) {
                releaseImage(image, raw);
                image = cropped;
                raw = false;
                LabLog.i("export", "cropped " + image.getWidth() + "x" + image.getHeight());
            }
            boolean plain = FilmLook.bypass(paramsJson);
            if (!plain) {
                eng = provided != null ? provided : engine(ctx, keepEngine);
            }
            if (paramsJson.optBoolean("autoExposure", true)) {
                try {
                    if (plain) {
                        ImageConvert.applyMidGrayGain(image);
                        LabLog.i("export", "ae mid-gray (no film)");
                    } else {
                        SpektraParams meterParams = ParamsBuilder.fromJson(
                                paramsJson, inCs, false, false, 16384, true);
                        double ev = eng.meterExposureEv(image, meterParams, null);
                        float gain = (float) Math.pow(2.0, ev);
                        LabLog.i("export", "ae ev=" + ev + " gain=" + gain);
                        if (Float.isFinite(gain) && gain > 0f && gain != 1f) {
                            ImageConvert.applyGainInPlace(image, gain);
                        }
                    }
                    paramsJson.put("autoExposure", false);
                } catch (Throwable t) {
                    LabLog.w("export", "ae meter failed " + t.getMessage());
                }
            }
            if (plain) {
                LabLog.i("export", "plain no-film "
                        + image.getWidth() + "x" + image.getHeight()
                        + " engine=" + paramsJson.optString("rawEngine", "spektrafilm"));
                double evComp = paramsJson.optDouble("exposureCompensationEv", 0);
                if (Double.isFinite(evComp) && evComp != 0.0) {
                    ImageConvert.applyGainInPlace(image, (float) Math.pow(2.0, evComp));
                }
                ImageConvert.applyDigitalTone(image, paramsJson);
                bmp = ImageConvert.linearToDisplayBitmap(image, 0);
            } else {
            SpektraParams params = ParamsBuilder.fromJson(
                    paramsJson, inCs, false, false, 16384, true);
            LabLog.i("export", "params film=" + params.getFilmProfile()
                    + " paper=" + params.getPrintProfile()
                    + " scanFilm=" + params.getIo().getScanFilm()
                    + " gpuExport=" + params.getSettings().getGpuExport()
                    + " lutE=" + params.getSettings().getUseEnlargerLut()
                    + " lutS=" + params.getSettings().getUseScannerLut()
                    + " gpuPreview=" + params.getSettings().getGpuPreview()
                    + " camDiff=" + (paramsJson.optJSONObject("cameraDiffusion") != null
                    && paramsJson.optJSONObject("cameraDiffusion").optBoolean("active", false)));
            long tSim = System.nanoTime();
            long npixNow = (long) image.getWidth() * (long) image.getHeight();
            boolean tile = shouldTile(image.getWidth(), image.getHeight());
            LabLog.i("export", "plan tile=" + tile
                    + " storage=" + gpuStorageBytes()
                    + " scanFilm=" + paramsJson.optBoolean("scanFilm", false));
            if (tile) {
                bmp = simulateTiled(ctx, eng, image, paramsJson, inCs, wantGpu);
                LabLog.i("export", "tiled simulate ms=" + ((System.nanoTime() - tSim) / 1_000_000L));
            } else {
                try {
                    result = eng.simulate(image, params, RenderKind.EXPORT, null);
                } catch (Throwable simFail) {
                    LabLog.e("export", "simulate threw", simFail);
                    throw simFail;
                }
                LabLog.i("export", "simulate ms=" + ((System.nanoTime() - tSim) / 1_000_000L));
                try {
                    LabLog.i("gpu", SpektraEngine.gpuDiagnostics());
                } catch (Throwable t) {
                    LabLog.w("gpu", "diag failed " + t.getMessage());
                }
                if (ExportService.cancelled.get()) throw new Exception("cancelled");
                if (result == null) {
                    throw new Exception("engine returned no image");
                }
                try {
                    LabLog.i("pixels", ImageConvert.sampleStats(result));
                } catch (Throwable t) {
                    LabLog.w("pixels", "stats failed " + t.getMessage());
                }
                if (wantGpu && ImageConvert.looksFlat(result)) {
                    LabLog.w("export", "flat GPU result, retry CPU exact");
                    ExportService.updateProgress(ctx, "Повтор на CPU " + image.getWidth()
                            + "×" + image.getHeight());
                    try {
                        result.close();
                    } catch (Throwable ignored) {
                    }
                    result = null;
                    System.gc();
                    try {
                        paramsJson.put("gpuExport", false);
                    } catch (Exception ignored) {
                    }
                    params = ParamsBuilder.fromJson(
                            paramsJson, inCs, false, false, 16384, true);
                    tSim = System.nanoTime();
                    result = eng.simulate(image, params, RenderKind.EXPORT, null);
                    LabLog.i("export", "cpu-retry ms=" + ((System.nanoTime() - tSim) / 1_000_000L));
                    try {
                        LabLog.i("pixels", "retry " + ImageConvert.sampleStats(result));
                    } catch (Throwable t) {
                        LabLog.w("pixels", "retry stats failed " + t.getMessage());
                    }
                    if (result == null) throw new Exception("engine returned no image");
                }
            }
            }
            releaseImage(image, raw);
            image = null;
            System.gc();
            int outW;
            int outH;
            if (bmp != null) {
                outW = bmp.getWidth();
                outH = bmp.getHeight();
                if (orient == 90 || orient == 180 || orient == 270) {
                    android.graphics.Matrix rot = new android.graphics.Matrix();
                    rot.postRotate(orient);
                    Bitmap rotated = Bitmap.createBitmap(
                            bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), rot, true);
                    if (rotated != bmp) {
                        try {
                            bmp.recycle();
                        } catch (Throwable ignored) {
                        }
                    }
                    bmp = rotated;
                    outW = bmp.getWidth();
                    outH = bmp.getHeight();
                }
            } else {
                outW = result.getWidth();
                outH = result.getHeight();
                if (orient == 90 || orient == 270) {
                    int t = outW;
                    outW = outH;
                    outH = t;
                }
                try {
                    bmp = ImageConvert.simResultToBitmap(result, orient);
                } finally {
                    try {
                        result.close();
                    } catch (Throwable ignored) {
                    }
                    result = null;
                    System.gc();
                }
            }
            if (ExportService.cancelled.get()) throw new Exception("cancelled");
            String mime = format.toLowerCase().contains("png") ? "image/png" : "image/jpeg";
            Bitmap framed = PhotoFrames.apply(bmp, paramsJson.optString("frameStyle", "none"), paramsJson.optDouble("whitePadding", 0.04));
            if (framed != bmp) { bmp.recycle(); bmp = framed; }
            outW = bmp.getWidth(); outH = bmp.getHeight();
            android.net.Uri uri = writeBitmap(ctx, name, mime, quality, bmp);
            try {
                ExportGallery.record(ctx, name, uri, outW, outH, bmp);
            } catch (Throwable ignored) {
            }
            try {
                bmp.recycle();
            } catch (Throwable ignored) {
            }
            bmp = null;
            Bundle ok = new Bundle();
            ok.putBoolean("ok", true);
            ok.putBoolean("saved", true);
            ok.putInt("width", outW);
            ok.putInt("height", outH);
            ok.putInt("ms", (int) ((System.nanoTime() - t0) / 1_000_000L));
            if (uri != null) ok.putString("uri", uri.toString());
            Log.i(ExportService.TAG, "export ok " + outW + "x" + outH);
            LabLog.i("export", "ok " + outW + "x" + outH
                    + " " + mime
                    + " ms=" + ok.getInt("ms")
                    + " gpu=" + wantGpu
                    + " uri=" + (uri != null ? uri : "-"));
            rememberLast(ctx, name, uri, outW, outH);
            return ok;
        } catch (Throwable t) {
            LabLog.e("export", "failed", t);
            if (t instanceof Exception) throw (Exception) t;
            throw new Exception(t);
        } finally {
            if (bmp != null) {
                try {
                    bmp.recycle();
                } catch (Throwable ignored) {
                }
            }
            if (result != null) {
                try {
                    result.close();
                } catch (Throwable ignored) {
                }
            }
            releaseImage(image, raw);
            if (!keepEngine && eng != null) {
                try {
                    eng.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private static final long TILE_RAM_BYTES = 180L << 20;

    private static long gpuStorageBytes() {
        try {
            String d = SpektraEngine.gpuDiagnostics();
            int i = d.indexOf("maxStorageBufferRange=");
            if (i < 0) return 128L << 20;
            int start = i + "maxStorageBufferRange=".length();
            int end = start;
            while (end < d.length() && Character.isDigit(d.charAt(end))) end++;
            if (end > start) return Long.parseLong(d.substring(start, end));
        } catch (Throwable ignored) {
        }
        return 128L << 20;
    }

    private static boolean shouldTile(int w, int h) {
        long npix = (long) w * (long) h;
        if (npix > TILE_NPIX) return true;
        if (npix < 8_000_000L) return false;
        long rgb = npix * 12L;
        if (rgb >= TILE_RAM_BYTES) return true;
        return false;
    }

    private static Bitmap simulateTiled(
            Context ctx,
            SpektraEngine eng,
            LinearImage image,
            JSONObject paramsJson,
            String inCs,
            boolean wantGpu) throws Exception {
        int w = image.getWidth();
        int h = image.getHeight();
        boolean sliceY = h <= w;
        int longSide = sliceY ? w : h;
        int shortSide = sliceY ? h : w;
        int maxShort = (int) (TILE_RGB_BYTES / (12L * Math.max(1, longSide)));
        if (maxShort < TILE_HALO * 2 + 48) maxShort = TILE_HALO * 2 + 48;
        int inner = maxShort - 2 * TILE_HALO;
        if (inner < 48) inner = 48;
        int nTiles = (shortSide + inner - 1) / inner;
        LabLog.i("export", "tiles " + nTiles
                + " sliceY=" + sliceY
                + " inner=" + inner
                + " halo=" + TILE_HALO
                + " maxShort=" + maxShort
                + " frame=" + w + "x" + h);
        Bitmap bmp = ImageConvert.createExportBitmap(w, h);
        bmp.eraseColor(0xFF000000);
        boolean useGpu = wantGpu;
        for (int t = 0; t < nTiles; t++) {
            if (ExportService.cancelled.get()) throw new Exception("cancelled");
            int inner0 = t * inner;
            int inner1 = Math.min(inner0 + inner, shortSide);
            int src0 = Math.max(0, inner0 - TILE_HALO);
            int src1 = Math.min(shortSide, inner1 + TILE_HALO);
            int tileW = sliceY ? w : (src1 - src0);
            int tileH = sliceY ? (src1 - src0) : h;
            int x0 = sliceY ? 0 : src0;
            int y0 = sliceY ? src0 : 0;
            ExportService.updateProgress(ctx,
                    "Плитка " + (t + 1) + "/" + nTiles
                            + " · " + tileW + "×" + tileH);
            LinearImage tile = ImageConvert.copyRect(image, x0, y0, tileW, tileH);
            try {
                LabLog.i("pixels", "tile-in " + ImageConvert.linearStats(tile));
            } catch (Throwable ignored) {
            }
            SimResult strip = null;
            try {
                JSONObject pj = new JSONObject(paramsJson.toString());
                pj.put("gpuExport", useGpu);
                SpektraParams tp = ParamsBuilder.fromJson(pj, inCs, false, false, 16384, true);
                long t0 = System.nanoTime();
                strip = eng.simulate(tile, tp, RenderKind.EXPORT, null);
                LabLog.i("export", "tile " + (t + 1) + "/" + nTiles
                        + " " + tileW + "x" + tileH
                        + " gpu=" + useGpu
                        + " ms=" + ((System.nanoTime() - t0) / 1_000_000L));
                try {
                    LabLog.i("pixels", "tile " + ImageConvert.sampleStats(strip));
                } catch (Throwable ignored) {
                }
                if (useGpu && ImageConvert.looksFlat(strip)) {
                    LabLog.w("export", "tile " + (t + 1) + " flat, CPU");
                    try {
                        strip.close();
                    } catch (Throwable ignored) {
                    }
                    strip = null;
                    pj.put("gpuExport", false);
                    useGpu = false;
                    tp = ParamsBuilder.fromJson(pj, inCs, false, false, 16384, true);
                    t0 = System.nanoTime();
                    strip = eng.simulate(tile, tp, RenderKind.EXPORT, null);
                    LabLog.i("export", "tile " + (t + 1) + " cpu-retry ms="
                            + ((System.nanoTime() - t0) / 1_000_000L));
                    try {
                        LabLog.i("pixels", "tile-retry " + ImageConvert.sampleStats(strip));
                    } catch (Throwable ignored) {
                    }
                }
                if (strip == null) throw new Exception("engine returned no image");
                int srcX = sliceY ? 0 : (inner0 - src0);
                int srcY = sliceY ? (inner0 - src0) : 0;
                int copyW = sliceY ? w : (inner1 - inner0);
                int copyH = sliceY ? (inner1 - inner0) : h;
                int dstX = sliceY ? 0 : inner0;
                int dstY = sliceY ? inner0 : 0;
                ImageConvert.blitSimToBitmap(strip, bmp, srcX, srcY, copyW, copyH, dstX, dstY);
            } finally {
                if (strip != null) {
                    try {
                        strip.close();
                    } catch (Throwable ignored) {
                    }
                }
                try {
                    tile.close();
                } catch (Throwable ignored) {
                }
                System.gc();
            }
        }
        try {
            LabLog.i("gpu", SpektraEngine.gpuDiagnostics());
        } catch (Throwable t) {
            LabLog.w("gpu", "diag failed " + t.getMessage());
        }
        return bmp;
    }

    static LinearImage applyCropIfNeeded(LinearImage image, JSONObject p) {
        if (image == null || p == null || !p.optBoolean("crop", false)) return image;
        int w = image.getWidth();
        int h = image.getHeight();
        float cx = (float) p.optDouble("cropCenterX", 0.5);
        float cy = (float) p.optDouble("cropCenterY", 0.5);
        float sx = (float) p.optDouble("cropSizeX", 0.35);
        float sy = (float) p.optDouble("cropSizeY", 0.35);
        int cw = Math.max(8, Math.round(w * sx));
        int ch = Math.max(8, Math.round(h * sy));
        if (cw > w) cw = w;
        if (ch > h) ch = h;
        int x0 = Math.round(cx * w - cw / 2f);
        int y0 = Math.round(cy * h - ch / 2f);
        if (x0 < 0) x0 = 0;
        if (y0 < 0) y0 = 0;
        if (x0 + cw > w) x0 = w - cw;
        if (y0 + ch > h) y0 = h - ch;
        try {
            p.put("crop", false);
        } catch (Exception ignored) {
        }
        return ImageConvert.copyRect(image, x0, y0, cw, ch);
    }

    private static SpektraEngine engine(Context ctx, boolean cache) throws Exception {
        if (!cache) {
            SpektraEngine e = SpektraEngine.fromAssets(ctx.getAssets());
            UserProfiles.attach(e, ctx);
            return e;
        }
        synchronized (ENG_LOCK) {
            if (cached == null) {
                cached = SpektraEngine.fromAssets(ctx.getAssets());
                UserProfiles.attach(cached, ctx);
                try {
                    SpektraEngine.setBigCores(0);
                    SpektraEngine.setParallelPool(1);
                } catch (Throwable ignored) {
                }
                Log.i(ExportService.TAG, "engine loaded (warm cache) bigCores="
                        + SpektraEngine.bigCoreCount());
            }
            return cached;
        }
    }

    private static boolean isolatedProcess() {
        if (Build.VERSION.SDK_INT >= 28) {
            String n = Application.getProcessName();
            return n != null && n.endsWith(":export");
        }
        return false;
    }

    private static LinearImage decodeSource(Context ctx, File file, boolean raw, JSONObject params) throws Exception {
        if (raw) {
            boolean daylight = WhiteBalance.needed(params);
            RawDecoder.Settings settings = new RawDecoder.Settings(
                    daylight
                            ? com.spectrafilm.libraw.WhiteBalance.DAYLIGHT
                            : com.spectrafilm.libraw.WhiteBalance.AS_SHOT,
                    6504.0,
                    1.0,
                    false,
                    0);
            LinearResult decoded;
            try (ParcelFileDescriptor pfd =
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)) {
                decoded = RawDecoder.INSTANCE.decodeToLinear(pfd.getFd(), settings);
            }
            Log.i(ExportService.TAG, "RAW " + decoded.getWidth() + "x" + decoded.getHeight());
            return Images.wrap(
                    decoded.getData(), decoded.getWidth(), decoded.getHeight(), decoded.getColorSpace());
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth < 8 || bounds.outHeight < 8) throw new Exception("Could not open that JPEG or photo");
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = 1;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        opts.inScaled = false;
        opts.inDither = false;
        if (Build.VERSION.SDK_INT >= 26) {
            opts.inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB);
        }
        Bitmap decodedBmp = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
        if (decodedBmp == null) throw new Exception("Could not open that JPEG or photo");
        decodedBmp = applyExif(decodedBmp, file.getAbsolutePath());
        try {
            LinearImage img = ImageConvert.bitmapToLinearProPhoto(decodedBmp, true, false);
            Log.i(ExportService.TAG, "JPEG " + img.getWidth() + "x" + img.getHeight());
            return img;
        } finally {
            decodedBmp.recycle();
        }
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

    private static void releaseImage(LinearImage img, boolean raw) {
        if (img == null) return;
        ByteBuffer data = Images.bytes(img);
        if (raw) {
            try {
                RawDecoder.INSTANCE.freeOffHeap(data);
            } catch (Throwable ignored) {
            }
        } else {
            try {
                img.close();
            } catch (Throwable ignored) {
            }
        }
    }

    /** Spektrafilm ImagePipeline.saveToGallery: Bitmap.compress into the MediaStore stream. */
    static android.net.Uri saveEncoded(Context ctx, String name, String mime, byte[] data)
            throws Exception {
        if (data == null || data.length == 0) throw new Exception("Файл экспорта пуст");
        return VerifiedMediaWriter.save(ctx, name, mime, output -> output.write(data));
    }

    private static android.net.Uri writeBitmap(
            Context ctx, String name, String mime, int quality, Bitmap bmp) throws Exception {
        boolean png = mime != null && mime.toLowerCase(java.util.Locale.ROOT).contains("png");
        Bitmap.CompressFormat format = png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG;
        int q = png ? 100 : Math.max(70, Math.min(100, quality));
        return VerifiedMediaWriter.save(ctx, name, mime, output -> {
            if (!bmp.compress(format, q, output)) throw new java.io.IOException("Не удалось закодировать изображение");
        });
    }

    private static void rememberLast(Context ctx, String name, android.net.Uri uri, int w, int h) {
        try {
            File f = new File(ctx.getFilesDir(), "spektra-last-export.json");
            String json = "{\"ok\":true"
                    + ",\"name\":" + jsonQuote(name)
                    + ",\"uri\":" + jsonQuote(uri != null ? uri.toString() : "")
                    + ",\"w\":" + w
                    + ",\"h\":" + h
                    + ",\"t\":" + System.currentTimeMillis()
                    + "}";
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
        }
    }

    private static String jsonQuote(String s) {
        if (s == null) return "\"\"";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
