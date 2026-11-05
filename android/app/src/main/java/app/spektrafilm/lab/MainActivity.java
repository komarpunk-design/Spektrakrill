package app.spektrafilm.lab;

import android.Manifest;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RawDecoderPlugin.class);
        super.onCreate(savedInstanceState);
        LabLog.init(this);
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            LabLog.e("crash", "uncaught in " + t, e);
        });
        try {
            Window w = getWindow();
            WindowCompat.setDecorFitsSystemWindows(w, false);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            if (c != null) {
                c.setAppearanceLightStatusBars(false);
                c.setAppearanceLightNavigationBars(false);
            }
        } catch (Throwable ignored) {
        }
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 42);
            } catch (Throwable ignored) {
            }
        }
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            }
        } catch (Throwable ignored) {
        }
    }
}