package app.spektrafilm.lab;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

/**
 * Spektrafilm-android export surface: a foreground Activity with no WebView.
 * Chromium stays in the {@code :ui} process; this default process is the same
 * memory profile as Spektrafilm-v0.8.0 (engine + LibRaw + Bitmap.compress).
 */
public class ExportActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextView status;
    private Button done;
    private volatile boolean finished;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_export);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        status = findViewById(R.id.export_status);
        done = findViewById(R.id.export_done);
        done.setOnClickListener((v) -> finishWith(false, "cancelled"));
        ExportService.cancelled.set(false);
        LabLog.init(this);
        LabLog.i("export", "activity start");
        final Intent job = getIntent();
        new Thread(
                        () -> {
                            try {
                                Bundle out = ExportWorker.run(getApplicationContext(), job);
                                ExportService.writeStatusFor(getApplicationContext(), out);
                                main.post(() -> finishWithBundle(true, out));
                            } catch (Throwable t) {
                                String err = ExportService.messageOf(t.getCause() != null ? t.getCause() : t);
                                LabLog.e("export", "activity failed " + err, t);
                                Bundle fail = ExportService.failBundle(err);
                                ExportService.writeStatusFor(getApplicationContext(), fail);
                                main.post(() -> finishWith(false, err));
                            }
                        },
                        "spektra-export")
                .start();
    }

    @Override
    public void onBackPressed() {
        ExportService.cancelled.set(true);
        super.onBackPressed();
    }

    private void finishWith(boolean ok, String error) {
        Bundle b = ok ? new Bundle() : ExportService.failBundle(error);
        if (ok) b.putBoolean("ok", true);
        finishWithBundle(ok, b);
    }

    private void finishWithBundle(boolean ok, Bundle out) {
        if (finished) return;
        finished = true;
        Intent data = new Intent();
        if (out != null) data.putExtras(out);
        setResult(ok ? RESULT_OK : RESULT_CANCELED, data);
        if (ok) {
            int w = out != null ? out.getInt("width", 0) : 0;
            int h = out != null ? out.getInt("height", 0) : 0;
            status.setText(w > 0 ? "Сохранено " + w + "×" + h + "\nPictures/Spektrafilm" : "Сохранено в Pictures/Spektrafilm");
            done.setVisibility(android.view.View.VISIBLE);
            main.postDelayed(this::finish, 900);
        } else {
            status.setText(out != null && out.getString("error") != null
                    ? out.getString("error")
                    : "Экспорт не удался");
            done.setVisibility(android.view.View.VISIBLE);
        }
    }
}
