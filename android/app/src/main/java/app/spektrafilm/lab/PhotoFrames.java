package app.spektrafilm.lab;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;

/** Frames are composited after orientation/crop, before encoding. The source is never cropped. */
final class PhotoFrames {
    static Bitmap apply(Bitmap source, String style, double width) {
        if (!style.equals("white") && !style.equals("black") && !style.equals("instant") && !style.equals("film")) return source;
        double ratio = Double.isNaN(width) || Double.isInfinite(width) ? 0.04 : Math.max(0.01, Math.min(0.2, width));
        int p = Math.max(1, (int) Math.round(Math.min(source.getWidth(), source.getHeight()) * ratio));
        int top = style.equals("film") ? 2 * p : p;
        int bottom = style.equals("instant") ? 3 * p : top;
        int w = source.getWidth() + 2 * p;
        int h = source.getHeight() + top + bottom;
        Bitmap result;
        if (Build.VERSION.SDK_INT >= 26 && source.getColorSpace() != null) {
            result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888, false, source.getColorSpace());
        } else result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(result);
            canvas.drawColor(Color.parseColor(style.equals("black") || style.equals("film") ? "#141414" : "#f5f2e9"));
            canvas.drawBitmap(source, p, top, null);
            if (style.equals("film")) {
                Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
                paint.setColor(Color.parseColor("#ddd5bc"));
                int holeW = Math.max(1, (int) Math.round(p * 0.7));
                int holeH = Math.max(1, (int) Math.round(p * 0.48));
                int step = Math.max(2, (int) Math.round(p * 1.4));
                int offset = (int) Math.round(p * 0.25);
                for (int x = p; x + holeW <= w - p; x += step) {
                    canvas.drawRect(x, offset, x + holeW, offset + holeH, paint);
                    canvas.drawRect(x, h - offset - holeH, x + holeW, h - offset, paint);
                }
                paint.setColor(Color.parseColor("#dc9e40"));
                paint.setTypeface(Typeface.MONOSPACE);
                paint.setTextSize(Math.max(1, (int) Math.round(p * 0.42)));
                canvas.drawText("SPEKTRAFILM  35", p, (int) Math.round(p * 1.55), paint);
                canvas.drawText("01  >", p, h - (int) Math.round(p * 0.95), paint);
            }
            return result;
        } catch (RuntimeException | Error failure) {
            result.recycle(); throw failure;
        }
    }
    private PhotoFrames() {}
}
