package com.rutina.diaria;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.Intent;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Events;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.List;

/**
 * Puente entre la app y el calendario del teléfono (ver CalendarioDatos). Los calendarios
 * de Google que el teléfono ya sincroniza aparecen aquí, así que no hace falta iniciar
 * sesión: lo que se crea desde la app sube solo a Google Calendar, y lo que cambias en
 * Google Calendar baja solo al teléfono.
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

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (sinPermiso(call)) return;
        List<String> notas = new ArrayList<>();
        JSObject res = new JSObject();
        res.put("calendars", CalendarioDatos.calendarios(getContext(), notas));
        res.put("notas", String.join(" · ", notas));
        call.resolve(res);
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        if (sinPermiso(call)) return;
        Double from = call.getDouble("from");
        Double to = call.getDouble("to");
        if (from == null || to == null) {
            call.reject("Faltan from y to");
            return;
        }
        try {
            JSObject res = new JSObject();
            res.put("events", CalendarioDatos.eventos(getContext(), from.longValue(), to.longValue(), call.getArray("calendarIds")));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudieron leer los eventos (" + CalendarioDatos.motivo(e) + ")");
        }
    }

    /** Cómo están ahora los eventos que creó la app, para traer lo que cambiaste en Google Calendar. */
    @PluginMethod
    public void getEvents(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            JSObject res = new JSObject();
            res.put("events", CalendarioDatos.porId(getContext(), call.getArray("ids")));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudieron revisar tus eventos (" + CalendarioDatos.motivo(e) + ")");
        }
    }

    @PluginMethod
    public void createEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            JSObject res = new JSObject();
            res.put("id", CalendarioDatos.crear(getContext(), call.getString("calendarId", ""), call.getData()));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo crear el evento (" + CalendarioDatos.motivo(e) + ")");
        }
    }

    @PluginMethod
    public void updateEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            JSObject res = new JSObject();
            res.put("updated", CalendarioDatos.actualizar(getContext(), call.getString("id", ""), call.getData()));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo actualizar el evento (" + CalendarioDatos.motivo(e) + ")");
        }
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (sinPermiso(call)) return;
        try {
            JSObject res = new JSObject();
            res.put("deleted", CalendarioDatos.borrar(getContext(), call.getString("id", "")));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo borrar el evento (" + CalendarioDatos.motivo(e) + ")");
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
