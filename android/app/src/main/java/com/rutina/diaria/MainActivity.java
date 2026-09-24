package com.rutina.diaria;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarioPlugin.class);
        registerPlugin(SistemaPlugin.class);
        super.onCreate(savedInstanceState);
        crearCanales();
    }

    /**
     * Canales de las alarmas. Android fija el sonido y la vibración de cada canal
     * al crearlo, así que hay uno por combinación y la app elige según los
     * interruptores de Ajustes.
     */
    private void crearCanales() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        canal(nm, "rutina_alarmas", "Alarmas", true, true);
        canal(nm, "rutina_sonido", "Alarmas sin vibración", true, false);
        canal(nm, "rutina_vibracion", "Alarmas sin sonido", false, true);
        canal(nm, "rutina_silencio", "Avisos en silencio", false, false);
    }

    private void canal(NotificationManager nm, String id, String nombre, boolean sonido, boolean vibra) {
        NotificationChannel c = new NotificationChannel(id, nombre, NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Avisos de tus hábitos, imprevistos y tareas");
        c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        c.enableVibration(vibra);
        if (vibra) c.setVibrationPattern(new long[] { 0, 220, 110, 220, 110, 320 });
        if (sonido) {
            AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            c.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), aa);
        } else {
            c.setSound(null, null);
        }
        nm.createNotificationChannel(c);
    }
}
