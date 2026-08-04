package com.kairen.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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

            // Al tocar el widget (fuera de los botones), abre la app normal
            Intent intentAbrir = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intentAbrir != null) {
                PendingIntent pendingAbrir = PendingIntent.getActivity(
                    context, 0, intentAbrir,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                views.setOnClickPendingIntent(R.id.widget_root, pendingAbrir);
            }

            // Botón "− Gasto" — abre la app directo en Nueva Transacción, tipo gasto
            Intent intentGasto = new Intent(Intent.ACTION_VIEW, Uri.parse("com.kairen.finanzas://nueva-transaccion?tipo=gasto"));
            intentGasto.setPackage(context.getPackageName());
            PendingIntent pendingGasto = PendingIntent.getActivity(
                context, 1, intentGasto,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_boton_gasto, pendingGasto);

            // Botón "+ Ingreso" — abre la app directo en Nueva Transacción, tipo ingreso
            Intent intentIngreso = new Intent(Intent.ACTION_VIEW, Uri.parse("com.kairen.finanzas://nueva-transaccion?tipo=ingreso"));
            intentIngreso.setPackage(context.getPackageName());
            PendingIntent pendingIngreso = PendingIntent.getActivity(
                context, 2, intentIngreso,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_boton_ingreso, pendingIngreso);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}