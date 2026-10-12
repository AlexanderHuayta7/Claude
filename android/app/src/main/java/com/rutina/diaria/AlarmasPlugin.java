package com.rutina.diaria;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

/** Puente entre la app y las alarmas nativas (ver Alarmas). */
@CapacitorPlugin(
    name = "Alarmas",
    permissions = { @Permission(alias = "notificaciones", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class AlarmasPlugin extends Plugin {

    @Override
    public void load() {
        Alarmas.crearCanales(getContext());
    }

    private JSObject estadoActual() {
        Context c = getContext();
        JSObject o = new JSObject();
        o.put("notificaciones", NotificationManagerCompat.from(c).areNotificationsEnabled());
        o.put("exactas", Alarmas.exactasPermitidas(c));
        boolean full = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            full = nm != null && nm.canUseFullScreenIntent();
        }
        o.put("pantallaCompleta", full);
        PowerManager pm = c.getSystemService(PowerManager.class);
        o.put("bateria", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        o.put("canalAlarmas", !Alarmas.alarmasBloqueadas(c));
        o.put("android", Build.VERSION.SDK_INT);
        o.put("fabricante", Build.MANUFACTURER);

        JSONArray l = Alarmas.lista(c);
        long ahora = System.currentTimeMillis(), prox = Long.MAX_VALUE;
        String proxTitulo = "";
        int n = 0;
        for (int i = 0; i < l.length(); i++) {
            JSONObject a = l.optJSONObject(i);
            if (a == null || a.optLong("at") <= ahora) continue;
            n++;
            if (a.optLong("at") < prox) { prox = a.optLong("at"); proxTitulo = a.optString("titulo"); }
        }
        o.put("programados", n);
        if (n > 0) {
            o.put("proximoAt", prox);
            o.put("proximoTitulo", proxTitulo);
        }
        return o;
    }

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    /** Pide el permiso de notificaciones (Android 13+). En versiones anteriores no hace falta. */
    @PluginMethod
    public void permitir(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notificaciones") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificaciones", call, "alPermitir");
        } else {
            call.resolve(estadoActual());
        }
    }

    @PermissionCallback
    private void alPermitir(PluginCall call) {
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void programar(PluginCall call) {
        JSArray avisos = call.getArray("avisos");
        if (avisos == null) avisos = new JSArray();
        int n = Alarmas.programarTodo(getContext(), avisos);
        JSObject r = estadoActual();
        r.put("programados", n);
        call.resolve(r);
    }

    /** Lo que marcaste como "Listo" desde una notificación mientras la app estaba cerrada. */
    @PluginMethod
    public void pendientes(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("acciones", new JSArray(Alarmas.tomarAcciones(getContext()).toString()));
        } catch (Exception e) {
            r.put("acciones", new JSArray());
        }
        call.resolve(r);
    }

    /** Una alarma de prueba dentro de unos segundos, para oír cómo suena. */
    @PluginMethod
    public void probar(PluginCall call) {
        try {
            int seg = call.getInt("segundos", 5);
            JSONObject a = new JSONObject();
            a.put("id", "prueba:" + System.currentTimeMillis());
            a.put("at", System.currentTimeMillis() + seg * 1000L);
            a.put("titulo", call.getString("titulo", "Así suena tu alarma"));
            a.put("texto", call.getString("texto", "Si la escuchas, todo está listo."));
            a.put("tipo", call.getString("tipo", "alarma"));
            a.put("ref", "");
            a.put("sonido", Boolean.TRUE.equals(call.getBoolean("sonido", true)));
            a.put("vib", call.getString("vib", "insistente"));
            Alarmas.agregar(getContext(), a);
            call.resolve(estadoActual());
        } catch (Exception e) {
            call.reject("No se pudo programar la prueba", e);
        }
    }

    /** Para sentir una vibración antes de elegirla (con la app abierta Android sí deja vibrar). */
    @PluginMethod
    public void vibrar(PluginCall call) {
        long[] p = Alarmas.patron(call.getString("patron", "doble"));
        if (p == null) {
            call.resolve();
            return;
        }
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = getContext().getSystemService(VibratorManager.class);
                v = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                v = getContext().getSystemService(Vibrator.class);
            }
            if (v != null && v.hasVibrator()) {
                v.cancel();
                v.vibrate(VibrationEffect.createWaveform(p, -1));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo vibrar", e);
        }
    }

    /** Intenta abrir cada pantalla en orden; Xiaomi cambia sus nombres entre versiones. */
    private boolean abrirPrimera(Context c, Intent... opciones) {
        for (Intent i : opciones) {
            try {
                c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    /** Abre la pantalla de Android donde se arregla cada cosa. */
    @PluginMethod
    public void abrir(PluginCall call) {
        Context c = getContext();
        String que = call.getString("que", "app");
        String pkg = c.getPackageName();
        Intent detalles = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        if ("miui-autostart".equals(que)) {
            boolean ok = abrirPrimera(c,
                new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
                new Intent("miui.intent.action.OP_AUTO_START").addCategory(Intent.CATEGORY_DEFAULT),
                detalles);
            if (ok) call.resolve(); else call.reject("No se pudo abrir los ajustes");
            return;
        }
        if ("miui-permisos".equals(que)) {
            boolean ok = abrirPrimera(c,
                new Intent("miui.intent.action.APP_PERM_EDITOR")
                    .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                    .putExtra("extra_pkgname", pkg),
                new Intent("miui.intent.action.APP_PERM_EDITOR")
                    .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity")
                    .putExtra("extra_pkgname", pkg),
                detalles);
            if (ok) call.resolve(); else call.reject("No se pudo abrir los ajustes");
            return;
        }
        Intent i;
        switch (que) {
            case "cuentas":
                i = new Intent(Settings.ACTION_SYNC_SETTINGS);
                break;
            case "notificaciones":
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "exactas":
                i = Build.VERSION.SDK_INT >= 31
                    ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg))
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                break;
            case "pantalla":
                i = Build.VERSION.SDK_INT >= 34
                    ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg))
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                break;
            case "bateria":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
                break;
            default:
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            c.startActivity(i);
        } catch (Exception e) {
            try {
                c.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
                call.reject("No se pudo abrir los ajustes");
                return;
            }
        }
        call.resolve();
    }
}
