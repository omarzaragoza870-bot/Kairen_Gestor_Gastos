-- 20261029000002_seguridad_auditoria.sql
--
-- Correcciones de la auditoría de seguridad del 2026-10-29
-- (pruebas en supabase/tests/seguridad.test.js).

-- ------------------------------------------------------------------
-- M1. El límite de Kairen IA (30 preguntas por hora) lo llevaba una tabla
-- que el propio usuario podía borrar desde la app. Solo la Edge Function
-- (service_role) la usa.
-- ------------------------------------------------------------------
drop policy if exists "usuarios gestionan su propio rate limit" on public.ia_rate_limit;
revoke all on table public.ia_rate_limit from anon, authenticated;

-- ------------------------------------------------------------------
-- M2. Código de invitación de 6 caracteres hex (24 bits): se podía adivinar
-- probando. Ahora son 16 (60 bits: un carácter del uuid v4 es fijo); los
-- códigos cortos se cambian. Quien ya está en el grupo no pierde nada.
-- ------------------------------------------------------------------
alter table public.grupos alter column codigo_invitacion
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
update public.grupos
set codigo_invitacion = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
where char_length(codigo_invitacion) < 16;

-- ------------------------------------------------------------------
-- M3. Un movimiento, recurrente o transferencia solo puede apuntar a cuentas
-- de su mismo dueño (antes bastaba con conocer el id de la cuenta de otro).
-- ------------------------------------------------------------------
-- Primero las llaves que dependen del unique, para poder repetir el archivo
alter table public.transacciones drop constraint if exists transacciones_cuenta_mismo_dueno;
alter table public.recurrentes drop constraint if exists recurrentes_cuenta_mismo_dueno;
alter table public.transferencias drop constraint if exists transferencias_origen_mismo_dueno;
alter table public.transferencias drop constraint if exists transferencias_destino_mismo_dueno;

alter table public.cuentas drop constraint if exists cuentas_id_user_key;
alter table public.cuentas add constraint cuentas_id_user_key unique (id, user_id);

-- Filas que ya apuntaran a una cuenta ajena (en producción había 0 el
-- 2026-10-29): se sueltan de esa cuenta en vez de hacer fallar la migración
update public.transacciones t set cuenta_id = null
where cuenta_id is not null and not exists (select 1 from public.cuentas c where c.id = t.cuenta_id and c.user_id = t.user_id);
update public.recurrentes r set cuenta_id = null
where cuenta_id is not null and not exists (select 1 from public.cuentas c where c.id = r.cuenta_id and c.user_id = r.user_id);
update public.transferencias t set cuenta_origen_id = null
where cuenta_origen_id is not null and not exists (select 1 from public.cuentas c where c.id = t.cuenta_origen_id and c.user_id = t.user_id);
update public.transferencias t set cuenta_destino_id = null
where cuenta_destino_id is not null and not exists (select 1 from public.cuentas c where c.id = t.cuenta_destino_id and c.user_id = t.user_id);

alter table public.transacciones drop constraint if exists transacciones_cuenta_id_fkey;
alter table public.transacciones add constraint transacciones_cuenta_mismo_dueno
  foreign key (cuenta_id, user_id) references public.cuentas (id, user_id) on delete set null (cuenta_id);

alter table public.recurrentes drop constraint if exists recurrentes_cuenta_id_fkey;
alter table public.recurrentes add constraint recurrentes_cuenta_mismo_dueno
  foreign key (cuenta_id, user_id) references public.cuentas (id, user_id) on delete set null (cuenta_id);

alter table public.transferencias drop constraint if exists transferencias_cuenta_origen_id_fkey;
alter table public.transferencias add constraint transferencias_origen_mismo_dueno
  foreign key (cuenta_origen_id, user_id) references public.cuentas (id, user_id) on delete set null (cuenta_origen_id);

alter table public.transferencias drop constraint if exists transferencias_cuenta_destino_id_fkey;
alter table public.transferencias add constraint transferencias_destino_mismo_dueno
  foreign key (cuenta_destino_id, user_id) references public.cuentas (id, user_id) on delete set null (cuenta_destino_id);

-- Las contribuciones a metas compartidas entran por registrar_contribucion_meta
-- (SECURITY DEFINER); desde la app directa solo a metas propias.
drop policy if exists "usuarios ven sus propias contribuciones" on public.meta_contribuciones;
drop policy if exists "contribuciones: ver propias" on public.meta_contribuciones;
drop policy if exists "contribuciones: borrar propias" on public.meta_contribuciones;
drop policy if exists "contribuciones: insertar en metas propias" on public.meta_contribuciones;
drop policy if exists "contribuciones: editar en metas propias" on public.meta_contribuciones;
create policy "contribuciones: ver propias" on public.meta_contribuciones
  for select to authenticated using (auth.uid() = user_id);
create policy "contribuciones: borrar propias" on public.meta_contribuciones
  for delete to authenticated using (auth.uid() = user_id);
create policy "contribuciones: insertar en metas propias" on public.meta_contribuciones
  for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.metas m where m.id = meta_id and m.user_id = auth.uid()));
create policy "contribuciones: editar en metas propias" on public.meta_contribuciones
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.metas m where m.id = meta_id and m.user_id = auth.uid()));

-- Y el aviso de la tarjeta solo suma mensualidades de la dueña de la tarjeta
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
      and t.user_id = v_tarjeta.user_id -- solo lo que la dueña registró
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
-- B1. Sin fila en perfiles la condición daba NULL y no bloqueaba.
-- ------------------------------------------------------------------
create or replace function public.crear_grupo(p_nombre text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_grupo_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;

  -- Verificar acceso a la feature (fundador o premium)
  if not public.tiene_acceso_premium() then
    raise exception 'Esta función requiere acceso Premium o ser usuario fundador.';
  end if;

  insert into public.grupos (nombre, creado_por)
  values (p_nombre, v_user_id)
  returning id into v_grupo_id;

  insert into public.miembros_grupo (grupo_id, user_id, rol)
  values (v_grupo_id, v_user_id, 'admin');

  return v_grupo_id;
end;
$$;

create or replace function public.unirse_a_grupo(p_codigo text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_grupo_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;

  if not public.tiene_acceso_premium() then
    raise exception 'Esta función requiere acceso Premium o ser usuario fundador.';
  end if;

  select id into v_grupo_id
  from public.grupos
  where upper(codigo_invitacion) = upper(trim(p_codigo));

  if v_grupo_id is null then
    raise exception 'Código de invitación inválido o expirado.';
  end if;

  if exists (select 1 from public.miembros_grupo where grupo_id = v_grupo_id and user_id = v_user_id) then
    raise exception 'Ya eres miembro de este grupo.';
  end if;

  insert into public.miembros_grupo (grupo_id, user_id, rol)
  values (v_grupo_id, v_user_id, 'miembro');

  return v_grupo_id;
end;
$$;

-- ------------------------------------------------------------------
-- B2. Las funciones de la API son para usuarios con sesión: anon fuera.
-- Hoy no hacían nada sin auth.uid(), pero así una función futura que olvide
-- revisarlo no queda abierta. Las nuevas nacen sin permiso para anon.
-- ------------------------------------------------------------------
revoke execute on function public.compartir_meta(uuid, uuid) from public, anon;
revoke execute on function public.crear_grupo(text) from public, anon;
revoke execute on function public.crear_transaccion_segura(uuid, text, text, numeric, text, date) from public, anon;
revoke execute on function public.crear_transferencia_segura(uuid, uuid, numeric, text, date) from public, anon;
revoke execute on function public.dejar_compartir_meta(uuid) from public, anon;
revoke execute on function public.editar_transaccion_segura(uuid, uuid, text, text, numeric, text, date) from public, anon;
revoke execute on function public.eliminar_transaccion_segura(uuid) from public, anon;
revoke execute on function public.eliminar_transferencia_segura(uuid) from public, anon;
revoke execute on function public.obtener_disponible_historico(date) from public, anon;
revoke execute on function public.obtener_metas_visibles() from public, anon;
revoke execute on function public.pagar_tarjeta_credito(uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.reiniciar_cuenta_segura() from public, anon;
revoke execute on function public.sumar_meses_con_dia(date, integer, integer) from public, anon;
revoke execute on function public.tiene_acceso_premium() from public, anon;
revoke execute on function public.unirse_a_grupo(text) from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- ------------------------------------------------------------------
-- B3. send-push hace POST al endpoint guardado: solo servicios de push reales.
-- ------------------------------------------------------------------
alter table public.push_subscriptions drop constraint if exists push_endpoint_check;
-- Suscripciones con otro endpoint (en producción no había) ya no recibirían nada
delete from public.push_subscriptions
where endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/';
alter table public.push_subscriptions add constraint push_endpoint_check check (
  endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/'
);

-- ------------------------------------------------------------------
-- B5. Este trigger existía en producción pero no en las migraciones: si se
-- reconstruía la base desde cero, se perdía.
-- ------------------------------------------------------------------
create or replace function public.proteger_plan_perfil() returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Solo aplica a peticiones hechas desde la app con la sesión del usuario
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'gratis';
      new.acceso_fundador := false;
    elsif new.plan is distinct from old.plan
       or new.acceso_fundador is distinct from old.acceso_fundador then
      raise exception 'No está permitido modificar el plan desde la app.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_plan_perfil() from public, anon, authenticated;

drop trigger if exists proteger_plan_perfil on public.perfiles;
create trigger proteger_plan_perfil
  before insert or update on public.perfiles
  for each row execute function public.proteger_plan_perfil();
