-- 20261029000000_compras_a_meses.sql
--
-- Compras con tarjeta de crédito a meses sin intereses. Una compra a N meses
-- se guarda como N gastos (una mensualidad por mes, mismo día de la compra)
-- ligados por compra_meses_id. Se crean juntos y la deuda de la tarjeta sube
-- el total de una vez, igual que en el banco; Análisis, Inicio y los
-- presupuestos ven cada mensualidad en su mes sin cambiar nada más.
--
-- Una mensualidad no se edita ni se borra sola: se elimina la compra completa.

alter table public.transacciones
  add column if not exists compra_meses_id uuid,
  add column if not exists mensualidad smallint,
  add column if not exists meses smallint;

alter table public.transacciones drop constraint if exists transacciones_compra_meses_check;
alter table public.transacciones add constraint transacciones_compra_meses_check check (
  (compra_meses_id is null and mensualidad is null and meses is null)
  or (compra_meses_id is not null and meses is not null and mensualidad is not null
      and meses between 2 and 48 and mensualidad between 1 and meses)
);

create index if not exists transacciones_compra_meses_idx
  on public.transacciones (user_id, compra_meses_id)
  where compra_meses_id is not null;

-- ------------------------------------------------------------------
-- Crear la compra (con el mismo esquema de idempotencia que la cola offline)
-- ------------------------------------------------------------------
create or replace function public.crear_compra_meses_idempotente(
  p_client_op_id text,
  p_cuenta_id uuid,
  p_categoria_nombre text,
  p_monto numeric,
  p_meses integer,
  p_descripcion text,
  p_fecha date
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_accion text;
  v_existente uuid;
  v_tipo_cuenta text;
  v_compra uuid := gen_random_uuid();
  v_base numeric;
  v_dia int;
begin
  if v_uid is null then raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.'; end if;
  if p_client_op_id is null or char_length(p_client_op_id) not between 8 and 100 then
    raise exception 'Identificador de operación inválido.';
  end if;

  insert into public.operaciones_cliente (user_id, client_op_id, accion)
  values (v_uid, p_client_op_id, 'crearCompraMeses')
  on conflict (user_id, client_op_id) do nothing;

  if not found then
    select accion, resultado_id into v_accion, v_existente
    from public.operaciones_cliente
    where user_id = v_uid and client_op_id = p_client_op_id;

    if v_accion is distinct from 'crearCompraMeses' then
      raise exception 'Identificador de operación repetido.';
    end if;
    return v_existente;
  end if;

  -- Centavos exactos: así la suma de las filas numeric(12,2) es igual a lo que sube la deuda
  p_monto := round(p_monto, 2);
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_meses is null or p_meses not between 2 and 48 then raise exception 'El número de meses debe estar entre 2 y 48.'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la compra.'; end if;

  select tipo into v_tipo_cuenta from public.cuentas where id = p_cuenta_id and user_id = v_uid;
  if v_tipo_cuenta is null then raise exception 'Cuenta no válida'; end if;
  if v_tipo_cuenta <> 'tarjeta_credito' then
    raise exception 'Solo las compras con tarjeta de crédito se pueden diferir a meses.';
  end if;

  -- Cada mensualidad se redondea hacia abajo al centavo; la primera absorbe
  -- los centavos que sobran para que la suma sea exactamente el total.
  v_base := trunc(p_monto / p_meses, 2);
  if v_base <= 0 then raise exception 'El monto es muy pequeño para dividirlo en % meses.', p_meses; end if;
  v_dia := extract(day from p_fecha)::int;

  insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, descripcion, fecha, compra_meses_id, mensualidad, meses)
  select
    v_uid, p_cuenta_id, p_categoria_nombre, 'gasto',
    case when n = 1 then p_monto - v_base * (p_meses - 1) else v_base end,
    nullif(trim(p_descripcion), ''),
    public.sumar_meses_con_dia(p_fecha, n - 1, v_dia),
    v_compra, n, p_meses
  from generate_series(1, p_meses) as n;

  -- Saldo de una tarjeta = deuda: sube el total de la compra
  update public.cuentas set saldo = saldo + p_monto where id = p_cuenta_id and user_id = v_uid;

  update public.operaciones_cliente set resultado_id = v_compra
  where user_id = v_uid and client_op_id = p_client_op_id;

  return v_compra;
end;
$$;

revoke all on function public.crear_compra_meses_idempotente(text, uuid, text, numeric, integer, text, date) from public, anon;
grant execute on function public.crear_compra_meses_idempotente(text, uuid, text, numeric, integer, text, date) to authenticated, service_role;

-- ------------------------------------------------------------------
-- Eliminar la compra completa (todas sus mensualidades)
-- ------------------------------------------------------------------
create or replace function public.eliminar_compra_meses(p_compra_meses_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_grupo record;
begin
  perform 1 from public.transacciones
  where compra_meses_id = p_compra_meses_id and user_id = v_uid
  for update;
  if not found then raise exception 'Compra no encontrada'; end if;

  -- Se revierte por cuenta, como eliminar_transaccion_segura con cada fila,
  -- por si alguna mensualidad quedó en otra cuenta o sin cuenta.
  for v_grupo in
    select t.cuenta_id, c.tipo, sum(t.monto) as total
    from public.transacciones t
    left join public.cuentas c on c.id = t.cuenta_id and c.user_id = v_uid
    where t.compra_meses_id = p_compra_meses_id and t.user_id = v_uid and t.cuenta_id is not null
    group by t.cuenta_id, c.tipo
  loop
    update public.cuentas
    set saldo = saldo + case when v_grupo.tipo = 'tarjeta_credito' then -v_grupo.total else v_grupo.total end
    where id = v_grupo.cuenta_id and user_id = v_uid;
  end loop;

  delete from public.transacciones where compra_meses_id = p_compra_meses_id and user_id = v_uid;
end;
$$;

revoke all on function public.eliminar_compra_meses(uuid) from public, anon;
grant execute on function public.eliminar_compra_meses(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------
-- Editar / eliminar un movimiento: igual que antes, pero sin tocar mensualidades
-- ------------------------------------------------------------------
create or replace function public.editar_transaccion_segura(p_transaccion_id uuid, p_cuenta_id uuid, p_categoria_nombre text, p_tipo text, p_monto numeric, p_descripcion text, p_fecha date)
 returns void
 language plpgsql
 set search_path to 'public'
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
  if v_anterior.compra_meses_id is not null then
    raise exception 'Es una mensualidad de una compra a meses. Para cambiarla, elimina la compra y regístrala de nuevo.';
  end if;
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

create or replace function public.eliminar_transaccion_segura(p_transaccion_id uuid)
 returns void
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_tx public.transacciones%rowtype;
  v_tipo_cuenta text;
  v_reversion numeric;
begin
  select * into v_tx from public.transacciones
  where id = p_transaccion_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if v_tx.compra_meses_id is not null then
    raise exception 'Es una mensualidad de una compra a meses: elimina la compra completa.';
  end if;

  if v_tx.cuenta_id is not null then
    select tipo into v_tipo_cuenta from public.cuentas
    where id = v_tx.cuenta_id and user_id = auth.uid();

    if v_tipo_cuenta = 'tarjeta_credito' then
      v_reversion := -v_tx.monto; -- el gasto había subido la deuda: ahora baja
    else
      v_reversion := case when v_tx.tipo = 'gasto' then v_tx.monto else -v_tx.monto end;
    end if;

    update public.cuentas set saldo = saldo + v_reversion
    where id = v_tx.cuenta_id and user_id = auth.uid();
  end if;

  delete from public.transacciones where id = p_transaccion_id and user_id = auth.uid();
end;
$$;

-- ------------------------------------------------------------------
-- Aviso de presupuesto: solo cuenta el mes actual. Antes sumaba todo desde
-- el día 1 sin límite superior, así que las mensualidades futuras (o
-- cualquier gasto con fecha adelantada) inflaban el presupuesto de este mes.
-- "Hoy" es el de México, como en procesar_recurrentes: en UTC el mes
-- cambiaba a las 6 pm del último día.
-- ------------------------------------------------------------------
create or replace function public.notificar_presupuesto()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_presupuesto record;
  v_gastado numeric;
  v_porcentaje numeric;
  v_titulo text;
  v_cuerpo text;
  v_inicio_mes date := date_trunc('month', (now() at time zone 'America/Mexico_City')::date)::date;
  v_inicio_siguiente date := (v_inicio_mes + interval '1 month')::date;
begin
  if NEW.tipo <> 'gasto'
     or NEW.fecha < v_inicio_mes or NEW.fecha >= v_inicio_siguiente
     or not public.tiene_dispositivo_push(NEW.user_id) then
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
    and fecha >= v_inicio_mes
    and fecha < v_inicio_siguiente;

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

-- ------------------------------------------------------------------
-- Avisos de corte y pago: el monto es lo que entra en el estado de cuenta.
-- Las mensualidades con fecha posterior al corte ya están en la deuda, pero
-- se muestran aparte para no pedir pagar toda la compra a meses de golpe.
--   - Avisos de corte: el corte de este mes (el de hoy o mañana).
--   - Avisos de pago: el último corte que ya pasó.
--   - Sin día de corte: fin de mes.
-- Lo pendiente nunca pasa de la deuda: si ya pagaste la tarjeta, no queda nada a meses.
-- ------------------------------------------------------------------
create or replace function public.revisar_notificaciones_tarjetas_credito()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_tarjeta record;
  v_fecha_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_hoy int := extract(day from v_fecha_hoy);
  v_ultimo_dia_mes int := extract(day from (date_trunc('month', v_fecha_hoy) + interval '1 month - 1 day'));
  v_dia_corte int;
  v_dia_pago int;
  v_titulo text;
  v_cuerpo text;
  v_es_corte boolean;
  v_corte_mes date;
  v_hasta date;
  v_pendiente numeric;
  v_pago numeric;
  v_extra text;
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

    v_es_corte := v_tarjeta.fecha_corte is not null and v_hoy in (v_dia_corte - 1, v_dia_corte);
    if not v_es_corte
       and not (v_tarjeta.fecha_pago is not null and v_hoy in (v_dia_pago - 1, v_dia_pago)) then
      continue;
    end if;

    -- Último día que entra en el estado de cuenta que se avisa
    if v_tarjeta.fecha_corte is null then
      v_hasta := (date_trunc('month', v_fecha_hoy) + interval '1 month - 1 day')::date;
    else
      v_corte_mes := public.sumar_meses_con_dia(v_fecha_hoy, 0, v_tarjeta.fecha_corte);
      v_hasta := case
        when v_es_corte or v_corte_mes <= v_fecha_hoy then v_corte_mes
        else public.sumar_meses_con_dia(v_fecha_hoy, -1, v_tarjeta.fecha_corte)
      end;
    end if;

    select coalesce(sum(t.monto), 0) into v_pendiente
    from public.transacciones t
    where t.cuenta_id = v_tarjeta.id
      and t.compra_meses_id is not null
      and t.fecha > v_hasta;
    v_pendiente := least(v_pendiente, greatest(v_tarjeta.saldo, 0));
    v_pago := greatest(v_tarjeta.saldo - v_pendiente, 0);
    v_extra := case when v_pendiente > 0
      then ' (más $' || to_char(v_pendiente, 'FM999,999,990.00') || ' a meses)'
      else '' end;

    if v_tarjeta.fecha_corte is not null and v_hoy = v_dia_corte - 1 then
      v_titulo := '📅 Corte mañana: ' || v_tarjeta.nombre;
      v_cuerpo := 'Tu fecha de corte es mañana. Deuda actual: $' || to_char(v_pago, 'FM999,999,990.00') || v_extra;
    elsif v_tarjeta.fecha_corte is not null and v_hoy = v_dia_corte then
      v_titulo := '📅 Hoy es tu fecha de corte: ' || v_tarjeta.nombre;
      v_cuerpo := 'Deuda al corte: $' || to_char(v_pago, 'FM999,999,990.00') || v_extra;
    elsif v_tarjeta.fecha_pago is not null and v_hoy = v_dia_pago - 1 then
      v_titulo := '💳 Pago mañana: ' || v_tarjeta.nombre;
      v_cuerpo := 'Mañana vence tu pago. Debes: $' || to_char(v_pago, 'FM999,999,990.00') || v_extra;
    elsif v_tarjeta.fecha_pago is not null and v_hoy = v_dia_pago then
      v_titulo := '🔴 Hoy vence tu pago: ' || v_tarjeta.nombre;
      v_cuerpo := 'Debes: $' || to_char(v_pago, 'FM999,999,990.00') || v_extra;
    end if;

    if v_titulo is not null then
      perform public.enviar_push(v_tarjeta.user_id, 'tarjeta', v_titulo, v_cuerpo, '/ajustes');
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------
-- Importar respaldo: conserva las compras a meses (sus tres columnas).
-- Es la misma función de 20261026000002_importar_respaldo.sql con eso agregado.
-- ------------------------------------------------------------------
create or replace function public.importar_respaldo(p_datos jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dueno_original text;
  v_map_cuentas jsonb;
  v_map_categorias jsonb;
  v_map_metas jsonb;
  v_n_cuentas int := 0;
  v_n_categorias int := 0;
  v_n_metas int := 0;
  v_n_contribuciones int := 0;
  v_n_transacciones int := 0;
  v_n_transferencias int := 0;
  v_n_recurrentes int := 0;
  v_n_ahorro int := 0;
  v_n_presupuestos int := 0;
begin
  if v_uid is null then raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.'; end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object'
     or jsonb_typeof(p_datos->'cuentas') is distinct from 'array'
     or jsonb_typeof(p_datos->'categorias') is distinct from 'array'
     or jsonb_typeof(p_datos->'transacciones') is distinct from 'array'
     or jsonb_typeof(p_datos->'metas') is distinct from 'array' then
    raise exception 'El archivo no tiene el formato de un respaldo de Kairen Finanzas.';
  end if;

  if jsonb_array_length(p_datos->'transacciones') > 200000 then
    raise exception 'El respaldo es demasiado grande para restaurarse desde la app.';
  end if;

  if exists (select 1 from public.transacciones where user_id = v_uid)
     or exists (select 1 from public.transferencias where user_id = v_uid)
     or exists (select 1 from public.metas where user_id = v_uid)
     or exists (select 1 from public.meta_contribuciones where user_id = v_uid)
     or exists (select 1 from public.recurrentes where user_id = v_uid)
     or exists (select 1 from public.ahorro_externo where user_id = v_uid) then
    raise exception 'Para restaurar un respaldo tu cuenta debe estar vacía. Reinicia tu cuenta en Ajustes y vuelve a importar.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_datos->'transacciones') e
    where coalesce(e->>'tipo', '') not in ('gasto', 'ingreso')
       or coalesce((e->>'monto')::numeric, 0) <= 0
  ) then
    raise exception 'El respaldo tiene movimientos con tipo o monto inválido.';
  end if;

  -- La configuración inicial se reemplaza por la del respaldo
  delete from public.presupuestos where user_id = v_uid;
  delete from public.categorias where user_id = v_uid;
  delete from public.cuentas where user_id = v_uid;

  -- Respaldos anteriores incluían metas compartidas de otras personas.
  -- Solo se restauran las del dueño original del respaldo.
  v_dueno_original := p_datos->'cuentas'->0->>'user_id';

  -- Mapas id-viejo -> id-nuevo
  select coalesce(jsonb_object_agg(e->>'id', gen_random_uuid()), '{}'::jsonb) into v_map_cuentas
  from jsonb_array_elements(p_datos->'cuentas') e
  where e->>'id' is not null;

  select coalesce(jsonb_object_agg(e->>'id', gen_random_uuid()), '{}'::jsonb) into v_map_categorias
  from jsonb_array_elements(p_datos->'categorias') e
  where e->>'id' is not null;

  select coalesce(jsonb_object_agg(e->>'id', gen_random_uuid()), '{}'::jsonb) into v_map_metas
  from jsonb_array_elements(p_datos->'metas') e
  where e->>'id' is not null
    and (v_dueno_original is null or e->>'user_id' is null or e->>'user_id' = v_dueno_original);

  -- Cuentas (incluye la configuración de tarjetas de crédito)
  insert into public.cuentas (id, user_id, nombre, tipo, saldo, limite_credito, fecha_corte, fecha_pago, created_at)
  select
    (v_map_cuentas->>(e->>'id'))::uuid,
    v_uid,
    coalesce(nullif(trim(e->>'nombre'), ''), 'Cuenta'),
    coalesce(nullif(e->>'tipo', ''), 'otro'),
    coalesce((e->>'saldo')::numeric, 0),
    (e->>'limite_credito')::numeric,
    (e->>'fecha_corte')::smallint,
    (e->>'fecha_pago')::smallint,
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(p_datos->'cuentas') e
  where e->>'id' is not null;
  get diagnostics v_n_cuentas = row_count;

  insert into public.categorias (id, user_id, nombre, tipo, icono, created_at)
  select
    (v_map_categorias->>(e->>'id'))::uuid,
    v_uid,
    e->>'nombre',
    e->>'tipo',
    coalesce(e->>'icono', '🏷️'),
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(p_datos->'categorias') e
  where e->>'id' is not null;
  get diagnostics v_n_categorias = row_count;

  insert into public.metas (id, user_id, nombre, descripcion, icono, prioridad, monto_objetivo, monto_actual, fecha_limite, completada, created_at)
  select
    (v_map_metas->>(e->>'id'))::uuid,
    v_uid,
    e->>'nombre',
    e->>'descripcion',
    coalesce(e->>'icono', '🎯'),
    case when e->>'prioridad' in ('baja', 'media', 'alta') then e->>'prioridad' else 'media' end,
    (e->>'monto_objetivo')::numeric,
    coalesce((e->>'monto_actual')::numeric, 0),
    (e->>'fecha_limite')::date,
    coalesce((e->>'completada')::boolean, false),
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(p_datos->'metas') e
  where v_map_metas ? (e->>'id');
  get diagnostics v_n_metas = row_count;

  insert into public.meta_contribuciones (user_id, meta_id, tipo, monto, nota, fecha, created_at)
  select
    v_uid,
    (v_map_metas->>(e->>'meta_id'))::uuid,
    e->>'tipo',
    (e->>'monto')::numeric,
    e->>'nota',
    coalesce((e->>'fecha')::date, current_date),
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_datos->'meta_contribuciones', '[]'::jsonb)) e
  where v_map_metas ? (e->>'meta_id');
  get diagnostics v_n_contribuciones = row_count;

  -- Los movimientos se insertan tal cual (sin volver a mover saldos): los
  -- saldos de las cuentas ya vienen calculados en el respaldo.
  insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, descripcion, fecha, created_at, compra_meses_id, mensualidad, meses)
  select
    v_uid,
    (v_map_cuentas->>(e->>'cuenta_id'))::uuid,
    coalesce(nullif(e->>'categoria_nombre', ''), 'Sin categoría'),
    e->>'tipo',
    (e->>'monto')::numeric,
    e->>'descripcion',
    (e->>'fecha')::date,
    coalesce((e->>'created_at')::timestamptz, now()),
    (e->>'compra_meses_id')::uuid,
    (e->>'mensualidad')::smallint,
    (e->>'meses')::smallint
  from jsonb_array_elements(p_datos->'transacciones') e;
  get diagnostics v_n_transacciones = row_count;

  insert into public.transferencias (user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto, descripcion, fecha, created_at)
  select
    v_uid,
    (v_map_cuentas->>(e->>'cuenta_origen_id'))::uuid,
    (v_map_cuentas->>(e->>'cuenta_destino_id'))::uuid,
    coalesce(e->>'cuenta_origen_nombre', 'Cuenta'),
    coalesce(e->>'cuenta_destino_nombre', 'Cuenta'),
    (e->>'monto')::numeric,
    e->>'descripcion',
    (e->>'fecha')::date,
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_datos->'transferencias', '[]'::jsonb)) e;
  get diagnostics v_n_transferencias = row_count;

  insert into public.recurrentes (user_id, cuenta_id, cuenta_nombre, tipo, categoria_nombre, monto, descripcion, frecuencia, dia_del_mes, proxima_fecha, activa, created_at)
  select
    v_uid,
    (v_map_cuentas->>(e->>'cuenta_id'))::uuid,
    coalesce(e->>'cuenta_nombre', 'Cuenta'),
    e->>'tipo',
    e->>'categoria_nombre',
    (e->>'monto')::numeric,
    e->>'descripcion',
    e->>'frecuencia',
    (e->>'dia_del_mes')::int,
    (e->>'proxima_fecha')::date,
    coalesce((e->>'activa')::boolean, true),
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_datos->'recurrentes', '[]'::jsonb)) e;
  get diagnostics v_n_recurrentes = row_count;

  insert into public.ahorro_externo (user_id, nombre_banco, monto, fecha_registro, nota, created_at)
  select
    v_uid,
    e->>'nombre_banco',
    (e->>'monto')::numeric,
    coalesce((e->>'fecha_registro')::date, current_date),
    e->>'nota',
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_datos->'ahorro_externo', '[]'::jsonb)) e;
  get diagnostics v_n_ahorro = row_count;

  -- Presupuestos al final: así el trigger de alertas de presupuesto no
  -- manda notificaciones por cada movimiento restaurado.
  insert into public.presupuestos (user_id, categoria_nombre, monto_limite, created_at)
  select
    v_uid,
    e->>'categoria_nombre',
    (e->>'monto_limite')::numeric,
    coalesce((e->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_datos->'presupuestos', '[]'::jsonb)) e
  on conflict (user_id, categoria_nombre) do nothing;
  get diagnostics v_n_presupuestos = row_count;

  return jsonb_build_object(
    'cuentas', v_n_cuentas,
    'categorias', v_n_categorias,
    'metas', v_n_metas,
    'meta_contribuciones', v_n_contribuciones,
    'transacciones', v_n_transacciones,
    'transferencias', v_n_transferencias,
    'recurrentes', v_n_recurrentes,
    'ahorro_externo', v_n_ahorro,
    'presupuestos', v_n_presupuestos
  );
end;
$$;
