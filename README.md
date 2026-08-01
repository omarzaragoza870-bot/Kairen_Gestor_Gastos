# Kairen Finanzas

PWA de control personal de ingresos y gastos con React, Vite y Supabase.

## Funciones disponibles

- Inicio de sesión con Google.
- Cuentas Efectivo y Tarjeta por usuario.
- Registro de ingresos y gastos.
- Descripción y fecha personalizadas.
- Resumen mensual y navegación entre meses.
- Historial completo con filtros.
- Edición y eliminación de movimientos.
- Corrección automática de saldos al editar o eliminar.
- PWA instalable.

## Ejecutar localmente

```bash
npm install
npm run dev
```

## Configurar Supabase desde cero

1. Crea el archivo `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. Ejecuta `src/sql/schema.sql` en Supabase > SQL Editor.
3. Ejecuta `src/sql/upgrade_v1_1.sql` para habilitar creación, edición y eliminación atómicas.
4. Activa Google en Authentication > Providers.

## Actualizar una base ya existente

Si las tablas ya existen, ejecuta únicamente:

```text
src/sql/upgrade_v1_1.sql
```

Esta actualización no borra datos.

## Próximos módulos

- Análisis.
- Ahorro externo.
- Metas.
- Categorías personalizadas.
