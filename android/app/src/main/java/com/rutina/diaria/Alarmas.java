package com.rutina.diaria;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Alarmas y recordatorios de Rutina, sin depender de que la app esté abierta.
 *
 * Cada aviso es un JSON: { id, at, titulo, texto, tipo: "alarma" | "aviso", ref, dia, sonido, vibrar }.
 * La lista completa se guarda para volver a programarla si el teléfono se reinicia.
 * Las "alarmas" suenan con el sonido de alarma, se repiten hasta que respondes y se
 * muestran a pantalla completa; los "avisos" son notificaciones normales.
 */
final class Alarmas {

    static final String PREFS = "rutina_alarmas";
    static final String K_LISTA = "lista";
    static final String K_ACCIONES = "acciones";
    static final String EXTRA = "aviso";

    static final String ACCION_SONAR = "com.rutina.diaria.SONAR";
    static final String ACCION_HECHO = "com.rutina.diaria.HECHO";
    static final String ACCION_POSPONER = "com.rutina.diaria.POSPONER";
    static final String ACCION_APAGAR = "com.rutina.diaria.APAGAR";

    static final String CANAL_AVISOS = "rutina_avisos";
    static final int COLOR = 0xFF8E1B2E;
    static final long POSPONER_MS = 10 * 60 * 1000L;

    private Alarmas() {}

    /* ───────── canales ───────── */

    static String canalAlarma(boolean sonido, boolean vibrar) {
        if (sonido && vibrar) return "rutina_alarma";
        if (sonido) return "rutina_alarma_sonido";
        if (vibrar) return "rutina_alarma_vibra";
        return "rutina_alarma_muda";
    }

    static void crearCanales(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        // los de la versión 4.0 sonaban como una notificación más; se reemplazan
        for (String viejo : new String[] { "rutina_alarmas", "rutina_sonido", "rutina_vibracion", "rutina_silencio" }) {
            nm.deleteNotificationChannel(viejo);
        }
        canalAlarma(nm, "rutina_alarma", "Alarmas", true, true);
        canalAlarma(nm, "rutina_alarma_sonido", "Alarmas sin vibración", true, false);
        canalAlarma(nm, "rutina_alarma_vibra", "Alarmas solo con vibración", false, true);
        canalAlarma(nm, "rutina_alarma_muda", "Alarmas en silencio", false, false);

        NotificationChannel av = new NotificationChannel(CANAL_AVISOS, "Recordatorios", NotificationManager.IMPORTANCE_HIGH);
        av.setDescription("Tareas por entregar, exámenes, hábitos con hora y el repaso de la noche");
        av.enableVibration(true);
        av.setVibrationPattern(new long[] { 0, 180, 120, 180 });
        av.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(av);
    }

    private static void canalAlarma(NotificationManager nm, String id, String nombre, boolean sonido, boolean vibrar) {
        NotificationChannel ch = new NotificationChannel(id, nombre, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Suenan como alarma hasta que las marcas, las pospones o las apagas");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(true);
        ch.enableVibration(vibrar);
        if (vibrar) ch.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });
        if (sonido) {
            AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            ch.setSound(sonidoAlarma(), aa);
        } else {
            ch.setSound(null, null);
        }
        nm.createNotificationChannel(ch);
    }

    private static Uri sonidoAlarma() {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }

    /* ───────── programar ───────── */

    static int codigo(String id) {
        return id.hashCode() & 0x7fffffff;
    }

    private static PendingIntent intentSonar(Context c, JSONObject a, int flags) {
        String id = a.optString("id");
        Intent i = new Intent(c, AlarmaReceiver.class);
        i.setAction(ACCION_SONAR);
        i.setData(Uri.parse("rutina://aviso/" + Uri.encode(id)));
        i.putExtra(EXTRA, a.toString());
        return PendingIntent.getBroadcast(c, codigo(id), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean exactasPermitidas(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    static void programarUno(Context c, JSONObject a) {
        long at = a.optLong("at");
        if (at <= System.currentTimeMillis()) return;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = intentSonar(c, a, PendingIntent.FLAG_UPDATE_CURRENT);
        boolean alarma = "alarma".equals(a.optString("tipo"));
        try {
            if (exactasPermitidas(c)) {
                if (alarma) {
                    // como un despertador: Android no lo retrasa ni con ahorro de batería
                    Intent abrir = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    PendingIntent ver = PendingIntent.getActivity(c, codigo(a.optString("id")), abrir,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, ver), pi);
                } else {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                }
                return;
            }
        } catch (SecurityException ignored) {
            // sin permiso de alarmas exactas: va la versión aproximada
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static void cancelarUno(Context c, JSONObject a) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = intentSonar(c, a, PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            if (am != null) am.cancel(pi);
            pi.cancel();
        }
    }

    /** Reemplaza todo lo programado por la lista nueva y la guarda. */
    static synchronized int programarTodo(Context c, JSONArray nuevos) {
        JSONArray viejos = lista(c);
        for (int i = 0; i < viejos.length(); i++) {
            JSONObject a = viejos.optJSONObject(i);
            if (a != null) cancelarUno(c, a);
        }
        JSONArray futuros = new JSONArray();
        long ahora = System.currentTimeMillis();
        for (int i = 0; i < nuevos.length(); i++) {
            JSONObject a = nuevos.optJSONObject(i);
            if (a == null || a.optLong("at") <= ahora) continue;
            programarUno(c, a);
            futuros.put(a);
        }
        prefs(c).edit().putString(K_LISTA, futuros.toString()).apply();
        return futuros.length();
    }

    /** Tras reiniciar el teléfono o cambiar la hora: vuelve a programar lo que sigue pendiente. */
    static synchronized void reprogramarGuardados(Context c) {
        programarTodo(c, lista(c));
    }

    static synchronized void agregar(Context c, JSONObject a) {
        JSONArray l = lista(c);
        l.put(a);
        prefs(c).edit().putString(K_LISTA, l.toString()).apply();
        programarUno(c, a);
    }

    static JSONArray lista(Context c) {
        try {
            return new JSONArray(prefs(c).getString(K_LISTA, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ───────── lo que hiciste desde la notificación ───────── */

    static synchronized void guardarAccion(Context c, JSONObject accion) {
        try {
            JSONArray l = new JSONArray(prefs(c).getString(K_ACCIONES, "[]"));
            l.put(accion);
            prefs(c).edit().putString(K_ACCIONES, l.toString()).apply();
        } catch (Exception ignored) {}
    }

    static synchronized JSONArray tomarAcciones(Context c) {
        JSONArray l;
        try {
            l = new JSONArray(prefs(c).getString(K_ACCIONES, "[]"));
        } catch (Exception e) {
            l = new JSONArray();
        }
        prefs(c).edit().putString(K_ACCIONES, "[]").apply();
        return l;
    }

    /* ───────── mostrar ───────── */

    private static PendingIntent intentAccion(Context c, JSONObject a, String accion) {
        Intent i = new Intent(c, AccionReceiver.class);
        i.setAction(accion);
        i.setData(Uri.parse("rutina://accion/" + Uri.encode(a.optString("id"))));
        i.putExtra(EXTRA, a.toString());
        return PendingIntent.getBroadcast(c, codigo(a.optString("id") + accion), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void mostrar(Context c, JSONObject a) {
        String id = a.optString("id");
        boolean alarma = "alarma".equals(a.optString("tipo"));
        boolean marcable = a.optString("ref").length() > 2;
        String canal = alarma ? canalAlarma(a.optBoolean("sonido", true), a.optBoolean("vibrar", true)) : CANAL_AVISOS;
        String titulo = a.optString("titulo", "Rutina");
        String texto = a.optString("texto", "");

        Intent abrir = new Intent(c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent abrirApp = PendingIntent.getActivity(c, codigo(id + "abrir"), abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, canal)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(COLOR)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setContentIntent(abrirApp)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setWhen(a.optLong("at", System.currentTimeMillis()))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (alarma) {
            Intent pantalla = new Intent(c, AlarmaActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                .putExtra(EXTRA, a.toString());
            PendingIntent full = PendingIntent.getActivity(c, codigo(id + "pantalla"), pantalla,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setFullScreenIntent(full, true)
                .setOngoing(true)
                .setTimeoutAfter(10 * 60 * 1000L);   // si nadie la toca, deja de sonar a los 10 minutos
            if (marcable) b.addAction(0, "Listo", intentAccion(c, a, ACCION_HECHO));
            b.addAction(0, "Posponer 10 min", intentAccion(c, a, ACCION_POSPONER));
            b.addAction(0, "Apagar", intentAccion(c, a, ACCION_APAGAR));
        } else {
            b.setCategory(NotificationCompat.CATEGORY_REMINDER).setPriority(NotificationCompat.PRIORITY_HIGH);
            if (marcable) b.addAction(0, "Listo", intentAccion(c, a, ACCION_HECHO));
        }

        Notification n = b.build();
        if (alarma) n.flags |= Notification.FLAG_INSISTENT;   // el sonido se repite hasta que respondas
        try {
            NotificationManagerCompat.from(c).notify(codigo(id), n);
        } catch (SecurityException ignored) {
            // sin permiso de notificaciones no hay nada que mostrar
        }
    }

    static void quitar(Context c, JSONObject a) {
        NotificationManagerCompat.from(c).cancel(codigo(a.optString("id")));
    }
}
