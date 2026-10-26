-- 20261026000001_validaciones.sql (antes upgrade_v3_1_validaciones.sql)
--
-- Validaciones del servidor que la app ya respetaba pero la base no exigía.
-- Idempotente y sin borrar datos. Aplicada en producción el 2026-10-26.
--
-- 1. crear_transferencia_segura aceptaba tarjetas de crédito. Una
--    transferencia a una tarjeta subía la deuda, y al eliminarla
--    eliminar_transferencia_segura la volvía a subir (la trata como pago).
--    La pantalla ya las excluye; ahora también el servidor. Los abonos a
--    tarjetas van por pagar_tarjeta_credito.
-- 2. contribuir_meta_compartida no la usa la app (usa registrar_contribucion_meta)
--    y no podía funcionar: valida 'aporte' pero la tabla solo admite
--    'contribucion'. Se elimina para que no quede expuesta por la API.

create or replace function public.crear_transferencia_segura(
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_monto numeric,
  p_descripcion text,
  p_fecha date
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_origen record;
  v_destino record;
  v_nueva_id uuid;
begin
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_cuenta_origen_id = p_cuenta_destino_id then
    raise exception 'La cuenta origen y destino no pueden ser la misma.';
  end if;

  select nombre, tipo into v_origen from public.cuentas where id = p_cuenta_origen_id and user_id = v_user_id;
  select nombre, tipo into v_destino from public.cuentas where id = p_cuenta_destino_id and user_id = v_user_id;

  if v_origen.nombre is null or v_destino.nombre is null then
    raise exception 'Cuenta no encontrada.';
  end if;
  if v_origen.tipo = 'tarjeta_credito' or v_destino.tipo = 'tarjeta_credito' then
    raise exception 'Las tarjetas de crédito no participan en transferencias. Usa "Pagar tarjeta".';
  end if;

  update public.cuentas set saldo = saldo - p_monto where id = p_cuenta_origen_id and user_id = v_user_id;
  update public.cuentas set saldo = saldo + p_monto where id = p_cuenta_destino_id and user_id = v_user_id;

  insert into public.transferencias (
    user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto, descripcion, fecha
  ) values (
    v_user_id, p_cuenta_origen_id, p_cuenta_destino_id, v_origen.nombre, v_destino.nombre, p_monto, p_descripcion, p_fecha
  ) returning id into v_nueva_id;

  return v_nueva_id;
end;
$$;

drop function if exists public.contribuir_meta_compartida(uuid, text, numeric, text);
