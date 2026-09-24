package com.rutina.diaria;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/**
 * Lee y escribe el calendario del teléfono. Los calendarios de Google que el
 * teléfono ya sincroniza aparecen aquí, así que no hace falta iniciar sesión:
 * lo que se crea desde la app sube solo a Google Calendar.
 */
@CapacitorPlugin(
    name = "Calendario",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR })
    }
)
public class CalendarioPlugin extends Plugin {

    private boolean sinPermiso(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return false;
        call.reject("Falta el permiso del calendario", "NO_PERMISSION");
        return true;
    }

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (sinPermiso(call)) return;
        String[] proj = {
            Calendars._ID,
            Calendars.CALENDAR_DISPLAY_NAME,
            Calendars.ACCOUNT_NAME,
            Calendars.ACCOUNT_TYPE,
            Calendars.CALENDAR_COLOR,
            Calendars.CALENDAR_ACCESS_LEVEL,
            Calendars.IS_PRIMARY,
            Calendars.OWNER_ACCOUNT
        };
        JSArray out = new JSArray();
        ContentResolver cr = getContext().getContentResolver();
        try (Cursor c = cr.query(Calendars.CONTENT_URI, proj, Calendars.SYNC_EVENTS + " = 1", null, null)) {
            while (c != null && c.moveToNext()) {
                JSObject o = new JSObject();
                String name = c.getString(1);
                String account = c.getString(2);
                String owner = c.getString(7);
                int access = c.getInt(5);
                boolean primary = c.getInt(6) == 1 || (name != null && name.equals(account) && name.equals(owner));
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", name != null ? name : "Calendario");
                o.put("account", account);
                o.put("google", "com.google".equals(c.getString(3)));
                o.put("color", hex(c.getInt(4)));
                o.put("writable", access >= Calendars.CAL_ACCESS_CONTRIBUTOR);
                o.put("primary", primary);
                out.put(o);
            }
        } catch (Exception e) {
            call.reject("No se pudieron leer los calendarios", e);
            return;
        }
        JSObject res = new JSObject();
        res.put("calendars", out);
        call.resolve(res);
    }

    /** Eventos (ya expandidos, también los que se repiten) entre from y to, en milisegundos. */
    @PluginMethod
    public void listEvents(PluginCall call) {
        if (sinPermiso(call)) return;
        Double from = call.getDouble("from");
        Double to = call.getDouble("to");
        if (from == null || to == null) {
            call.reject("Faltan from y to");
            return;
        }
        Uri.Builder b = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from.longValue());
        ContentUris.appendId(b, to.longValue());

        List<String> args = new ArrayList<>();
        StringBuilder sel = new StringBuilder("(" + Instances.STATUS + " IS NULL OR " + Instances.STATUS + " != " + Events.STATUS_CANCELED + ")");
        JSArray ids = call.getArray("calendarIds");
        if (ids != null && ids.length() > 0) {
            sel.append(" AND ").append(Instances.CALENDAR_ID).append(" IN (");
            for (int i = 0; i < ids.length(); i++) {
                sel.append(i == 0 ? "?" : ",?");
                args.add(ids.optString(i));
            }
            sel.append(")");
        }

        String[] proj = {
            Instances.EVENT_ID,
            Instances.BEGIN,
            Instances.END,
            Instances.TITLE,
            Instances.ALL_DAY,
            Instances.CALENDAR_ID,
            Instances.DISPLAY_COLOR,
            Instances.EVENT_LOCATION,
            Instances.DESCRIPTION,
            Instances.CALENDAR_DISPLAY_NAME
        };
        JSArray out = new JSArray();
        ContentResolver cr = getContext().getContentResolver();
        try (Cursor c = cr.query(b.build(), proj, sel.toString(), args.toArray(new String[0]), Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("begin", c.getLong(1));
                o.put("end", c.getLong(2));
                o.put("title", c.getString(3) != null ? c.getString(3) : "(Sin título)");
                o.put("allDay", c.getInt(4) == 1);
                o.put("calendarId", String.valueOf(c.getLong(5)));
                o.put("color", hex(c.getInt(6)));
                o.put("location", c.getString(7) != null ? c.getString(7) : "");
                String desc = c.getString(8) != null ? c.getString(8) : "";
                o.put("description", desc.length() > 600 ? desc.substring(0, 600) + "…" : desc);
                o.put("calendarName", c.getString(9) != null ? c.getString(9) : "");
                out.put(o);
            }
        } catch (Exception e) {
            call.reject("No se pudieron leer los eventos", e);
            return;
        }
        JSObject res = new JSObject();
        res.put("events", out);
        call.resolve(res);
    }

    /** Todo el día: date = "YYYY-MM-DD". Con hora: start y end en milisegundos. */
    private ContentValues valores(PluginCall call) {
        ContentValues v = new ContentValues();
        v.put(Events.TITLE, call.getString("title", ""));
        v.put(Events.DESCRIPTION, call.getString("description", ""));
        boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
        if (allDay) {
            String[] p = call.getString("date", "").split("-");
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.clear();
            cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            long start = cal.getTimeInMillis();
            v.put(Events.DTSTART, start);
            v.put(Events.DTEND, start + 24L * 60 * 60 * 1000);
            v.put(Events.ALL_DAY, 1);
            v.put(Events.EVENT_TIMEZONE, "UTC");
        } else {
            v.put(Events.DTSTART, call.getDouble("start").longValue());
            v.put(Events.DTEND, call.getDouble("end").longValue());
            v.put(Events.ALL_DAY, 0);
            v.put(Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
        }
        return v;
    }

    @PluginMethod
    public void createEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            ContentValues v = valores(call);
            v.put(Events.CALENDAR_ID, Long.parseLong(call.getString("calendarId", "")));
            Uri uri = getContext().getContentResolver().insert(Events.CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("insert devolvió null");
            JSObject res = new JSObject();
            res.put("id", uri.getLastPathSegment());
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo crear el evento", e);
        }
    }

    @PluginMethod
    public void updateEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            long id = Long.parseLong(call.getString("id", ""));
            ContentValues v = valores(call);
            int n = getContext().getContentResolver().update(ContentUris.withAppendedId(Events.CONTENT_URI, id), v, null, null);
            JSObject res = new JSObject();
            res.put("updated", n);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo actualizar el evento", e);
        }
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            long id = Long.parseLong(call.getString("id", ""));
            int n = getContext().getContentResolver().delete(ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null);
            JSObject res = new JSObject();
            res.put("deleted", n);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo borrar el evento", e);
        }
    }

    /** Abre el evento en la app de calendario (Google Calendar). */
    @PluginMethod
    public void openEvent(PluginCall call) {
        try {
            long id = Long.parseLong(call.getString("id", ""));
            Intent i = new Intent(Intent.ACTION_VIEW, ContentUris.withAppendedId(Events.CONTENT_URI, id));
            Double begin = call.getDouble("begin");
            Double end = call.getDouble("end");
            if (begin != null) i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin.longValue());
            if (end != null) i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No hay app de calendario", "NO_APP");
        } catch (Exception e) {
            call.reject("No se pudo abrir el evento", e);
        }
    }
}
