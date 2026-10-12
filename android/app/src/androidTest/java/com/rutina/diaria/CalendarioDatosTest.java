package com.rutina.diaria;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Prueba contra el proveedor de calendario de verdad del teléfono (o emulador):
 * crea un calendario local de prueba, escribe eventos como lo hace la app y los lee de vuelta.
 */
@RunWith(AndroidJUnit4.class)
public class CalendarioDatosTest {

    private static final String CUENTA = "prueba@rutina.test";
    private Context ctx;
    private String calId;

    private static Uri comoSync(Uri u) {
        return u.buildUpon()
            .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(Calendars.ACCOUNT_NAME, CUENTA)
            .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            .build();
    }

    @Before
    public void preparar() {
        ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String pkg = ctx.getPackageName();
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(pkg, Manifest.permission.READ_CALENDAR);
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(pkg, Manifest.permission.WRITE_CALENDAR);
        ContentValues v = new ContentValues();
        v.put(Calendars.ACCOUNT_NAME, CUENTA);
        v.put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
        v.put(Calendars.NAME, "rutina-prueba");
        v.put(Calendars.CALENDAR_DISPLAY_NAME, CUENTA);
        v.put(Calendars.CALENDAR_COLOR, 0xFF039BE5);
        v.put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER);
        v.put(Calendars.OWNER_ACCOUNT, CUENTA);
        v.put(Calendars.SYNC_EVENTS, 1);
        v.put(Calendars.VISIBLE, 1);
        Uri u = ctx.getContentResolver().insert(comoSync(Calendars.CONTENT_URI), v);
        assertNotNull("no se pudo crear el calendario de prueba", u);
        calId = u.getLastPathSegment();
    }

    @After
    public void limpiar() {
        if (calId != null) ctx.getContentResolver().delete(comoSync(Calendars.CONTENT_URI), Calendars._ID + "=?", new String[] { calId });
    }

    private JSONObject buscar(JSArray l, String id) throws Exception {
        for (int i = 0; i < l.length(); i++) if (id.equals(l.getJSONObject(i).getString("id"))) return l.getJSONObject(i);
        return null;
    }

    @Test
    public void listaElCalendarioComoEscribibleYPrincipal() throws Exception {
        List<String> notas = new ArrayList<>();
        JSArray cals = CalendarioDatos.calendarios(ctx, notas);
        JSONObject c = buscar(cals, calId);
        assertNotNull("no aparece el calendario " + calId + "; notas: " + notas + "; lista: " + cals, c);
        assertTrue(c.getBoolean("writable"));
        assertTrue(c.getBoolean("primary"));
        assertEquals("#039BE5", c.getString("color"));
        assertTrue(notas.toString(), notas.get(0).startsWith("plan 1 ok"));
    }

    @Test
    public void creaLeeMueveYBorraComoLaApp() throws Exception {
        long hora = 3_600_000L;
        long ahora = System.currentTimeMillis();
        long inicio = ahora - ahora % hora + 24 * hora;   // mañana, en punto

        // una tarea con hora
        JSObject tarea = new JSObject();
        tarea.put("title", "Tarea: Informe (Física)");
        tarea.put("description", "Creado desde la app Rutina.");
        tarea.put("allDay", false);
        tarea.put("start", (double) inicio);
        tarea.put("end", (double) (inicio + hora));
        String idTarea = CalendarioDatos.crear(ctx, calId, tarea);

        // una meta de todo el día
        JSObject meta = new JSObject();
        meta.put("title", "Meta: Leer 12 libros");
        meta.put("allDay", true);
        meta.put("date", "2030-03-15");
        String idMeta = CalendarioDatos.crear(ctx, calId, meta);

        // un hábito que se repite lunes, miércoles y viernes
        JSObject habito = new JSObject();
        habito.put("title", "Correr");
        habito.put("allDay", false);
        habito.put("start", (double) inicio);
        habito.put("end", (double) (inicio + hora / 2));
        habito.put("rrule", "FREQ=WEEKLY;BYDAY=MO,WE,FR");
        String idHabito = CalendarioDatos.crear(ctx, calId, habito);

        // el mes que viene, con las repeticiones ya expandidas
        JSArray ids = new JSArray();
        ids.put(calId);
        JSArray ev = CalendarioDatos.eventos(ctx, inicio - hora, inicio + 30 * 24 * hora, ids);
        assertNotNull(buscar(ev, idTarea));
        int veces = 0;
        for (int i = 0; i < ev.length(); i++) if (idHabito.equals(ev.getJSONObject(i).getString("id"))) veces++;
        assertTrue("el hábito debería repetirse varias veces, salió " + veces, veces >= 10);

        // otro calendario no se mezcla
        JSArray otro = new JSArray();
        otro.put("999999");
        assertEquals(0, CalendarioDatos.eventos(ctx, inicio - hora, inicio + 30 * 24 * hora, otro).length());

        // cómo están ahora (lo que usa la app para notar cambios hechos en Google)
        JSArray todos = new JSArray();
        todos.put(idTarea);
        todos.put(idMeta);
        todos.put(idHabito);
        JSArray ahoraEn = CalendarioDatos.porId(ctx, todos);
        assertEquals(3, ahoraEn.length());
        JSONObject h = buscar(ahoraEn, idHabito);
        assertEquals("FREQ=WEEKLY;BYDAY=MO,WE,FR", h.getString("rrule"));
        assertEquals(inicio, h.getLong("dtstart"));
        JSONObject m = buscar(ahoraEn, idMeta);
        assertTrue(m.getBoolean("allDay"));
        assertEquals(1899763200000L, m.getLong("dtstart"));   // 2030-03-15 00:00 UTC

        // mover la tarea una hora y volverla repetitiva, y luego de nuevo normal
        tarea.put("start", (double) (inicio + hora));
        tarea.put("end", (double) (inicio + 2 * hora));
        assertEquals(1, CalendarioDatos.actualizar(ctx, idTarea, tarea));
        assertEquals(inicio + hora, buscar(CalendarioDatos.porId(ctx, todos), idTarea).getLong("dtstart"));
        tarea.put("rrule", "FREQ=DAILY");
        assertEquals(1, CalendarioDatos.actualizar(ctx, idTarea, tarea));
        tarea.put("rrule", JSONObject.NULL);
        assertEquals(1, CalendarioDatos.actualizar(ctx, idTarea, tarea));
        JSONObject t = buscar(CalendarioDatos.porId(ctx, todos), idTarea);
        assertTrue(t.isNull("rrule"));
        assertEquals(inicio + 2 * hora, t.getLong("dtend"));

        // borrar: deja de venir o viene marcado como borrado
        assertEquals(1, CalendarioDatos.borrar(ctx, idMeta));
        JSONObject borrada = buscar(CalendarioDatos.porId(ctx, todos), idMeta);
        assertTrue(borrada == null || borrada.getBoolean("deleted"));
    }

    @Test
    public void unCanalPorCadaVibracion() {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        Alarmas.crearCanales(ctx);
        assertNull(nm.getNotificationChannel("rutina_alarma"));
        assertNull(nm.getNotificationChannel("rutina_avisos"));

        String id = Alarmas.canal(ctx, true, true, "latido");
        NotificationChannel ch = nm.getNotificationChannel(id);
        assertNotNull(ch);
        assertTrue(ch.shouldVibrate());
        assertArrayEquals(Alarmas.patron("latido"), ch.getVibrationPattern());
        assertEquals(android.media.AudioAttributes.USAGE_ALARM, ch.getAudioAttributes().getUsage());

        NotificationChannel muda = nm.getNotificationChannel(Alarmas.canal(ctx, false, false, "none"));
        assertFalse(muda.shouldVibrate());

        // lo que mandaba la 5.0 (vibrar sí/no) sigue entendiéndose
        assertEquals("insistente", Alarmas.vibDe(new JSONObject(), true));
        try {
            assertEquals("none", Alarmas.vibDe(new JSONObject().put("vibrar", false), false));
            assertEquals("corta", Alarmas.vibDe(new JSONObject().put("vib", "corta"), true));
            assertEquals("doble", Alarmas.vibDe(new JSONObject().put("vib", "rara"), false));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        assertFalse(Alarmas.alarmasBloqueadas(ctx));
    }
}
