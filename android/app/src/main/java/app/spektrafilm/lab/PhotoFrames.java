package app.spektrafilm.lab;

import android.graphics.Bitmap;

/** Delegates exclusively to the original spektra-zh compositor. */
final class PhotoFrames {
    static Bitmap apply(Bitmap source, org.json.JSONObject params) {
        String style = params.optString("frameStyle", "none");
        FilmEdgeStyle original = style.equals("135") || style.equals("film") ? FilmEdgeStyle.F135
                : style.equals("120") ? FilmEdgeStyle.F120
                : style.equals("minimal") ? FilmEdgeStyle.MINIMAL : FilmEdgeStyle.NONE;
        String date = params.optString("frameDate", "");
        if (date.length() > 32) date = date.substring(0, 32);
        FilmEdgeSettings settings = new FilmEdgeSettings(original, date,
                Math.max(1, Math.min(99, params.optInt("frameNumber", 18))),
                params.optBoolean("frameBarcode", true));
        return FilmEdgeKt.composeFilmEdge(source, settings, params.optString("frameStockLabel", "SPEKTRAFILM"));
    }
    private PhotoFrames() {}
}
