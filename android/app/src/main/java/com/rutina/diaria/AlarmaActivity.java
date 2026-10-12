package com.rutina.diaria;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** La alarma a pantalla completa, incluso con el teléfono bloqueado. */
public class AlarmaActivity extends Activity {

    private JSONObject aviso;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(0xFF5C010E);
        getWindow().setNavigationBarColor(0xFF5C010E);

        try {
            aviso = new JSONObject(getIntent().getStringExtra(Alarmas.EXTRA));
        } catch (Exception e) {
            finish();
            return;
        }
        setContentView(construir());
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private View construir() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setBackgroundColor(0xFF5C010E);
        col.setPadding(dp(28), dp(72), dp(28), dp(40));

        ImageView zorro = new ImageView(this);
        zorro.setImageResource(R.mipmap.ic_launcher_foreground);
        col.addView(zorro, new LinearLayout.LayoutParams(dp(150), dp(150)));
        // respira despacito mientras suena
        ObjectAnimator latido = ObjectAnimator.ofPropertyValuesHolder(zorro,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.06f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.06f));
        latido.setDuration(1100);
        latido.setRepeatCount(ValueAnimator.INFINITE);
        latido.setRepeatMode(ValueAnimator.REVERSE);
        latido.start();

        TextView hora = texto(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(aviso.optLong("at", System.currentTimeMillis()))), 64, true, 0xFFFFFFFF);
        hora.setPadding(0, dp(18), 0, 0);
        col.addView(hora);

        TextView titulo = texto(aviso.optString("titulo", "Rutina"), 26, true, 0xFFFFFFFF);
        titulo.setPadding(0, dp(6), 0, dp(6));
        col.addView(titulo);

        String t = aviso.optString("texto", "");
        if (!t.isEmpty()) col.addView(texto(t, 16, false, 0xCCFFFFFF));

        View hueco = new View(this);
        col.addView(hueco, new LinearLayout.LayoutParams(1, 0, 1f));

        if (aviso.optString("ref").length() > 2) {
            col.addView(boton("Listo", 0xFFFFFFFF, 0xFF5C010E, Alarmas.ACCION_HECHO));
        }
        Button pos = boton("Posponer 10 min", 0x33FFFFFF, 0xFFFFFFFF, Alarmas.ACCION_POSPONER);
        ((LinearLayout.LayoutParams) pos.getLayoutParams()).topMargin = dp(12);
        col.addView(pos);
        Button apagar = boton("Apagar", 0x00000000, 0xCCFFFFFF, Alarmas.ACCION_APAGAR);
        ((LinearLayout.LayoutParams) apagar.getLayoutParams()).topMargin = dp(6);
        col.addView(apagar);
        return col;
    }

    private TextView texto(String s, float sp, boolean negrita, int color) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        v.setTextColor(color);
        v.setGravity(Gravity.CENTER);
        if (negrita) v.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        return v;
    }

    private Button boton(String s, int fondo, int color, String accion) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setTextColor(color);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        GradientDrawable g = new GradientDrawable();
        g.setColor(fondo);
        g.setCornerRadius(dp(28));
        b.setBackground(g);
        b.setStateListAnimator(null);
        b.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)));
        b.setOnClickListener(v -> {
            v.animate().scaleX(.96f).scaleY(.96f).setDuration(90).withEndAction(() -> responder(accion)).start();
        });
        return b;
    }

    private void responder(String accion) {
        try {
            AccionReceiver.atender(this, accion, aviso);
        } catch (Exception ignored) {}
        finish();
    }

    @Override
    public void onBackPressed() {
        responder(Alarmas.ACCION_APAGAR);
    }
}
