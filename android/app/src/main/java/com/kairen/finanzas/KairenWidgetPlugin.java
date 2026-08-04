package com.kairen.finanzas;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KairenWidget")
public class KairenWidgetPlugin extends Plugin {

    public static final String PREFS_NAME = "KairenWidgetPrefs";

    @PluginMethod
    public void actualizar(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        editor.putString("disponible", call.getString("disponible", "$0.00"));
        editor.putString("ingresos", call.getString("ingresos", "$0.00"));
        editor.putString("gastos", call.getString("gastos", "$0.00"));
        editor.putString("actualizado", call.getString("actualizado", ""));
        editor.apply();

        // Forzar actualización inmediata de todos los widgets ya colocados
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName componente = new ComponentName(context, SaldoWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(componente);
        SaldoWidgetProvider.actualizarWidgets(context, manager, ids);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
