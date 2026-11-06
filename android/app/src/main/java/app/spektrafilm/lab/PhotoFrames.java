package app.spektrafilm.lab;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;

/** Frames are composited after orientation/crop, before encoding. The source is never cropped. */
final class PhotoFrames {
    static Bitmap apply(Bitmap source, org.json.JSONObject params) {
        String style = params.optString("frameStyle", "none");
        double width = params.optDouble("whitePadding", 0.04);
        FilmEdgeStyle original = style.equals("135") || style.equals("film") ? FilmEdgeStyle.F135 : style.equals("120") ? FilmEdgeStyle.F120 : style.equals("minimal") ? FilmEdgeStyle.MINIMAL : null;
        if (original != null) {
            String date = params.optString("frameDate", "");
            if (date.length() > 32) date = date.substring(0, 32);
            FilmEdgeSettings settings = new FilmEdgeSettings(original, date, Math.max(1,Math.min(99,params.optInt("frameNumber",18))), params.optBoolean("frameBarcode",true));
            return FilmEdgeKt.composeFilmEdge(source, settings, params.optString("frameStockLabel","SPEKTRAFILM"));
        }
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

            return result;
        } catch (RuntimeException | Error failure) {
            result.recycle(); throw failure;
        }
    }
    private PhotoFrames() {}
}
