package com.kairen.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class SaldoWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        actualizarWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void actualizarWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(KairenWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String disponible = prefs.getString("disponible", "$0.00");
        String ingresos = prefs.getString("ingresos", "$0.00");
        String gastos = prefs.getString("gastos", "$0.00");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_saldo);
            views.setTextViewText(R.id.widget_disponible, disponible);
            views.setTextViewText(R.id.widget_ingresos, "↑ " + ingresos);
            views.setTextViewText(R.id.widget_gastos, "↓ " + gastos);

            // Al tocar el widget, abre la app
            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent != null) {
                PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            }

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
