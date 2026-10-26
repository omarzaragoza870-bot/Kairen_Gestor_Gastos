-- ============================================================
-- Kairen Finanzas - Actualización v1.1
-- Ejecutar una sola vez en Supabase > SQL Editor
-- Agrega operaciones atómicas para crear, editar y eliminar movimientos.
-- ============================================================

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
begin
  if p_tipo not in ('gasto', 'ingreso') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and user_id = auth.uid()) then raise exception 'Cuenta no válida'; end if;

  insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, descripcion, fecha)
  values (auth.uid(), p_cuenta_id, p_categoria_nombre, p_tipo, p_monto, nullif(trim(p_descripcion), ''), p_fecha)
  returning id into v_id;

  v_delta := case when p_tipo = 'gasto' then -p_monto else p_monto end;
  update public.cuentas set saldo = saldo + v_delta where id = p_cuenta_id and user_id = auth.uid();
  return v_id;
end;
$$;

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
  v_delta_anterior numeric;
  v_delta_nuevo numeric;
begin
  select * into v_anterior from public.transacciones where id = p_transaccion_id and user_id = auth.uid() for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if p_tipo not in ('gasto', 'ingreso') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and user_id = auth.uid()) then raise exception 'Cuenta no válida'; end if;

  v_delta_anterior := case when v_anterior.tipo = 'gasto' then v_anterior.monto else -v_anterior.monto end;
  update public.cuentas set saldo = saldo + v_delta_anterior where id = v_anterior.cuenta_id and user_id = auth.uid();

  update public.transacciones set
    cuenta_id = p_cuenta_id,
    categoria_nombre = p_categoria_nombre,
    tipo = p_tipo,
    monto = p_monto,
    descripcion = nullif(trim(p_descripcion), ''),
    fecha = p_fecha
  where id = p_transaccion_id and user_id = auth.uid();

  v_delta_nuevo := case when p_tipo = 'gasto' then -p_monto else p_monto end;
  update public.cuentas set saldo = saldo + v_delta_nuevo where id = p_cuenta_id and user_id = auth.uid();
end;
$$;

create or replace function public.eliminar_transaccion_segura(p_transaccion_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx public.transacciones%rowtype;
  v_reversion numeric;
begin
  select * into v_tx from public.transacciones where id = p_transaccion_id and user_id = auth.uid() for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;

  v_reversion := case when v_tx.tipo = 'gasto' then v_tx.monto else -v_tx.monto end;
  update public.cuentas set saldo = saldo + v_reversion where id = v_tx.cuenta_id and user_id = auth.uid();
  delete from public.transacciones where id = p_transaccion_id and user_id = auth.uid();
end;
$$;

grant execute on function public.crear_transaccion_segura(uuid, text, text, numeric, text, date) to authenticated;
grant execute on function public.editar_transaccion_segura(uuid, uuid, text, text, numeric, text, date) to authenticated;
grant execute on function public.eliminar_transaccion_segura(uuid) to authenticated;
