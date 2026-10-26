-- 20261026000000_registro_push.sql (antes upgrade_v3_0_registro_push.sql)
--
-- Registro de notificaciones push enviadas desde Postgres y tres correcciones.
-- Idempotente y sin borrar datos. Aplicada en producción el 2026-10-26.
--
-- Correcciones (encontradas con las pruebas de supabase/tests/):
--   1. El aviso "Presupuesto excedido" nunca salía: format() no admite %.0f,
--      la función fallaba y el "exception when others" lo ocultaba.
--   2. Los tres avisos solo se mandaban a quien tenía push web
--      (push_subscriptions). La app de Android solo registra fcm_tokens, así
--      que en Android no llegaba ninguno.
--   3. Los errores se tragaban sin dejar rastro. Ahora quedan en push_envios.
--
-- Cómo revisar lo enviado (SQL Editor):
--   select * from public.push_envios order by id desc limit 50;
--   select estado, count(*) from public.push_envios group by 1;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabla de registro. Solo la usan el servidor y el SQL Editor: sin
--    políticas RLS y sin permisos para anon/authenticated.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.push_envios (
  id bigserial primary key,
  user_id uuid not null,
  origen text not null check (origen in ('presupuesto', 'recordatorio', 'tarjeta')),
  titulo text,
  request_id bigint,
  -- pendiente: enviada a pg_net, sin respuesta todavía
  -- enviado: send-push respondió 2xx y entregó al menos a un dispositivo
  -- sin_dispositivos: respondió 2xx pero el usuario no tiene dispositivos válidos
  -- fallido: send-push respondió con error o pg_net no pudo conectar
  -- sin_respuesta: pg_net ya borró la respuesta antes de revisarla
  -- error_sql: falló en Postgres antes de llegar a pg_net
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'sin_dispositivos', 'fallido', 'sin_respuesta', 'error_sql')),
  status_code integer,
  respuesta text,
  error text,
  created_at timestamptz not null default now(),
  revisado_at timestamptz
);

create index if not exists push_envios_pendientes_idx on public.push_envios (request_id) where estado = 'pendiente';
create index if not exists push_envios_created_at_idx on public.push_envios (created_at);

alter table public.push_envios enable row level security;
revoke all on table public.push_envios from anon, authenticated;
revoke all on sequence public.push_envios_id_seq from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Un solo lugar que llama a send-push y deja constancia.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.tiene_dispositivo_push(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.push_subscriptions where user_id = p_user_id)
      or exists (select 1 from public.fcm_tokens where user_id = p_user_id);
$$;

create or replace function public.registrar_error_push(p_user_id uuid, p_origen text, p_titulo text, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_envios (user_id, origen, titulo, estado, error)
  values (p_user_id, p_origen, p_titulo, 'error_sql', left(p_error, 1000));
exception when others then
  raise warning 'registrar_error_push: no se pudo registrar el error de push: %', sqlerrm;
end;
$$;

create or replace function public.enviar_push(p_user_id uuid, p_origen text, p_titulo text, p_cuerpo text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secreto text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'internal_cron_secret';
  if v_url is null or v_secreto is null then
    perform public.registrar_error_push(p_user_id, p_origen, p_titulo, 'Faltan los secretos project_url o internal_cron_secret en Vault.');
    return;
  end if;

  v_request_id := net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secreto
    ),
    body := jsonb_build_object(
      'user_id', p_user_id::text,
      'title', p_titulo,
      'body', p_cuerpo,
      'url', p_url
    )
  );

  insert into public.push_envios (user_id, origen, titulo, request_id)
  values (p_user_id, p_origen, p_titulo, v_request_id);
exception when others then
  perform public.registrar_error_push(p_user_id, p_origen, p_titulo, sqlerrm);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Los tres avisos, ahora con enviar_push, para push web y FCM, y con el
--    error registrado en vez de ocultarlo.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notificar_presupuesto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presupuesto record;
  v_gastado numeric;
  v_porcentaje numeric;
  v_titulo text;
  v_cuerpo text;
begin
  if NEW.tipo <> 'gasto' or not public.tiene_dispositivo_push(NEW.user_id) then
    return NEW;
  end if;

  select * into v_presupuesto
  from public.presupuestos
  where user_id = NEW.user_id and categoria_nombre = NEW.categoria_nombre
  limit 1;
  if v_presupuesto is null then
    return NEW;
  end if;

  select coalesce(sum(monto), 0) into v_gastado
  from public.transacciones
  where user_id = NEW.user_id
    and categoria_nombre = NEW.categoria_nombre
    and tipo = 'gasto'
    and fecha >= date_trunc('month', current_date)::date;

  v_porcentaje := (v_gastado / v_presupuesto.monto_limite) * 100;

  if v_porcentaje >= 100 then
    v_titulo := '🔴 Presupuesto excedido';
    v_cuerpo := format('%s: $%s de $%s (%s%%)',
      NEW.categoria_nombre,
      to_char(v_gastado, 'FM999,999,990.00'),
      to_char(v_presupuesto.monto_limite, 'FM999,999,990.00'),
      round(v_porcentaje));
  elsif v_porcentaje >= 80 then
    v_titulo := '🟡 Presupuesto al ' || round(v_porcentaje) || '%';
    v_cuerpo := format('%s: $%s de $%s — ¡cuidado!',
      NEW.categoria_nombre,
      to_char(v_gastado, 'FM999,999,990.00'),
      to_char(v_presupuesto.monto_limite, 'FM999,999,990.00'));
  else
    return NEW;
  end if;

  perform public.enviar_push(NEW.user_id, 'presupuesto', v_titulo, v_cuerpo, '/ajustes');
  return NEW;
exception when others then
  -- Nunca bloquear el registro del gasto por un aviso, pero sí dejar rastro.
  perform public.registrar_error_push(NEW.user_id, 'presupuesto', v_titulo, sqlerrm);
  return NEW;
end;
$$;

create or replace function public.recordatorio_registrar_gastos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario record;
begin
  for v_usuario in
    select user_id from public.push_subscriptions
    union
    select user_id from public.fcm_tokens
  loop
    perform public.enviar_push(
      v_usuario.user_id, 'recordatorio',
      '📝 Registra tus gastos', 'No olvides registrar tus gastos del día de hoy.', '/'
    );
  end loop;
end;
$$;

create or replace function public.revisar_notificaciones_tarjetas_credito()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarjeta record;
  v_hoy int := extract(day from current_date);
  v_ultimo_dia_mes int := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'));
  v_dia_corte int;
  v_dia_pago int;
  v_titulo text;
  v_cuerpo text;
begin
  for v_tarjeta in
    select c.id, c.user_id, c.nombre, c.fecha_corte, c.fecha_pago, c.saldo
    from public.cuentas c
    where c.tipo = 'tarjeta_credito'
      and (c.fecha_corte is not null or c.fecha_pago is not null)
      and public.tiene_dispositivo_push(c.user_id)
  loop
    v_dia_corte := least(coalesce(v_tarjeta.fecha_corte, -1), v_ultimo_dia_mes);
    v_dia_pago := least(coalesce(v_tarjeta.fecha_pago, -1), v_ultimo_dia_mes);
    v_titulo := null;

    if v_tarjeta.fecha_corte is not null and v_hoy = v_dia_corte - 1 then
      v_titulo := '📅 Corte mañana: ' || v_tarjeta.nombre;
      v_cuerpo := 'Tu fecha de corte es mañana. Deuda actual: $' || to_char(v_tarjeta.saldo, 'FM999,999,990.00');
    elsif v_tarjeta.fecha_corte is not null and v_hoy = v_dia_corte then
      v_titulo := '📅 Hoy es tu fecha de corte: ' || v_tarjeta.nombre;
      v_cuerpo := 'Deuda al corte: $' || to_char(v_tarjeta.saldo, 'FM999,999,990.00');
    elsif v_tarjeta.fecha_pago is not null and v_hoy = v_dia_pago - 1 then
      v_titulo := '💳 Pago mañana: ' || v_tarjeta.nombre;
      v_cuerpo := 'Mañana vence tu pago. Debes: $' || to_char(v_tarjeta.saldo, 'FM999,999,990.00');
    elsif v_tarjeta.fecha_pago is not null and v_hoy = v_dia_pago then
      v_titulo := '🔴 Hoy vence tu pago: ' || v_tarjeta.nombre;
      v_cuerpo := 'Debes: $' || to_char(v_tarjeta.saldo, 'FM999,999,990.00');
    end if;

    if v_titulo is not null then
      perform public.enviar_push(v_tarjeta.user_id, 'tarjeta', v_titulo, v_cuerpo, '/ajustes');
    end if;
  end loop;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Copiar el resultado de pg_net antes de que lo borre (lo guarda ~6 h)
--    y limpiar el registro de más de 30 días.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.revisar_resultados_push()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revisados integer;
begin
  update public.push_envios e set
    status_code = r.status_code,
    respuesta = left(r.content, 500),
    error = coalesce(r.error_msg, case when r.timed_out then 'Tiempo de espera agotado' end),
    estado = case
      when r.status_code between 200 and 299 and r.content ~ '"enviadas"\s*:\s*0\D' then 'sin_dispositivos'
      when r.status_code between 200 and 299 then 'enviado'
      else 'fallido'
    end,
    revisado_at = now()
  from net._http_response r
  where e.estado = 'pendiente' and r.id = e.request_id;
  get diagnostics v_revisados = row_count;

  update public.push_envios set estado = 'sin_respuesta', revisado_at = now()
  where estado = 'pendiente' and created_at < now() - interval '6 hours';

  delete from public.push_envios where created_at < now() - interval '30 days';

  return v_revisados;
end;
$$;

-- Solo el servidor (triggers, pg_cron, service_role) ejecuta estas funciones.
revoke all on function public.tiene_dispositivo_push(uuid) from public, anon, authenticated;
revoke all on function public.registrar_error_push(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.enviar_push(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.revisar_resultados_push() from public, anon, authenticated;
revoke all on function public.notificar_presupuesto() from public, anon, authenticated;
revoke all on function public.recordatorio_registrar_gastos() from public, anon, authenticated;
revoke all on function public.revisar_notificaciones_tarjetas_credito() from public, anon, authenticated;

-- Revisión cada 10 minutos (cron.schedule con el mismo nombre actualiza la tarea).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('revisar-resultados-push', '*/10 * * * *', 'select public.revisar_resultados_push()');
  end if;
end;
$$;
