-- ============================================================
-- Kairen Finanzas - Fix de seguridad (v1.8)
-- Correr una sola vez en Supabase > SQL Editor
--
-- Por qué: crear_transferencia_segura y eliminar_transferencia_segura
-- se escribieron originalmente con "security definer", que corre con
-- privilegios elevados y SALTA las políticas de RLS. Ya validaban
-- "user_id = auth.uid()" manualmente en cada paso, así que no había
-- una vulnerabilidad real — pero no hacía falta el privilegio elevado
-- para nada: el usuario ya tiene permiso vía RLS para tocar sus propias
-- filas. Este fix las cambia a "security invoker" (mismo patrón que ya
-- usan crear_transaccion_segura, editar_transaccion_segura y
-- eliminar_transaccion_segura), quedando RLS como capa de protección
-- real en vez de solo una verificación manual.
-- ============================================================

create or replace function crear_transferencia_segura(
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
  v_user_id uuid := auth.uid();
  v_origen_nombre text;
  v_destino_nombre text;
  v_nueva_id uuid;
begin
  if p_cuenta_origen_id = p_cuenta_destino_id then
    raise exception 'La cuenta origen y destino no pueden ser la misma.';
  end if;

  select nombre into v_origen_nombre from public.cuentas where id = p_cuenta_origen_id and user_id = v_user_id;
  select nombre into v_destino_nombre from public.cuentas where id = p_cuenta_destino_id and user_id = v_user_id;

  if v_origen_nombre is null or v_destino_nombre is null then
    raise exception 'Cuenta no encontrada.';
  end if;

  update public.cuentas set saldo = saldo - p_monto where id = p_cuenta_origen_id and user_id = v_user_id;
  update public.cuentas set saldo = saldo + p_monto where id = p_cuenta_destino_id and user_id = v_user_id;

  insert into public.transferencias (
    user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto, descripcion, fecha
  ) values (
    v_user_id, p_cuenta_origen_id, p_cuenta_destino_id, v_origen_nombre, v_destino_nombre, p_monto, p_descripcion, p_fecha
  ) returning id into v_nueva_id;

  return v_nueva_id;
end;
$$;

create or replace function eliminar_transferencia_segura(p_transferencia_id uuid) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registro record;
begin
  select * into v_registro from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
  if v_registro is null then
    raise exception 'Transferencia no encontrada.';
  end if;

  if v_registro.cuenta_origen_id is not null then
    update public.cuentas set saldo = saldo + v_registro.monto where id = v_registro.cuenta_origen_id and user_id = v_user_id;
  end if;
  if v_registro.cuenta_destino_id is not null then
    update public.cuentas set saldo = saldo - v_registro.monto where id = v_registro.cuenta_destino_id and user_id = v_user_id;
  end if;

  delete from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
end;
$$;
