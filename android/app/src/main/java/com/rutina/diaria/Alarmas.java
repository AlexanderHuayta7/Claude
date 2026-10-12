package com.rutina.diaria;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
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
 * Cada aviso es un JSON: { id, at, titulo, texto, tipo: "alarma" | "aviso", ref, dia, sonido, vib }.
 * vib es el tipo de vibración que elegiste ("none", "corta", "doble", "larga", "latido", "insistente").
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

    static final int COLOR = 0xFF8E1B2E;
    static final long POSPONER_MS = 10 * 60 * 1000L;

    private Alarmas() {}

    /* ───────── vibraciones ───────── */

    static final String[] VIBS = { "none", "corta", "doble", "larga", "latido", "insistente" };

    /** Los mismos patrones que muestra la app (VIBS en app.js): pausa, vibra, pausa, vibra… */
    static long[] patron(String vib) {
        switch (vib) {
            case "corta": return new long[] { 0, 250 };
            case "doble": return new long[] { 0, 180, 120, 180 };
            case "larga": return new long[] { 0, 900 };
            case "latido": return new long[] { 0, 120, 90, 120, 500, 120, 90, 120 };
            case "insistente": return new long[] { 0, 500, 300, 500, 300, 500, 300, 500 };
            default: return null;
        }
    }

    private static String nombreVib(String vib) {
        switch (vib) {
            case "none": return "sin vibrar";
            case "corta": return "vibración corta";
            case "doble": return "vibración doble";
            case "larga": return "vibración larga";
            case "latido": return "vibración latido";
            default: return "vibración insistente";
        }
    }

    /** Lo que llega de la app, o de una versión anterior que solo sabía "vibrar sí/no". */
    static String vibDe(JSONObject a, boolean alarma) {
        String v = a.optString("vib", "");
        for (String ok : VIBS) if (ok.equals(v)) return v;
        if (!a.optBoolean("vibrar", true)) return "none";
        return alarma ? "insistente" : "doble";
    }

    /* ───────── canales ─────────
       Android fija la vibración de cada canal al crearlo y no deja cambiarla después,
       así que hay un canal por cada combinación que se usa. Se crean cuando hacen falta. */

    static final String GRUPO_ALARMAS = "rt_alarmas";
    static final String GRUPO_AVISOS = "rt_avisos";

    static String canal(Context c, boolean alarma, boolean sonido, String vib) {
        String id = alarma ? "rt_alarma_" + (sonido ? "son_" : "mute_") + vib : "rt_aviso_" + vib;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(id) != null) return id;
        String nombre = (alarma ? (sonido ? "Alarma" : "Alarma sin sonido") : "Notificación") + " · " + nombreVib(vib);
        NotificationChannel ch = new NotificationChannel(id, nombre, NotificationManager.IMPORTANCE_HIGH);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        long[] p = patron(vib);
        ch.enableVibration(p != null);
        if (p != null) ch.setVibrationPattern(p);
        if (alarma) {
            ch.setGroup(GRUPO_ALARMAS);
            ch.setDescription("Suenan como alarma hasta que las marcas, las pospones o las apagas");
            ch.setBypassDnd(true);
            if (sonido) {
                AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                ch.setSound(sonidoAlarma(), aa);
            } else {
                ch.setSound(null, null);
            }
        } else {
            ch.setGroup(GRUPO_AVISOS);
            ch.setDescription("Hábitos, imprevistos y tareas con hora, exámenes y el repaso de la noche");
        }
        nm.createNotificationChannel(ch);
        return id;
    }

    static void crearCanales(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        // los de versiones anteriores tenían una sola vibración; se reemplazan
        for (String viejo : new String[] {
            "rutina_alarmas", "rutina_sonido", "rutina_vibracion", "rutina_silencio",
            "rutina_alarma", "rutina_alarma_sonido", "rutina_alarma_vibra", "rutina_alarma_muda", "rutina_avisos"
        }) {
            if (nm.getNotificationChannel(viejo) != null) nm.deleteNotificationChannel(viejo);
        }
        nm.createNotificationChannelGroup(new NotificationChannelGroup(GRUPO_ALARMAS, "Alarmas"));
        nm.createNotificationChannelGroup(new NotificationChannelGroup(GRUPO_AVISOS, "Recordatorios"));
        // los de siempre, para que aparezcan en los ajustes desde el principio
        canal(c, true, true, "insistente");
        canal(c, false, false, "doble");
    }

    /** ¿Algún canal de alarmas está apagado en los ajustes de Android? */
    static boolean alarmasBloqueadas(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return false;
        for (NotificationChannel ch : nm.getNotificationChannels()) {
            if (ch.getId().startsWith("rt_alarma_") && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return true;
        }
        return false;
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
        String canal = canal(c, alarma, alarma && a.optBoolean("sonido", true), vibDe(a, alarma));
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
