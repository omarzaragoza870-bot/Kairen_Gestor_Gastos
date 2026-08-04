-- ============================================================
-- Kairen Finanzas - Triggers de Notificaciones Push (v2.1)
-- Correr una sola vez en Supabase > SQL Editor
--
-- Requiere que la Edge Function send-push esté desplegada y
-- que la tabla push_subscriptions exista (upgrade_v2_0).
-- ============================================================

-- Función que llama a la Edge Function send-push vía HTTP
-- desde dentro de Postgres usando pg_net (ya viene en Supabase).
create or replace function notificar_presupuesto()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := NEW.user_id;
  v_categoria text := NEW.categoria_nombre;
  v_tipo text := NEW.tipo;
  v_presupuesto record;
  v_gastado numeric;
  v_porcentaje numeric;
  v_tiene_suscripcion boolean;
  v_titulo text;
  v_cuerpo text;
  v_mes_inicio date;
begin
  -- Solo procesar gastos
  if v_tipo <> 'gasto' then
    return NEW;
  end if;

  -- Verificar que el usuario tiene suscripciones push activas
  select exists(
    select 1 from public.push_subscriptions where user_id = v_user_id
  ) into v_tiene_suscripcion;

  if not v_tiene_suscripcion then
    return NEW;
  end if;

  -- Buscar si existe presupuesto para esta categoría
  select * into v_presupuesto
  from public.presupuestos
  where user_id = v_user_id
    and categoria_nombre = v_categoria
  limit 1;

  if v_presupuesto is null then
    return NEW;
  end if;

  -- Calcular total gastado en esta categoría este mes
  v_mes_inicio := date_trunc('month', current_date)::date;
  select coalesce(sum(monto), 0) into v_gastado
  from public.transacciones
  where user_id = v_user_id
    and categoria_nombre = v_categoria
    and tipo = 'gasto'
    and fecha >= v_mes_inicio;

  -- Ya incluye la transacción recién insertada
  v_porcentaje := (v_gastado / v_presupuesto.monto_limite) * 100;

  -- Determinar si hay que notificar
  if v_porcentaje >= 100 then
    v_titulo := '🔴 Presupuesto excedido';
    v_cuerpo := format(
      '%s: $%s de $%s (%.0f%%)',
      v_categoria,
      to_char(v_gastado, 'FM999,999,990.00'),
      to_char(v_presupuesto.monto_limite, 'FM999,999,990.00'),
      v_porcentaje
    );
  elsif v_porcentaje >= 80 then
    v_titulo := '🟡 Presupuesto al ' || round(v_porcentaje) || '%';
    v_cuerpo := format(
      '%s: $%s de $%s — ¡cuidado!',
      v_categoria,
      to_char(v_gastado, 'FM999,999,990.00'),
      to_char(v_presupuesto.monto_limite, 'FM999,999,990.00')
    );
  else
    -- No notificar si está por debajo del 80%
    return NEW;
  end if;

  -- Llamar a la Edge Function send-push via pg_net
  perform net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object(
      'user_id', v_user_id::text,
      'title', v_titulo,
      'body', v_cuerpo,
      'url', '/ajustes'
    )
  );

  return NEW;
exception
  when others then
    -- No fallar la transacción por un error de notificación
    return NEW;
end;
$$;

-- Crear el trigger en la tabla de transacciones
drop trigger if exists trigger_notificar_presupuesto on public.transacciones;
create trigger trigger_notificar_presupuesto
  after insert on public.transacciones
  for each row
  execute function notificar_presupuesto();

-- ─── Configurar las variables de entorno de Postgres ─────────────────────
-- IMPORTANTE: necesitas correr también estos dos comandos con tus valores
-- reales en Supabase > SQL Editor (reemplaza los valores):

-- alter database postgres set app.supabase_url = 'https://iemyltuapdpdjxegxjhn.supabase.co';
-- alter database postgres set app.service_role_key = 'TU_SERVICE_ROLE_KEY_AQUI';

-- Puedes encontrar tu service_role_key en:
-- Supabase > Settings > API > service_role (secret)
