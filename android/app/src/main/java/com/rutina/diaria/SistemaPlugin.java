package com.rutina.diaria;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Window;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Lo poco de Android que la parte web no alcanza: barras del sistema, guardar archivos y compartir. */
@CapacitorPlugin(name = "Sistema")
public class SistemaPlugin extends Plugin {

    /** Pinta el fondo de las barras del sistema y elige iconos claros u oscuros. */
    @PluginMethod
    public void barras(PluginCall call) {
        String color = call.getString("color", "#000000");
        boolean oscuro = Boolean.TRUE.equals(call.getBoolean("oscuro", true));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                int c = Color.parseColor(color);
                // En Android 15 la app va de borde a borde: lo que se ve detrás de las barras es este fondo.
                w.getDecorView().setBackgroundColor(c);
                if (Build.VERSION.SDK_INT < 35) {
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                }
                WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(w, w.getDecorView());
                ic.setAppearanceLightStatusBars(!oscuro);
                ic.setAppearanceLightNavigationBars(!oscuro);
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudieron pintar las barras", e);
            }
        });
    }

    /** Abre el selector de Android para que elijas dónde guardar el archivo (Descargas, Drive…). */
    @PluginMethod
    public void guardar(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(call.getString("tipo", "application/json"));
        i.putExtra(Intent.EXTRA_TITLE, call.getString("nombre", "rutina.json"));
        startActivityForResult(call, i, "alGuardar");
    }

    @ActivityCallback
    private void alGuardar(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject();
            r.put("guardado", false);
            call.resolve(r);
            return;
        }
        Uri uri = data.getData();
        try (OutputStream os = getContext().getContentResolver().openOutputStream(uri)) {
            if (os == null) throw new IllegalStateException("sin salida");
            os.write(call.getString("texto", "").getBytes(StandardCharsets.UTF_8));
            JSObject r = new JSObject();
            r.put("guardado", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo guardar el archivo", e);
        }
    }

    /** Menú de compartir de Android con un texto (para mandarlo a una IA, WhatsApp, etc.). */
    @PluginMethod
    public void compartir(PluginCall call) {
        try {
            String titulo = call.getString("titulo", "Compartir");
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, titulo);
            send.putExtra(Intent.EXTRA_TEXT, call.getString("texto", ""));
            Intent chooser = Intent.createChooser(send, titulo);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir", e);
        }
    }

    /** Pantalla de ajustes de la app, para devolver un permiso que se negó. */
    @PluginMethod
    public void abrirAjustesApp(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudieron abrir los ajustes", e);
        }
    }
}
