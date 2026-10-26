-- ============================================================
-- Kairen Finanzas - Tarjetas de Crédito (v2.2)
-- Correr una sola vez en Supabase > SQL Editor
--
-- Qué agrega:
--   1. Columnas nuevas en `cuentas` para soportar tipo 'tarjeta_credito'
--      (limite_credito, fecha_corte, fecha_pago). El campo `saldo` ya
--      existente pasa a representar la DEUDA ACTUAL en este tipo de cuenta.
--   2. crear_transaccion_segura / editar_transaccion_segura actualizadas:
--      en una tarjeta de crédito un GASTO SUBE la deuda (antes siempre
--      restaba saldo). No se permiten "ingresos" directos a una tarjeta
--      de crédito — para eso está el pago (punto 3).
--   3. pagar_tarjeta_credito: nueva función para el botón "Pagar tarjeta".
--      Se registra en la tabla `transferencias` ya existente, y
--      eliminar_transferencia_segura se actualiza para revertir bien
--      el efecto cuando el destino es una tarjeta de crédito.
--   4. Notificaciones automáticas un día antes y el día de la fecha de
--      corte/pago de cada tarjeta, vía pg_cron + la Edge Function
--      send-push que ya tienes desplegada.
-- ============================================================

-- ─── 1. Columnas nuevas en cuentas ─────────────────────────────────────────

alter table public.cuentas add column if not exists limite_credito numeric(12,2);
alter table public.cuentas add column if not exists fecha_corte smallint;
alter table public.cuentas add column if not exists fecha_pago smallint;

alter table public.cuentas drop constraint if exists cuentas_fecha_corte_check;
alter table public.cuentas add constraint cuentas_fecha_corte_check
  check (fecha_corte is null or (fecha_corte between 1 and 31));

alter table public.cuentas drop constraint if exists cuentas_fecha_pago_check;
alter table public.cuentas add constraint cuentas_fecha_pago_check
  check (fecha_pago is null or (fecha_pago between 1 and 31));

-- Nota: el tipo de cuenta ('efectivo' | 'tarjeta' | 'banco' | 'otro' | ahora
-- también 'tarjeta_credito') se valida en el frontend, no hay check constraint
-- en la columna `tipo` — no hace falta tocar nada más del schema por eso.


-- ─── 2. crear_transaccion_segura — gasto SUBE deuda en tarjeta de crédito ──

create or replace function public.crear_transaccion_segura(
  p_cuenta_id uuid,
  p_categoria_nombre text,
  p_tipo text,
  p_monto numeric,
  p_descripcion text,
  p_fecha date
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_delta numeric;
  v_tipo_cuenta text;
begin
  if p_tipo not in ('gasto', 'ingreso') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;

  select tipo into v_tipo_cuenta from public.cuentas where id = p_cuenta_id and user_id = auth.uid();
  if v_tipo_cuenta is null then raise exception 'Cuenta no válida'; end if;

  if v_tipo_cuenta = 'tarjeta_credito' and p_tipo = 'ingreso' then
    raise exception 'Una tarjeta de crédito no recibe ingresos directos. Usa "Pagar tarjeta".';
  end if;

  insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, descripcion, fecha)
  values (auth.uid(), p_cuenta_id, p_categoria_nombre, p_tipo, p_monto, nullif(trim(p_descripcion), ''), p_fecha)
  returning id into v_id;

  -- Cuenta normal (efectivo/débito/banco): gasto resta, ingreso suma.
  -- Tarjeta de crédito: `saldo` = deuda, así que un gasto la SUBE.
  if v_tipo_cuenta = 'tarjeta_credito' then
    v_delta := p_monto;
  else
    v_delta := case when p_tipo = 'gasto' then -p_monto else p_monto end;
  end if;

  update public.cuentas set saldo = saldo + v_delta where id = p_cuenta_id and user_id = auth.uid();
  return v_id;
end;
$$;

grant execute on function public.crear_transaccion_segura(uuid, text, text, numeric, text, date) to authenticated;


-- ─── editar_transaccion_segura — misma lógica al mover/editar montos ───────

create or replace function public.editar_transaccion_segura(
  p_transaccion_id uuid,
  p_cuenta_id uuid,
  p_categoria_nombre text,
  p_tipo text,
  p_monto numeric,
  p_descripcion text,
  p_fecha date
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_anterior public.transacciones%rowtype;
  v_tipo_cuenta_anterior text;
  v_tipo_cuenta_nueva text;
  v_delta_anterior numeric;
  v_delta_nuevo numeric;
begin
  select * into v_anterior from public.transacciones where id = p_transaccion_id and user_id = auth.uid() for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if p_tipo not in ('gasto', 'ingreso') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;

  select tipo into v_tipo_cuenta_nueva from public.cuentas where id = p_cuenta_id and user_id = auth.uid();
  if v_tipo_cuenta_nueva is null then raise exception 'Cuenta no válida'; end if;

  if v_tipo_cuenta_nueva = 'tarjeta_credito' and p_tipo = 'ingreso' then
    raise exception 'Una tarjeta de crédito no recibe ingresos directos. Usa "Pagar tarjeta".';
  end if;

  select tipo into v_tipo_cuenta_anterior from public.cuentas where id = v_anterior.cuenta_id;

  -- Revertir el efecto que tenía la transacción anterior sobre su cuenta de entonces
  if v_tipo_cuenta_anterior = 'tarjeta_credito' then
    v_delta_anterior := -v_anterior.monto;
  else
    v_delta_anterior := case when v_anterior.tipo = 'gasto' then v_anterior.monto else -v_anterior.monto end;
  end if;
  update public.cuentas set saldo = saldo + v_delta_anterior where id = v_anterior.cuenta_id and user_id = auth.uid();

  update public.transacciones set
    cuenta_id = p_cuenta_id,
    categoria_nombre = p_categoria_nombre,
    tipo = p_tipo,
    monto = p_monto,
    descripcion = nullif(trim(p_descripcion), ''),
    fecha = p_fecha
  where id = p_transaccion_id and user_id = auth.uid();

  -- Aplicar el nuevo efecto (cuenta nueva o la misma, monto nuevo o el mismo)
  if v_tipo_cuenta_nueva = 'tarjeta_credito' then
    v_delta_nuevo := p_monto;
  else
    v_delta_nuevo := case when p_tipo = 'gasto' then -p_monto else p_monto end;
  end if;
  update public.cuentas set saldo = saldo + v_delta_nuevo where id = p_cuenta_id and user_id = auth.uid();
end;
$$;

grant execute on function public.editar_transaccion_segura(uuid, uuid, text, text, numeric, text, date) to authenticated;


-- ─── 3. Pagar tarjeta de crédito ────────────────────────────────────────────
-- Sigue el mismo patrón que crear_transferencia_segura (mismo "security
-- invoker", misma tabla transferencias) pero el destino resta su deuda
-- en vez de sumar saldo.

create or replace function public.pagar_tarjeta_credito(
  p_tarjeta_id uuid,
  p_cuenta_origen_id uuid,
  p_monto numeric,
  p_fecha date,
  p_descripcion text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_origen_nombre text;
  v_origen_tipo text;
  v_tarjeta_nombre text;
  v_tarjeta_tipo text;
  v_nueva_id uuid;
begin
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_cuenta_origen_id = p_tarjeta_id then
    raise exception 'La cuenta de origen y la tarjeta no pueden ser la misma.';
  end if;

  select nombre, tipo into v_origen_nombre, v_origen_tipo from public.cuentas where id = p_cuenta_origen_id and user_id = v_user_id;
  select nombre, tipo into v_tarjeta_nombre, v_tarjeta_tipo from public.cuentas where id = p_tarjeta_id and user_id = v_user_id;

  if v_origen_nombre is null or v_tarjeta_nombre is null then
    raise exception 'Cuenta no encontrada.';
  end if;
  if v_tarjeta_tipo is distinct from 'tarjeta_credito' then
    raise exception 'La cuenta destino no es una tarjeta de crédito.';
  end if;
  if v_origen_tipo = 'tarjeta_credito' then
    raise exception 'No puedes pagar una tarjeta de crédito con otra tarjeta de crédito.';
  end if;

  update public.cuentas set saldo = saldo - p_monto where id = p_cuenta_origen_id and user_id = v_user_id;
  update public.cuentas set saldo = saldo - p_monto where id = p_tarjeta_id and user_id = v_user_id; -- baja la deuda

  insert into public.transferencias (
    user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto, descripcion, fecha
  ) values (
    v_user_id, p_cuenta_origen_id, p_tarjeta_id, v_origen_nombre, v_tarjeta_nombre, p_monto,
    coalesce(nullif(trim(p_descripcion), ''), 'Pago de tarjeta'), p_fecha
  ) returning id into v_nueva_id;

  return v_nueva_id;
end;
$$;

grant execute on function public.pagar_tarjeta_credito(uuid, uuid, numeric, date, text) to authenticated;


-- ─── eliminar_transferencia_segura — revertir bien si el destino es tarjeta ─

create or replace function public.eliminar_transferencia_segura(p_transferencia_id uuid) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registro record;
  v_tipo_destino text;
begin
  select * into v_registro from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
  if v_registro is null then
    raise exception 'Transferencia no encontrada.';
  end if;

  if v_registro.cuenta_origen_id is not null then
    update public.cuentas set saldo = saldo + v_registro.monto where id = v_registro.cuenta_origen_id and user_id = v_user_id;
  end if;

  if v_registro.cuenta_destino_id is not null then
    select tipo into v_tipo_destino from public.cuentas where id = v_registro.cuenta_destino_id;
    if v_tipo_destino = 'tarjeta_credito' then
      -- Era un pago que bajó la deuda — revertir la sube de nuevo
      update public.cuentas set saldo = saldo + v_registro.monto where id = v_registro.cuenta_destino_id and user_id = v_user_id;
    else
      update public.cuentas set saldo = saldo - v_registro.monto where id = v_registro.cuenta_destino_id and user_id = v_user_id;
    end if;
  end if;

  delete from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
end;
$$;

grant execute on function public.eliminar_transferencia_segura(uuid) to authenticated;


-- ─── 4. Notificaciones de corte y pago ──────────────────────────────────────

create extension if not exists pg_cron;

-- security definer a propósito: necesita ver las tarjetas de TODOS los
-- usuarios para revisar fechas (RLS se lo impediría). No se le da grant a
-- authenticated/anon, así que nadie puede invocarla vía la API — solo el
-- scheduler interno de pg_cron.
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
      and exists (select 1 from public.push_subscriptions p where p.user_id = c.user_id)
  loop
    -- Si el mes tiene menos días que la fecha configurada (ej. corte=31 en
    -- febrero), se usa el último día real del mes.
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
      begin
        perform net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/send-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
          ),
          body := jsonb_build_object(
            'user_id', v_tarjeta.user_id::text,
            'title', v_titulo,
            'body', v_cuerpo,
            'url', '/ajustes'
          )
        );
      exception when others then
        null; -- no interrumpir el loop por una tarjeta con error
      end;
    end if;
  end loop;
end;
$$;

-- Corre todos los días a las 9:00am hora de Ciudad de México (UTC-6 todo el
-- año, México ya no usa horario de verano). 9am CDMX = 15:00 UTC.
select cron.unschedule('revisar-tarjetas-credito')
where exists (select 1 from cron.job where jobname = 'revisar-tarjetas-credito');

select cron.schedule(
  'revisar-tarjetas-credito',
  '0 15 * * *',
  $$ select public.revisar_notificaciones_tarjetas_credito() $$
);

-- ─── IMPORTANTE ─────────────────────────────────────────────────────────────
-- Si no lo hiciste ya para las notificaciones de presupuesto (v2.1), esta
-- función también depende de estas dos variables de Postgres:
--
--   alter database postgres set app.supabase_url = 'https://iemyltuapdpdjxegxjhn.supabase.co';
--   alter database postgres set app.service_role_key = 'TU_SERVICE_ROLE_KEY_AQUI';
--
-- Si ya las configuraste antes, no hace falta repetirlo.
