package com.rutina.diaria;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarioPlugin.class);
        registerPlugin(SistemaPlugin.class);
        registerPlugin(AlarmasPlugin.class);
        super.onCreate(savedInstanceState);
        Alarmas.crearCanales(this);
    }
}
