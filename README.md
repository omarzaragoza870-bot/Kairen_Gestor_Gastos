# Kairen Finanzas

App de finanzas personales para web (PWA) y Android/iOS (Capacitor), con React, Vite y Supabase.

## Funciones

- Inicio de sesión con Google, con email o sin cuenta.
- Cuentas de efectivo, débito, banco y tarjeta de crédito (con pago de tarjeta y avisos de corte y pago).
- Ingresos, gastos y transferencias entre cuentas, con corrección automática de saldos.
- Categorías personalizadas con iconos, presupuestos por categoría y movimientos recurrentes.
- Análisis: resumen, distribución, tendencias y preguntas a Kairen IA (Gemini).
- Ahorro externo, metas con aportes y metas compartidas en grupo (modo colaborativo).
- Reportes en PDF, respaldo e importación de datos, borrado de cuenta.
- Modo sin conexión: muestra lo último guardado y sincroniza lo pendiente al volver la red.
- Notificaciones push (web y Android) y widget de saldo en Android.
- Idioma, moneda y tema configurables.

## Ejecutar localmente

```bash
npm install
npm run dev
npm test        # pruebas (Vitest)
```

Crea un `.env` con:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...   # push en web
```

## Configurar Supabase desde cero

1. Ejecuta `supabase/schema_produccion.sql` en el SQL Editor (volcado del 2026-10-19: el punto de partida).
2. Ejecuta en orden los archivos de `supabase/migrations/` (todo lo posterior al volcado).
   `supabase/historico/` es solo historia: no hace falta aplicar nada de ahí.
3. Activa Google en Authentication > Providers.
4. Crea en Vault los secretos `project_url` (URL del proyecto) e `internal_cron_secret`; los usan los triggers y tareas de pg_cron para llamar a `send-push`.
5. Programa en pg_cron las tareas que tiene producción (la última la crea su migración):

   | Tarea | Horario (UTC) | Comando |
   |---|---|---|
   | `recordatorio-gastos-diarios` | `0 2 * * *` | `select public.recordatorio_registrar_gastos()` |
   | `revisar-tarjetas-credito` | `0 15 * * *` | `select public.revisar_notificaciones_tarjetas_credito()` |
   | `limpiar-operaciones-cliente` | `0 10 * * *` | `delete from public.operaciones_cliente where created_at < now() - interval '60 days'` |
   | `revisar-resultados-push` | `*/10 * * * *` | `select public.revisar_resultados_push()` |

6. Despliega las Edge Functions (`supabase functions deploy`) y configura sus secretos:

| Función | Secretos |
|---|---|
| `send-push` | `INTERNAL_CRON_SECRET` (igual al de Vault), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `ANON_KEY` |
| `preguntar-kairen` | `GEMINI_API_KEY`, `ANON_KEY`, `ALLOWED_ORIGINS` |
| `delete-account` | `ALLOWED_ORIGINS` |

`ALLOWED_ORIGINS` son los orígenes que acepta CORS (`_shared/cors.ts`). `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase.

Las migraciones nuevas van en `supabase/migrations/` con el formato de la CLI (`AAAAMMDDhhmmss_nombre.sql`) y las pruebas (`npm test`) las cargan solas sobre el volcado. Para aplicar una a un proyecto ya enlazado: `npx supabase db query --linked -f <archivo>`.

Para revisar los avisos push enviados: `select * from public.push_envios order by id desc limit 50;`

## Android

```bash
npm run android:sync          # build web + cap sync
npm run android:build-debug   # APK debug
```

Gradle necesita JDK 21. El CI (`.github/workflows/build-apk.yml`) corre las pruebas y genera el APK debug en cada push a `main`. Más detalle en `docs/android-capacitor-setup.md`.

## Arquitectura

Las decisiones principales (RPCs seguras para saldos, modo offline con cola idempotente, PKCE propio en Capacitor y push desde Postgres con pg_net) están en el ADR del proyecto en codebase-memory.
