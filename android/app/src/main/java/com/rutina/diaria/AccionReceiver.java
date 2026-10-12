package com.rutina.diaria;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** Botones de la notificación: Listo, Posponer y Apagar. */
public class AccionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        try {
            JSONObject a = new JSONObject(intent.getStringExtra(Alarmas.EXTRA));
            atender(c, intent.getAction(), a);
        } catch (Exception ignored) {}
    }

    static void atender(Context c, String accion, JSONObject a) throws Exception {
        Alarmas.quitar(c, a);
        if (Alarmas.ACCION_HECHO.equals(accion)) {
            // la app lo marca como cumplido la próxima vez que se abra
            JSONObject h = new JSONObject();
            h.put("accion", "hecho");
            h.put("ref", a.optString("ref"));
            h.put("dia", a.optString("dia"));
            h.put("at", System.currentTimeMillis());
            Alarmas.guardarAccion(c, h);
        } else if (Alarmas.ACCION_POSPONER.equals(accion)) {
            JSONObject otra = new JSONObject(a.toString());
            otra.put("id", a.optString("id") + ":p" + System.currentTimeMillis());
            otra.put("at", System.currentTimeMillis() + Alarmas.POSPONER_MS);
            Alarmas.agregar(c, otra);
        }
    }
}
