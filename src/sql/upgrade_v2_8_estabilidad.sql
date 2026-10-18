-- ============================================================
-- Kairen Finanzas - Estabilidad (v2.8)
-- Ejecutar UNA sola vez en Supabase > SQL Editor, completo, de una vez.
-- Todo el archivo es idempotente: si se vuelve a correr no rompe nada.
--
-- Qué agrega / corrige:
--   1. operaciones_cliente + crear_transaccion_idempotente y
--      crear_transferencia_idempotente: una operación capturada en el
--      teléfono (con o sin internet) se registra UNA sola vez aunque la
--      app la reintente. No modifica crear_transaccion_segura ni
--      crear_transferencia_segura: las envuelve.
--   2. eliminar_transaccion_segura: al borrar un gasto hecho con tarjeta
--      de crédito, la deuda ahora BAJA (antes volvía a subir).
--   3. registrar_contribucion_meta: abono/retiro + total de la meta en una
--      sola operación atómica. Funciona también para colaboradores de
--      metas compartidas en grupo.
--   4. procesar_recurrentes: usa la fecha de México (no la de UTC), no
--      duplica si la app se abre en dos dispositivos al mismo tiempo,
--      respeta el día original del mes (31 → 28/29/30 → 31) y una
--      recurrente con cuenta borrada ya no bloquea a las demás.
--   5. importar_respaldo: restauración atómica (o entra todo, o nada) y
--      solo sobre una cuenta vacía, para no duplicar información.
-- ============================================================


-- ─── 1. Idempotencia de operaciones del cliente ─────────────────────────────

create table if not exists public.operaciones_cliente (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_op_id text not null check (char_length(client_op_id) between 8 and 100),
  accion text not null,
  resultado_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, client_op_id)
);

alter table public.operaciones_cliente enable row level security;

drop policy if exists "usuarios ven sus propias operaciones" on public.operaciones_cliente;
create policy "usuarios ven sus propias operaciones" on public.operaciones_cliente
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create or replace function public.crear_transaccion_idempotente(
  p_client_op_id text,
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
  v_uid uuid := auth.uid();
  v_accion text;
  v_existente uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.'; end if;
  if p_client_op_id is null or char_length(p_client_op_id) not between 8 and 100 then
    raise exception 'Identificador de operación inválido.';
  end if;

  -- Si dos intentos llegan al mismo tiempo, el segundo espera aquí a que
  -- el primero termine y después cae en la rama "ya procesada".
  insert into public.operaciones_cliente (user_id, client_op_id, accion)
  values (v_uid, p_client_op_id, 'crearTransaccion')
  on conflict (user_id, client_op_id) do nothing;

  if not found then
    select accion, resultado_id into v_accion, v_existente
    from public.operaciones_cliente
    where user_id = v_uid and client_op_id = p_client_op_id;

    if v_accion is distinct from 'crearTransaccion' then
      raise exception 'Identificador de operación repetido.';
    end if;
    return v_existente; -- ya se había registrado: no se vuelve a crear
  end if;

  -- Si esto falla, se revierte también el registro de la operación y el
  -- reintento podrá volver a intentarlo.
  v_id := public.crear_transaccion_segura(p_cuenta_id, p_categoria_nombre, p_tipo, p_monto, p_descripcion, p_fecha);

  update public.operaciones_cliente set resultado_id = v_id
  where user_id = v_uid and client_op_id = p_client_op_id;

  return v_id;
end;
$$;


create or replace function public.crear_transferencia_idempotente(
  p_client_op_id text,
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_monto numeric,
  p_descripcion text,
  p_fecha date
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_accion text;
  v_existente uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.'; end if;
  if p_client_op_id is null or char_length(p_client_op_id) not between 8 and 100 then
    raise exception 'Identificador de operación inválido.';
  end if;

  insert into public.operaciones_cliente (user_id, client_op_id, accion)
  values (v_uid, p_client_op_id, 'crearTransferencia')
  on conflict (user_id, client_op_id) do nothing;

  if not found then
    select accion, resultado_id into v_accion, v_existente
    from public.operaciones_cliente
    where user_id = v_uid and client_op_id = p_client_op_id;

    if v_accion is distinct from 'crearTransferencia' then
      raise exception 'Identificador de operación repetido.';
    end if;
    return v_existente;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  -- crear_transferencia_segura no distingue tarjetas de crédito: una
  -- "transferencia" hacia una tarjeta le SUMARÍA deuda. Los pagos de
  -- tarjeta van por pagar_tarjeta_credito.
  if exists (
    select 1 from public.cuentas
    where user_id = v_uid
      and id in (p_cuenta_origen_id, p_cuenta_destino_id)
      and tipo = 'tarjeta_credito'
  ) then
    raise exception 'Las tarjetas de crédito no usan transferencias. Usa "Pagar tarjeta".';
  end if;

  v_id := public.crear_transferencia_segura(p_cuenta_origen_id, p_cuenta_destino_id, p_monto, p_descripcion, p_fecha);

  update public.operaciones_cliente set resultado_id = v_id
  where user_id = v_uid and client_op_id = p_client_op_id;

  return v_id;
end;
$$;

revoke all on function public.crear_transaccion_idempotente(text, uuid, text, text, numeric, text, date) from public, anon;
grant execute on function public.crear_transaccion_idempotente(text, uuid, text, text, numeric, text, date) to authenticated;
revoke all on function public.crear_transferencia_idempotente(text, uuid, uuid, numeric, text, date) from public, anon;
grant execute on function public.crear_transferencia_idempotente(text, uuid, uuid, numeric, text, date) to authenticated;


-- ─── 2. Eliminar movimiento: revertir bien en tarjetas de crédito ──────────
-- En una tarjeta de crédito `saldo` es la deuda y un gasto la SUBE
-- (upgrade_v2_3). La versión anterior de esta función revertía como si
-- fuera una cuenta normal, así que borrar un gasto con tarjeta volvía a
-- subir la deuda en vez de bajarla.

create or replace function public.eliminar_transaccion_segura(p_transaccion_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
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

grant execute on function public.eliminar_transaccion_segura(uuid) to authenticated;


-- ─── 3. Contribuciones a metas en una sola operación ───────────────────────
-- security definer a propósito: un colaborador de una meta compartida no
-- es dueño de la fila en `metas`, así que RLS le impediría actualizar el
-- total. Por eso el permiso se valida aquí a mano: dueño de la meta, o
-- miembro de un grupo con el que la meta está compartida.

create or replace function public.registrar_contribucion_meta(
  p_meta_id uuid,
  p_tipo text,
  p_monto numeric,
  p_nota text default null,
  p_fecha date default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_meta public.metas%rowtype;
  v_nuevo numeric;
begin
  if v_uid is null then raise exception 'Tu sesión expiró. Vuelve a iniciar sesión.'; end if;
  if p_tipo not in ('contribucion', 'retiro') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;

  -- for update: dos abonos simultáneos se aplican uno después del otro
  select * into v_meta from public.metas where id = p_meta_id for update;
  if not found then raise exception 'Meta no encontrada.'; end if;

  if v_meta.user_id <> v_uid and not exists (
    select 1
    from public.metas_grupo mg
    join public.miembros_grupo mb on mb.grupo_id = mg.grupo_id
    where mg.meta_id = p_meta_id and mb.user_id = v_uid
  ) then
    raise exception 'Meta no encontrada.';
  end if;

  if p_tipo = 'retiro' and p_monto > v_meta.monto_actual then
    raise exception 'No puedes retirar más de lo que llevas ahorrado en esta meta.';
  end if;

  insert into public.meta_contribuciones (user_id, meta_id, tipo, monto, nota, fecha)
  values (
    v_uid, p_meta_id, p_tipo, p_monto,
    left(nullif(trim(p_nota), ''), 200),
    coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date)
  );

  v_nuevo := case when p_tipo = 'contribucion'
    then v_meta.monto_actual + p_monto
    else v_meta.monto_actual - p_monto
  end;

  update public.metas
  set monto_actual = v_nuevo,
      completada = v_nuevo >= monto_objetivo
  where id = p_meta_id;

  return v_nuevo;
end;
$$;

revoke all on function public.registrar_contribucion_meta(uuid, text, numeric, text, date) from public, anon;
grant execute on function public.registrar_contribucion_meta(uuid, text, numeric, text, date) to authenticated;


-- ─── 4. Recurrentes ─────────────────────────────────────────────────────────

-- Suma meses respetando el día original: 31-ene + 1 mes = 28/29-feb,
-- y 28-feb + 1 mes con día original 31 = 31-mar (no se "encoge").
create or replace function public.sumar_meses_con_dia(p_fecha date, p_meses int, p_dia int)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_primero date;
  v_ultimo_dia int;
begin
  v_primero := (date_trunc('month', p_fecha::timestamp) + make_interval(months => p_meses))::date;
  v_ultimo_dia := extract(day from ((v_primero + interval '1 month')::date - 1))::int;
  return v_primero + (least(greatest(p_dia, 1), v_ultimo_dia) - 1);
end;
$$;

-- La versión anterior no recibía parámetros. Se elimina para que no haya
-- dos versiones y la llamada sin argumentos no sea ambigua.
drop function if exists public.procesar_recurrentes();

create or replace function public.procesar_recurrentes(p_hoy date default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hoy_mx date := (now() at time zone 'America/Mexico_City')::date;
  v_hoy date;
  v_rec record;
  v_fecha date;
  v_dia int;
  v_creadas int;
  v_total int := 0;
begin
  if v_uid is null then return 0; end if;

  -- Se usa la fecha local del dispositivo (la app la manda), pero solo si
  -- está a ±1 día de la fecha de México; si no, se usa la de México.
  v_hoy := case
    when p_hoy is not null and p_hoy between v_hoy_mx - 1 and v_hoy_mx + 1 then p_hoy
    else v_hoy_mx
  end;

  for v_rec in
    select * from public.recurrentes
    where user_id = v_uid
      and activa = true
      and proxima_fecha <= v_hoy
    order by proxima_fecha
    for update skip locked -- si otro dispositivo ya la está procesando, se salta
  loop
    v_fecha := v_rec.proxima_fecha;
    v_dia := coalesce(v_rec.dia_del_mes, extract(day from v_rec.proxima_fecha)::int);
    v_creadas := 0;

    begin
      -- Pone al corriente todos los periodos vencidos (máximo 366 por vez)
      while v_fecha <= v_hoy and v_creadas < 366 loop
        perform public.crear_transaccion_segura(
          v_rec.cuenta_id,
          v_rec.categoria_nombre,
          v_rec.tipo,
          v_rec.monto,
          v_rec.descripcion,
          v_fecha
        );
        v_creadas := v_creadas + 1;

        v_fecha := case v_rec.frecuencia
          when 'diario'    then v_fecha + 1
          when 'semanal'   then v_fecha + 7
          when 'quincenal' then v_fecha + 15
          when 'mensual'   then public.sumar_meses_con_dia(v_fecha, 1, v_dia)
          when 'anual'     then public.sumar_meses_con_dia(v_fecha, 12, v_dia)
          else v_fecha + 1
        end;
      end loop;

      update public.recurrentes
      set proxima_fecha = v_fecha,
          dia_del_mes = case when frecuencia in ('mensual', 'anual') then v_dia else dia_del_mes end
      where id = v_rec.id;

      v_total := v_total + v_creadas;
    exception when others then
      -- Ej. la cuenta de esta recurrente fue eliminada: se omite esta
      -- (sin crear nada de ella) y se sigue con las demás.
      raise warning 'procesar_recurrentes: recurrente % omitida: %', v_rec.id, sqlerrm;
    end;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.procesar_recurrentes(date) from public, anon;
grant execute on function public.procesar_recurrentes(date) to authenticated;


-- ─── 5. Restaurar respaldo de forma atómica ─────────────────────────────────
-- Todo ocurre dentro de una sola transacción: si cualquier fila falla,
-- no se guarda nada. Solo se permite sobre una cuenta sin movimientos,
-- para no duplicar información. Las cuentas, categorías y presupuestos
-- por defecto se reemplazan por los del respaldo.

create or replace function public.importar_respaldo(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
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
  insert into public.transacciones (user_id, cuenta_id, categoria_id, categoria_nombre, tipo, monto, descripcion, fecha, created_at)
  select
    v_uid,
    (v_map_cuentas->>(e->>'cuenta_id'))::uuid,
    (v_map_categorias->>(e->>'categoria_id'))::uuid,
    coalesce(nullif(e->>'categoria_nombre', ''), 'Sin categoría'),
    e->>'tipo',
    (e->>'monto')::numeric,
    e->>'descripcion',
    (e->>'fecha')::date,
    coalesce((e->>'created_at')::timestamptz, now())
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

revoke all on function public.importar_respaldo(jsonb) from public, anon;
grant execute on function public.importar_respaldo(jsonb) to authenticated;


-- ─── Comprobación ───────────────────────────────────────────────────────────
-- Al final debe listar 7 funciones (procesar_recurrentes con 1 argumento).
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'crear_transaccion_idempotente', 'crear_transferencia_idempotente',
    'eliminar_transaccion_segura', 'registrar_contribucion_meta',
    'sumar_meses_con_dia', 'procesar_recurrentes', 'importar_respaldo'
  )
order by 1;
