package com.rutina.diaria;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android borra las alarmas al reiniciar o al cambiar la hora: aquí se vuelven a poner. */
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        Alarmas.crearCanales(c);
        Alarmas.reprogramarGuardados(c);
    }
}
