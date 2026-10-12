package com.rutina.diaria;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** Llega la hora de un aviso: muestra la notificación (y la pantalla completa si es alarma). */
public class AlarmaReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Alarmas.ACCION_SONAR.equals(intent.getAction())) return;
        try {
            JSONObject a = new JSONObject(intent.getStringExtra(Alarmas.EXTRA));
            Alarmas.crearCanales(c);
            Alarmas.mostrar(c, a);
        } catch (Exception ignored) {}
    }
}
