package com.rutina.diaria;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/**
 * Lo que la app lee y escribe en el calendario del teléfono (ahí vive tu Google Calendar).
 *
 * Algunos fabricantes (Xiaomi, por ejemplo) cambian el proveedor de calendario: por eso
 * cada consulta tiene un plan B más simple, las columnas se leen por nombre y, si algo
 * falla, el error dice exactamente qué. Va aparte del plugin para poder probarlo solo.
 */
final class CalendarioDatos {

    private CalendarioDatos() {}

    static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    static String motivo(Exception e) {
        String m = e.getMessage();
        return e.getClass().getSimpleName() + (m != null ? ": " + m : "");
    }

    /* ── lectura tolerante: columnas por nombre ── */

    static String str(Cursor c, String col) {
        int i = c.getColumnIndex(col);
        return i < 0 || c.isNull(i) ? null : c.getString(i);
    }

    static long lng(Cursor c, String col, long def) {
        int i = c.getColumnIndex(col);
        return i < 0 || c.isNull(i) ? def : c.getLong(i);
    }

    /** Prueba cada consulta en orden hasta que una funcione; en notas queda qué pasó con cada una. */
    static Cursor consultar(Context ctx, Uri uri, String[][] proyecciones, String[] selecciones, String[] args, String orden, List<String> notas) {
        ContentResolver cr = ctx.getContentResolver();
        for (int i = 0; i < proyecciones.length; i++) {
            try {
                Cursor c = cr.query(uri, proyecciones[i], selecciones[i], selecciones[i] == null ? null : args, orden);
                if (c != null) {
                    notas.add("plan " + (i + 1) + " ok");
                    return c;
                }
                notas.add("plan " + (i + 1) + ": sin cursor");
            } catch (Exception e) {
                notas.add("plan " + (i + 1) + ": " + motivo(e));
            }
        }
        return null;
    }

    /* ── calendarios ── */

    static JSArray calendarios(Context ctx, List<String> notas) {
        String[] completa = {
            Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE,
            Calendars.CALENDAR_COLOR, Calendars.CALENDAR_ACCESS_LEVEL, Calendars.IS_PRIMARY, Calendars.OWNER_ACCOUNT,
            Calendars.SYNC_EVENTS, Calendars.VISIBLE
        };
        String[] simple = {
            Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE,
            Calendars.CALENDAR_COLOR, Calendars.CALENDAR_ACCESS_LEVEL, Calendars.OWNER_ACCOUNT
        };
        JSArray out = new JSArray();
        try (Cursor c = consultar(ctx, Calendars.CONTENT_URI, new String[][] { completa, simple, null },
                new String[] { null, null, null }, null, null, notas)) {
            if (c == null) return out;
            while (c.moveToNext()) {
                // los que el teléfono no sincroniza no tienen eventos que ver
                if (lng(c, Calendars.SYNC_EVENTS, 1) == 0) continue;
                JSObject o = new JSObject();
                String name = str(c, Calendars.CALENDAR_DISPLAY_NAME);
                String account = str(c, Calendars.ACCOUNT_NAME);
                String owner = str(c, Calendars.OWNER_ACCOUNT);
                String tipo = str(c, Calendars.ACCOUNT_TYPE);
                long access = lng(c, Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER);
                boolean primary = lng(c, Calendars.IS_PRIMARY, 0) == 1
                    || (account != null && account.equalsIgnoreCase(owner) && (name == null || name.equalsIgnoreCase(account)));
                o.put("id", String.valueOf(lng(c, Calendars._ID, -1)));
                o.put("name", name != null ? name : (account != null ? account : "Calendario"));
                o.put("account", account);
                o.put("type", tipo);
                o.put("google", "com.google".equals(tipo));
                o.put("color", hex((int) lng(c, Calendars.CALENDAR_COLOR, 0xFF9E2A3F)));
                o.put("writable", access >= Calendars.CAL_ACCESS_CONTRIBUTOR);
                o.put("primary", primary);
                out.put(o);
            }
        } catch (Exception e) {
            notas.add("lectura: " + motivo(e));
        }
        return out;
    }

    /* ── eventos ── */

    /** Eventos (ya expandidos, también los que se repiten) entre from y to, en milisegundos. */
    static JSArray eventos(Context ctx, long from, long to, JSArray ids) throws Exception {
        Uri.Builder b = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from);
        ContentUris.appendId(b, to);

        List<String> args = new ArrayList<>();
        StringBuilder porCalendario = new StringBuilder();
        if (ids != null && ids.length() > 0) {
            porCalendario.append(Instances.CALENDAR_ID).append(" IN (");
            for (int i = 0; i < ids.length(); i++) {
                porCalendario.append(i == 0 ? "?" : ",?");
                args.add(ids.optString(i));
            }
            porCalendario.append(")");
        }
        // el último plan no filtra en la consulta: se filtra aquí
        Set<String> visibles = new HashSet<>(args);
        String cal = porCalendario.length() > 0 ? porCalendario.toString() : null;
        String noCancelados = "(" + Instances.STATUS + " IS NULL OR " + Instances.STATUS + " != " + Events.STATUS_CANCELED + ")";

        String[] completa = {
            Instances.EVENT_ID, Instances.BEGIN, Instances.END, Instances.TITLE, Instances.ALL_DAY,
            Instances.CALENDAR_ID, Instances.DISPLAY_COLOR, Instances.EVENT_LOCATION, Instances.DESCRIPTION,
            Instances.CALENDAR_DISPLAY_NAME, Instances.STATUS
        };
        String[] simple = {
            Instances.EVENT_ID, Instances.BEGIN, Instances.END, Instances.TITLE, Instances.ALL_DAY, Instances.CALENDAR_ID
        };
        List<String> notas = new ArrayList<>();
        JSArray out = new JSArray();
        try (Cursor c = consultar(ctx, b.build(), new String[][] { completa, simple, simple },
                new String[] { cal != null ? noCancelados + " AND " + cal : noCancelados, cal, null },
                args.toArray(new String[0]), Instances.BEGIN + " ASC", notas)) {
            if (c == null) throw new IllegalStateException(String.join(" · ", notas));
            while (c.moveToNext()) {
                if (lng(c, Instances.STATUS, -1) == Events.STATUS_CANCELED) continue;
                String calId = String.valueOf(lng(c, Instances.CALENDAR_ID, -1));
                if (!visibles.isEmpty() && !visibles.contains(calId)) continue;
                JSObject o = new JSObject();
                o.put("id", String.valueOf(lng(c, Instances.EVENT_ID, -1)));
                o.put("begin", lng(c, Instances.BEGIN, 0));
                o.put("end", lng(c, Instances.END, 0));
                String t = str(c, Instances.TITLE);
                o.put("title", t != null && !t.isEmpty() ? t : "(Sin título)");
                o.put("allDay", lng(c, Instances.ALL_DAY, 0) == 1);
                o.put("calendarId", calId);
                long color = lng(c, Instances.DISPLAY_COLOR, Long.MIN_VALUE);
                if (color != Long.MIN_VALUE) o.put("color", hex((int) color));
                String loc = str(c, Instances.EVENT_LOCATION);
                o.put("location", loc != null ? loc : "");
                String desc = str(c, Instances.DESCRIPTION);
                if (desc == null) desc = "";
                o.put("description", desc.length() > 600 ? desc.substring(0, 600) + "…" : desc);
                String cn = str(c, Instances.CALENDAR_DISPLAY_NAME);
                o.put("calendarName", cn != null ? cn : "");
                out.put(o);
            }
        }
        return out;
    }

    /**
     * Cómo están ahora en el teléfono los eventos que creó la app: si los moviste,
     * renombraste o borraste en Google Calendar, la app se entera por aquí.
     * Los que ya no existen simplemente no vienen.
     */
    static JSArray porId(Context ctx, JSArray ids) throws Exception {
        JSArray out = new JSArray();
        if (ids == null || ids.length() == 0) return out;
        List<String> args = new ArrayList<>();
        StringBuilder sel = new StringBuilder(Events._ID + " IN (");
        for (int i = 0; i < ids.length(); i++) {
            sel.append(i == 0 ? "?" : ",?");
            args.add(ids.optString(i));
        }
        sel.append(")");
        String[] completa = {
            Events._ID, Events.TITLE, Events.DTSTART, Events.DTEND, Events.DURATION, Events.ALL_DAY,
            Events.RRULE, Events.DELETED, Events.EVENT_TIMEZONE, Events.CALENDAR_ID
        };
        String[] simple = { Events._ID, Events.TITLE, Events.DTSTART, Events.DTEND, Events.DURATION, Events.ALL_DAY, Events.RRULE };
        List<String> notas = new ArrayList<>();
        try (Cursor c = consultar(ctx, Events.CONTENT_URI, new String[][] { completa, simple },
                new String[] { sel.toString(), sel.toString() }, args.toArray(new String[0]), null, notas)) {
            if (c == null) throw new IllegalStateException(String.join(" · ", notas));
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", String.valueOf(lng(c, Events._ID, -1)));
                o.put("title", str(c, Events.TITLE));
                o.put("dtstart", lng(c, Events.DTSTART, 0));
                long dtend = lng(c, Events.DTEND, 0);
                if (dtend > 0) o.put("dtend", dtend);
                o.put("duration", str(c, Events.DURATION));
                o.put("allDay", lng(c, Events.ALL_DAY, 0) == 1);
                o.put("rrule", str(c, Events.RRULE));
                o.put("deleted", lng(c, Events.DELETED, 0) == 1);
                out.put(o);
            }
        }
        return out;
    }

    /* ── escritura ── */

    /**
     * Todo el día: date = "YYYY-MM-DD". Con hora: start y end en milisegundos.
     * Con rrule el evento se repite (los hábitos) y Android pide duración en vez de hora de fin.
     * Al crear no se mandan columnas vacías: hay proveedores que las rechazan.
     */
    static ContentValues valores(JSObject d, boolean nuevo) {
        ContentValues v = new ContentValues();
        v.put(Events.TITLE, d.optString("title", ""));
        v.put(Events.DESCRIPTION, d.optString("description", ""));
        boolean allDay = d.optBoolean("allDay", false);
        String rrule = d.optString("rrule", "");
        boolean repite = !rrule.isEmpty() && !"null".equals(rrule);
        if (allDay) {
            String[] p = d.optString("date", "").split("-");
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.clear();
            cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            long start = cal.getTimeInMillis();
            v.put(Events.DTSTART, start);
            v.put(Events.ALL_DAY, 1);
            v.put(Events.EVENT_TIMEZONE, "UTC");
            if (repite) {
                v.put(Events.DURATION, "P1D");
                if (!nuevo) v.putNull(Events.DTEND);
            } else {
                v.put(Events.DTEND, start + 24L * 60 * 60 * 1000);
                if (!nuevo) v.putNull(Events.DURATION);
            }
        } else {
            long start = (long) d.optDouble("start");
            long end = (long) d.optDouble("end");
            v.put(Events.DTSTART, start);
            v.put(Events.ALL_DAY, 0);
            v.put(Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            if (repite) {
                v.put(Events.DURATION, "P" + Math.max(60, (end - start) / 1000) + "S");
                if (!nuevo) v.putNull(Events.DTEND);
            } else {
                v.put(Events.DTEND, end);
                if (!nuevo) v.putNull(Events.DURATION);
            }
        }
        if (repite) v.put(Events.RRULE, rrule);
        else if (!nuevo) v.putNull(Events.RRULE);
        return v;
    }

    static String crear(Context ctx, String calendarId, JSObject d) {
        ContentValues v = valores(d, true);
        v.put(Events.CALENDAR_ID, Long.parseLong(calendarId));
        Uri uri = ctx.getContentResolver().insert(Events.CONTENT_URI, v);
        if (uri == null) throw new IllegalStateException("el calendario no aceptó el evento");
        return uri.getLastPathSegment();
    }

    static int actualizar(Context ctx, String id, JSObject d) {
        return ctx.getContentResolver().update(ContentUris.withAppendedId(Events.CONTENT_URI, Long.parseLong(id)), valores(d, false), null, null);
    }

    static int borrar(Context ctx, String id) {
        return ctx.getContentResolver().delete(ContentUris.withAppendedId(Events.CONTENT_URI, Long.parseLong(id)), null, null);
    }
}
