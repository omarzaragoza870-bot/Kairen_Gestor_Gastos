


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."compartir_meta"("p_meta_id" "uuid", "p_grupo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.metas
    where id = p_meta_id and user_id = v_user_id
  ) then
    raise exception 'Meta no encontrada o no tienes permiso para compartirla.';
  end if;

  if not exists (
    select 1 from public.miembros_grupo
    where grupo_id = p_grupo_id and user_id = v_user_id
  ) then
    raise exception 'No eres miembro de ese grupo.';
  end if;

  insert into public.metas_grupo (meta_id, grupo_id)
  values (p_meta_id, p_grupo_id)
  on conflict (meta_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."compartir_meta"("p_meta_id" "uuid", "p_grupo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contribuir_meta_compartida"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_meta public.metas%rowtype;
  v_nuevo_actual numeric;
begin
  if p_tipo not in ('aporte', 'retiro') then
    raise exception 'Tipo inválido';
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  -- Verificar que el usuario puede ver esta meta (propia o compartida)
  select * into v_meta from public.obtener_metas_visibles()
  where id = p_meta_id;

  if v_meta is null then
    raise exception 'Meta no encontrada o sin acceso.';
  end if;

  v_nuevo_actual := case
    when p_tipo = 'aporte' then v_meta.monto_actual + p_monto
    else greatest(0, v_meta.monto_actual - p_monto)
  end;

  -- Registrar la contribución
  insert into public.meta_contribuciones (
    meta_id, user_id, tipo, monto, nota,
    monto_actual_previo, monto_objetivo
  ) values (
    p_meta_id, v_user_id, p_tipo, p_monto, p_nota,
    v_meta.monto_actual, v_meta.monto_objetivo
  );

  -- Actualizar el monto actual de la meta
  update public.metas
  set
    monto_actual = v_nuevo_actual,
    completada = v_nuevo_actual >= monto_objetivo
  where id = p_meta_id;
end;
$$;


ALTER FUNCTION "public"."contribuir_meta_compartida"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_grupo"("p_nombre" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_grupo_id uuid;
  v_user_id uuid := auth.uid();
  v_perfil public.perfiles%rowtype;
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;

  -- Verificar acceso a la feature (fundador o premium)
  select * into v_perfil from public.perfiles where user_id = v_user_id;
  if not (v_perfil.acceso_fundador or v_perfil.plan = 'premium') then
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


ALTER FUNCTION "public"."crear_grupo"("p_nombre" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_perfil_usuario"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.perfiles (user_id, acceso_fundador)
  values (
    NEW.id,
    -- Fundador si se registró antes del 21 de agosto 2026 (fecha de corte)
    NEW.created_at < '2026-08-21 00:00:00+00'
  )
  on conflict (user_id) do nothing;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."crear_perfil_usuario"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_transaccion_idempotente"("p_client_op_id" "text", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."crear_transaccion_idempotente"("p_client_op_id" "text", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_transaccion_segura"("p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."crear_transaccion_segura"("p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_transferencia_idempotente"("p_client_op_id" "text", "p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."crear_transferencia_idempotente"("p_client_op_id" "text", "p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_transferencia_segura"("p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."crear_transferencia_segura"("p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dejar_compartir_meta"("p_meta_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.metas
    where id = p_meta_id and user_id = auth.uid()
  ) then
    raise exception 'Meta no encontrada o no tienes permiso.';
  end if;

  delete from public.metas_grupo where meta_id = p_meta_id;
end;
$$;


ALTER FUNCTION "public"."dejar_compartir_meta"("p_meta_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."editar_transaccion_segura"("p_transaccion_id" "uuid", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."editar_transaccion_segura"("p_transaccion_id" "uuid", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_transaccion_segura"("p_transaccion_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."eliminar_transaccion_segura"("p_transaccion_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_transferencia_segura"("p_transferencia_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."eliminar_transferencia_segura"("p_transferencia_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."importar_respaldo"("p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."importar_respaldo"("p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limpiar_rate_limit_ia"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.ia_rate_limit where created_at < now() - interval '1 hour';
end;
$$;


ALTER FUNCTION "public"."limpiar_rate_limit_ia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notificar_presupuesto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  v_url text;
  v_secreto text;
begin
  if v_tipo <> 'gasto' then
    return NEW;
  end if;

  select exists(
    select 1 from public.push_subscriptions where user_id = v_user_id
  ) into v_tiene_suscripcion;

  if not v_tiene_suscripcion then
    return NEW;
  end if;

  select * into v_presupuesto
  from public.presupuestos
  where user_id = v_user_id
    and categoria_nombre = v_categoria
  limit 1;

  if v_presupuesto is null then
    return NEW;
  end if;

  v_mes_inicio := date_trunc('month', current_date)::date;
  select coalesce(sum(monto), 0) into v_gastado
  from public.transacciones
  where user_id = v_user_id
    and categoria_nombre = v_categoria
    and tipo = 'gasto'
    and fecha >= v_mes_inicio;

  v_porcentaje := (v_gastado / v_presupuesto.monto_limite) * 100;

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
    return NEW;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'internal_cron_secret';

  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secreto
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
    return NEW;
end;
$_$;


ALTER FUNCTION "public"."notificar_presupuesto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_disponible_historico"("p_hasta" "date") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_ingresos numeric;
  v_gastos numeric;
  v_pagos_tarjeta numeric;
begin
  -- Ingresos y gastos de cuentas que NO son tarjeta de crédito.
  -- left join + coalesce: si la cuenta de una transacción vieja ya fue
  -- borrada (cuenta_id queda en null), se sigue contando como antes en
  -- vez de desaparecer del cálculo.
  select
    coalesce(sum(case when t.tipo = 'ingreso' then t.monto else 0 end), 0),
    coalesce(sum(case when t.tipo = 'gasto' then t.monto else 0 end), 0)
  into v_ingresos, v_gastos
  from public.transacciones t
  left join public.cuentas c on c.id = t.cuenta_id
  where t.user_id = auth.uid()
    and t.fecha < p_hasta
    and coalesce(c.tipo, 'efectivo') is distinct from 'tarjeta_credito';

  -- Pagos ya hechos hacia tarjetas de crédito (transferencias cuyo destino
  -- es una tarjeta de crédito) — esto sí salió de una cuenta líquida real.
  select coalesce(sum(tr.monto), 0)
  into v_pagos_tarjeta
  from public.transferencias tr
  join public.cuentas cd on cd.id = tr.cuenta_destino_id
  where tr.user_id = auth.uid()
    and tr.fecha < p_hasta
    and cd.tipo = 'tarjeta_credito';

  return v_ingresos - v_gastos - v_pagos_tarjeta;
end;
$$;


ALTER FUNCTION "public"."obtener_disponible_historico"("p_hasta" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."metas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "monto_objetivo" numeric(12,2) NOT NULL,
    "monto_actual" numeric(12,2) DEFAULT 0 NOT NULL,
    "fecha_limite" "date",
    "completada" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "icono" "text" DEFAULT '🎯'::"text",
    "descripcion" "text",
    "prioridad" "text" DEFAULT 'media'::"text" NOT NULL,
    CONSTRAINT "metas_prioridad_check" CHECK (("prioridad" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text"])))
);


ALTER TABLE "public"."metas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_metas_visibles"() RETURNS SETOF "public"."metas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
    -- Metas propias
    select m.* from public.metas m
    where m.user_id = auth.uid()

    union

    -- Metas compartidas en grupos donde soy miembro
    select m.* from public.metas m
    join public.metas_grupo mg on mg.meta_id = m.id
    join public.miembros_grupo mem on mem.grupo_id = mg.grupo_id
    where mem.user_id = auth.uid()

    order by created_at desc;
end;
$$;


ALTER FUNCTION "public"."obtener_metas_visibles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagar_tarjeta_credito"("p_tarjeta_id" "uuid", "p_cuenta_origen_id" "uuid", "p_monto" numeric, "p_fecha" "date", "p_descripcion" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pagar_tarjeta_credito"("p_tarjeta_id" "uuid", "p_cuenta_origen_id" "uuid", "p_monto" numeric, "p_fecha" "date", "p_descripcion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_recurrentes"("p_hoy" "date" DEFAULT NULL::"date") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."procesar_recurrentes"("p_hoy" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recordatorio_registrar_gastos"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_usuario record;
  v_url text;
  v_secreto text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'internal_cron_secret';

  for v_usuario in
    select distinct p.user_id from public.push_subscriptions p
  loop
    begin
      perform net.http_post(
        url := v_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secreto
        ),
        body := jsonb_build_object(
          'user_id', v_usuario.user_id::text,
          'title', '📝 Registra tus gastos',
          'body', 'No olvides registrar tus gastos del día de hoy.',
          'url', '/'
        )
      );
    exception when others then
      null;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."recordatorio_registrar_gastos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_contribucion_meta"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text" DEFAULT NULL::"text", "p_fecha" "date" DEFAULT NULL::"date") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."registrar_contribucion_meta"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text", "p_fecha" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reiniciar_cuenta_segura"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  delete from public.meta_contribuciones where user_id = v_user_id;
  delete from public.metas where user_id = v_user_id;
  delete from public.ahorro_externo where user_id = v_user_id;
  delete from public.transferencias where user_id = v_user_id;
  delete from public.transacciones where user_id = v_user_id;
  delete from public.categorias where user_id = v_user_id;

  -- Las tarjetas de crédito se borran por completo (si el usuario quiere
  -- otra, la da de alta de nuevo con su propio límite y fechas). Las demás
  -- cuentas (efectivo, débito, banco, otro) se conservan, solo se resetea
  -- su saldo a 0.
  delete from public.cuentas where user_id = v_user_id and tipo = 'tarjeta_credito';
  update public.cuentas set saldo = 0 where user_id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."reiniciar_cuenta_segura"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revisar_notificaciones_tarjetas_credito"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_tarjeta record;
  v_hoy int := extract(day from current_date);
  v_ultimo_dia_mes int := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'));
  v_dia_corte int;
  v_dia_pago int;
  v_titulo text;
  v_cuerpo text;
  v_url text;
  v_secreto text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'internal_cron_secret';

  for v_tarjeta in
    select c.id, c.user_id, c.nombre, c.fecha_corte, c.fecha_pago, c.saldo
    from public.cuentas c
    where c.tipo = 'tarjeta_credito'
      and (c.fecha_corte is not null or c.fecha_pago is not null)
      and exists (select 1 from public.push_subscriptions p where p.user_id = c.user_id)
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
      begin
        perform net.http_post(
          url := v_url || '/functions/v1/send-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secreto
          ),
          body := jsonb_build_object(
            'user_id', v_tarjeta.user_id::text,
            'title', v_titulo,
            'body', v_cuerpo,
            'url', '/ajustes'
          )
        );
      exception when others then
        null;
      end;
    end if;
  end loop;
end;
$_$;


ALTER FUNCTION "public"."revisar_notificaciones_tarjetas_credito"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sumar_meses_con_dia"("p_fecha" "date", "p_meses" integer, "p_dia" integer) RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_primero date;
  v_ultimo_dia int;
begin
  v_primero := (date_trunc('month', p_fecha::timestamp) + make_interval(months => p_meses))::date;
  v_ultimo_dia := extract(day from ((v_primero + interval '1 month')::date - 1))::int;
  return v_primero + (least(greatest(p_dia, 1), v_ultimo_dia) - 1);
end;
$$;


ALTER FUNCTION "public"."sumar_meses_con_dia"("p_fecha" "date", "p_meses" integer, "p_dia" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tiene_acceso_premium"() RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_perfil public.perfiles%rowtype;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  return coalesce(v_perfil.acceso_fundador or v_perfil.plan = 'premium', false);
end;
$$;


ALTER FUNCTION "public"."tiene_acceso_premium"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unirse_a_grupo"("p_codigo" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_grupo_id uuid;
  v_user_id uuid := auth.uid();
  v_perfil public.perfiles%rowtype;
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;

  select * into v_perfil from public.perfiles where user_id = v_user_id;
  if not (v_perfil.acceso_fundador or v_perfil.plan = 'premium') then
    raise exception 'Esta función requiere acceso Premium o ser usuario fundador.';
  end if;

  select id into v_grupo_id
  from public.grupos
  where upper(codigo_invitacion) = upper(p_codigo);

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


ALTER FUNCTION "public"."unirse_a_grupo"("p_codigo" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ahorro_externo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre_banco" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "fecha_registro" "date" DEFAULT CURRENT_DATE NOT NULL,
    "nota" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ahorro_externo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "icono" "text" DEFAULT '🏷️'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cuentas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" DEFAULT 'efectivo'::"text" NOT NULL,
    "saldo" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "limite_credito" numeric(12,2),
    "fecha_corte" smallint,
    "fecha_pago" smallint,
    CONSTRAINT "cuentas_fecha_corte_check" CHECK ((("fecha_corte" IS NULL) OR (("fecha_corte" >= 1) AND ("fecha_corte" <= 31)))),
    CONSTRAINT "cuentas_fecha_pago_check" CHECK ((("fecha_pago" IS NULL) OR (("fecha_pago" >= 1) AND ("fecha_pago" <= 31))))
);


ALTER TABLE "public"."cuentas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fcm_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "plataforma" "text" DEFAULT 'android'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fcm_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos_hogar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "presupuesto_hogar_id" "uuid" NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "monto" numeric(12,2) NOT NULL,
    "descripcion" "text",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "gastos_hogar_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."gastos_hogar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "creado_por" "uuid",
    "codigo_invitacion" "text" DEFAULT "upper"(SUBSTRING(("gen_random_uuid"())::"text" FROM 1 FOR 6)) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grupos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ia_rate_limit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ia_rate_limit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_contribuciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "meta_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "nota" "text",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "meta_contribuciones_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "meta_contribuciones_tipo_check" CHECK (("tipo" = ANY (ARRAY['contribucion'::"text", 'retiro'::"text"])))
);


ALTER TABLE "public"."meta_contribuciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metas_grupo" (
    "meta_id" "uuid" NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."metas_grupo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miembros_grupo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rol" "text" DEFAULT 'miembro'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "miembros_grupo_rol_check" CHECK (("rol" = ANY (ARRAY['admin'::"text", 'miembro'::"text"])))
);


ALTER TABLE "public"."miembros_grupo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operaciones_cliente" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "client_op_id" "text" NOT NULL,
    "accion" "text" NOT NULL,
    "resultado_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operaciones_cliente_client_op_id_check" CHECK ((("char_length"("client_op_id") >= 8) AND ("char_length"("client_op_id") <= 100)))
);


ALTER TABLE "public"."operaciones_cliente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'gratis'::"text" NOT NULL,
    "acceso_fundador" boolean DEFAULT false NOT NULL,
    "stripe_customer_id" "text",
    "plan_vence_el" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "perfiles_plan_check" CHECK (("plan" = ANY (ARRAY['gratis'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "categoria_nombre" "text" NOT NULL,
    "monto_limite" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "presupuestos_monto_limite_check" CHECK (("monto_limite" > (0)::numeric))
);


ALTER TABLE "public"."presupuestos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presupuestos_hogar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "monto_limite" numeric(12,2) NOT NULL,
    "periodo" "text" DEFAULT 'mensual'::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "presupuestos_hogar_monto_limite_check" CHECK (("monto_limite" > (0)::numeric)),
    CONSTRAINT "presupuestos_hogar_periodo_check" CHECK (("periodo" = ANY (ARRAY['mensual'::"text", 'semanal'::"text", 'anual'::"text"])))
);


ALTER TABLE "public"."presupuestos_hogar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurrentes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cuenta_id" "uuid",
    "cuenta_nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "categoria_nombre" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "descripcion" "text",
    "frecuencia" "text" NOT NULL,
    "dia_del_mes" integer,
    "proxima_fecha" "date" NOT NULL,
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "recurrentes_dia_del_mes_check" CHECK ((("dia_del_mes" >= 1) AND ("dia_del_mes" <= 31))),
    CONSTRAINT "recurrentes_frecuencia_check" CHECK (("frecuencia" = ANY (ARRAY['diario'::"text", 'semanal'::"text", 'quincenal'::"text", 'mensual'::"text", 'anual'::"text"]))),
    CONSTRAINT "recurrentes_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "recurrentes_tipo_check" CHECK (("tipo" = ANY (ARRAY['gasto'::"text", 'ingreso'::"text"])))
);


ALTER TABLE "public"."recurrentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transacciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cuenta_id" "uuid",
    "categoria_nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "descripcion" "text",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transacciones_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "transacciones_tipo_check" CHECK (("tipo" = ANY (ARRAY['gasto'::"text", 'ingreso'::"text"])))
);


ALTER TABLE "public"."transacciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transferencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cuenta_origen_id" "uuid",
    "cuenta_destino_id" "uuid",
    "cuenta_origen_nombre" "text" NOT NULL,
    "cuenta_destino_nombre" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "descripcion" "text",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transferencias_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."transferencias" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ahorro_externo"
    ADD CONSTRAINT "ahorro_externo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuentas"
    ADD CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fcm_tokens"
    ADD CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fcm_tokens"
    ADD CONSTRAINT "fcm_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."gastos_hogar"
    ADD CONSTRAINT "gastos_hogar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_codigo_invitacion_key" UNIQUE ("codigo_invitacion");



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ia_rate_limit"
    ADD CONSTRAINT "ia_rate_limit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_contribuciones"
    ADD CONSTRAINT "meta_contribuciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metas_grupo"
    ADD CONSTRAINT "metas_grupo_pkey" PRIMARY KEY ("meta_id");



ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miembros_grupo"
    ADD CONSTRAINT "miembros_grupo_grupo_id_user_id_key" UNIQUE ("grupo_id", "user_id");



ALTER TABLE ONLY "public"."miembros_grupo"
    ADD CONSTRAINT "miembros_grupo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operaciones_cliente"
    ADD CONSTRAINT "operaciones_cliente_pkey" PRIMARY KEY ("user_id", "client_op_id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."presupuestos_hogar"
    ADD CONSTRAINT "presupuestos_hogar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_user_id_categoria_nombre_key" UNIQUE ("user_id", "categoria_nombre");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."recurrentes"
    ADD CONSTRAINT "recurrentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transacciones"
    ADD CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ia_rate_limit_user_time" ON "public"."ia_rate_limit" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "trigger_notificar_presupuesto" AFTER INSERT ON "public"."transacciones" FOR EACH ROW EXECUTE FUNCTION "public"."notificar_presupuesto"();



ALTER TABLE ONLY "public"."ahorro_externo"
    ADD CONSTRAINT "ahorro_externo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cuentas"
    ADD CONSTRAINT "cuentas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fcm_tokens"
    ADD CONSTRAINT "fcm_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos_hogar"
    ADD CONSTRAINT "gastos_hogar_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos_hogar"
    ADD CONSTRAINT "gastos_hogar_presupuesto_hogar_id_fkey" FOREIGN KEY ("presupuesto_hogar_id") REFERENCES "public"."presupuestos_hogar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos_hogar"
    ADD CONSTRAINT "gastos_hogar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ia_rate_limit"
    ADD CONSTRAINT "ia_rate_limit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_contribuciones"
    ADD CONSTRAINT "meta_contribuciones_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_contribuciones"
    ADD CONSTRAINT "meta_contribuciones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metas_grupo"
    ADD CONSTRAINT "metas_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metas_grupo"
    ADD CONSTRAINT "metas_grupo_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."miembros_grupo"
    ADD CONSTRAINT "miembros_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."miembros_grupo"
    ADD CONSTRAINT "miembros_grupo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operaciones_cliente"
    ADD CONSTRAINT "operaciones_cliente_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presupuestos_hogar"
    ADD CONSTRAINT "presupuestos_hogar_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurrentes"
    ADD CONSTRAINT "recurrentes_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurrentes"
    ADD CONSTRAINT "recurrentes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transacciones"
    ADD CONSTRAINT "transacciones_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transacciones"
    ADD CONSTRAINT "transacciones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "public"."cuentas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "public"."cuentas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ahorro_externo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuentas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fcm_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gastos_hogar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grupos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ia_rate_limit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_contribuciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metas_grupo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miembros ven gastos del hogar" ON "public"."gastos_hogar" USING ((EXISTS ( SELECT 1
   FROM "public"."miembros_grupo" "m"
  WHERE (("m"."grupo_id" = "m"."grupo_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "miembros ven metas del grupo" ON "public"."metas_grupo" USING ((EXISTS ( SELECT 1
   FROM "public"."miembros_grupo" "m"
  WHERE (("m"."grupo_id" = "m"."grupo_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "miembros ven otros miembros del grupo" ON "public"."miembros_grupo" USING ((EXISTS ( SELECT 1
   FROM "public"."miembros_grupo" "m2"
  WHERE (("m2"."grupo_id" = "m2"."grupo_id") AND ("m2"."user_id" = "auth"."uid"())))));



CREATE POLICY "miembros ven presupuestos del hogar" ON "public"."presupuestos_hogar" USING ((EXISTS ( SELECT 1
   FROM "public"."miembros_grupo" "m"
  WHERE (("m"."grupo_id" = "m"."grupo_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "miembros ven su grupo" ON "public"."grupos" USING ((EXISTS ( SELECT 1
   FROM "public"."miembros_grupo" "m"
  WHERE (("m"."grupo_id" = "m"."id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."miembros_grupo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operaciones_cliente" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presupuestos_hogar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurrentes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transacciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transferencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios actualizan sus cuentas" ON "public"."cuentas" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios actualizan sus transacciones" ON "public"."transacciones" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios crean sus cuentas" ON "public"."cuentas" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios crean sus transacciones" ON "public"."transacciones" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios eliminan sus cuentas" ON "public"."cuentas" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios eliminan sus transacciones" ON "public"."transacciones" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios gestionan su propio rate limit" ON "public"."ia_rate_limit" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios gestionan sus propias suscripciones" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios gestionan sus propios tokens FCM" ON "public"."fcm_tokens" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios leen sus cuentas" ON "public"."cuentas" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios leen sus transacciones" ON "public"."transacciones" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven su propio ahorro externo" ON "public"."ahorro_externo" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven su propio perfil" ON "public"."perfiles" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias categorias" ON "public"."categorias" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias contribuciones" ON "public"."meta_contribuciones" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias metas o del grupo" ON "public"."metas" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias operaciones" ON "public"."operaciones_cliente" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias recurrentes" ON "public"."recurrentes" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propias transferencias" ON "public"."transferencias" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "usuarios ven sus propios presupuestos" ON "public"."presupuestos" USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."compartir_meta"("p_meta_id" "uuid", "p_grupo_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compartir_meta"("p_meta_id" "uuid", "p_grupo_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compartir_meta"("p_meta_id" "uuid", "p_grupo_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."contribuir_meta_compartida"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."contribuir_meta_compartida"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contribuir_meta_compartida"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_grupo"("p_nombre" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_grupo"("p_nombre" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_grupo"("p_nombre" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_perfil_usuario"() TO "anon";
GRANT ALL ON FUNCTION "public"."crear_perfil_usuario"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_perfil_usuario"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_transaccion_idempotente"("p_client_op_id" "text", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_transaccion_idempotente"("p_client_op_id" "text", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_transaccion_idempotente"("p_client_op_id" "text", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_transaccion_segura"("p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_transaccion_segura"("p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_transaccion_segura"("p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_transferencia_idempotente"("p_client_op_id" "text", "p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_transferencia_idempotente"("p_client_op_id" "text", "p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_transferencia_idempotente"("p_client_op_id" "text", "p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_transferencia_segura"("p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_transferencia_segura"("p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_transferencia_segura"("p_cuenta_origen_id" "uuid", "p_cuenta_destino_id" "uuid", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."dejar_compartir_meta"("p_meta_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dejar_compartir_meta"("p_meta_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dejar_compartir_meta"("p_meta_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."editar_transaccion_segura"("p_transaccion_id" "uuid", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."editar_transaccion_segura"("p_transaccion_id" "uuid", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."editar_transaccion_segura"("p_transaccion_id" "uuid", "p_cuenta_id" "uuid", "p_categoria_nombre" "text", "p_tipo" "text", "p_monto" numeric, "p_descripcion" "text", "p_fecha" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."eliminar_transaccion_segura"("p_transaccion_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."eliminar_transaccion_segura"("p_transaccion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_transaccion_segura"("p_transaccion_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."eliminar_transferencia_segura"("p_transferencia_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."eliminar_transferencia_segura"("p_transferencia_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_transferencia_segura"("p_transferencia_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."importar_respaldo"("p_datos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."importar_respaldo"("p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."importar_respaldo"("p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."limpiar_rate_limit_ia"() TO "anon";
GRANT ALL ON FUNCTION "public"."limpiar_rate_limit_ia"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."limpiar_rate_limit_ia"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notificar_presupuesto"() TO "anon";
GRANT ALL ON FUNCTION "public"."notificar_presupuesto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notificar_presupuesto"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_disponible_historico"("p_hasta" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_disponible_historico"("p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_disponible_historico"("p_hasta" "date") TO "service_role";



GRANT ALL ON TABLE "public"."metas" TO "anon";
GRANT ALL ON TABLE "public"."metas" TO "authenticated";
GRANT ALL ON TABLE "public"."metas" TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_metas_visibles"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_metas_visibles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_metas_visibles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pagar_tarjeta_credito"("p_tarjeta_id" "uuid", "p_cuenta_origen_id" "uuid", "p_monto" numeric, "p_fecha" "date", "p_descripcion" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pagar_tarjeta_credito"("p_tarjeta_id" "uuid", "p_cuenta_origen_id" "uuid", "p_monto" numeric, "p_fecha" "date", "p_descripcion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagar_tarjeta_credito"("p_tarjeta_id" "uuid", "p_cuenta_origen_id" "uuid", "p_monto" numeric, "p_fecha" "date", "p_descripcion" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."procesar_recurrentes"("p_hoy" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."procesar_recurrentes"("p_hoy" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."procesar_recurrentes"("p_hoy" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."recordatorio_registrar_gastos"() TO "anon";
GRANT ALL ON FUNCTION "public"."recordatorio_registrar_gastos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recordatorio_registrar_gastos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_contribucion_meta"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text", "p_fecha" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_contribucion_meta"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text", "p_fecha" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_contribucion_meta"("p_meta_id" "uuid", "p_tipo" "text", "p_monto" numeric, "p_nota" "text", "p_fecha" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."reiniciar_cuenta_segura"() TO "anon";
GRANT ALL ON FUNCTION "public"."reiniciar_cuenta_segura"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reiniciar_cuenta_segura"() TO "service_role";



GRANT ALL ON FUNCTION "public"."revisar_notificaciones_tarjetas_credito"() TO "anon";
GRANT ALL ON FUNCTION "public"."revisar_notificaciones_tarjetas_credito"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."revisar_notificaciones_tarjetas_credito"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sumar_meses_con_dia"("p_fecha" "date", "p_meses" integer, "p_dia" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sumar_meses_con_dia"("p_fecha" "date", "p_meses" integer, "p_dia" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sumar_meses_con_dia"("p_fecha" "date", "p_meses" integer, "p_dia" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."tiene_acceso_premium"() TO "anon";
GRANT ALL ON FUNCTION "public"."tiene_acceso_premium"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tiene_acceso_premium"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unirse_a_grupo"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unirse_a_grupo"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unirse_a_grupo"("p_codigo" "text") TO "service_role";



GRANT ALL ON TABLE "public"."ahorro_externo" TO "anon";
GRANT ALL ON TABLE "public"."ahorro_externo" TO "authenticated";
GRANT ALL ON TABLE "public"."ahorro_externo" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON TABLE "public"."cuentas" TO "anon";
GRANT ALL ON TABLE "public"."cuentas" TO "authenticated";
GRANT ALL ON TABLE "public"."cuentas" TO "service_role";



GRANT ALL ON TABLE "public"."fcm_tokens" TO "anon";
GRANT ALL ON TABLE "public"."fcm_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."fcm_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."gastos_hogar" TO "anon";
GRANT ALL ON TABLE "public"."gastos_hogar" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos_hogar" TO "service_role";



GRANT ALL ON TABLE "public"."grupos" TO "anon";
GRANT ALL ON TABLE "public"."grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."grupos" TO "service_role";



GRANT ALL ON TABLE "public"."ia_rate_limit" TO "anon";
GRANT ALL ON TABLE "public"."ia_rate_limit" TO "authenticated";
GRANT ALL ON TABLE "public"."ia_rate_limit" TO "service_role";



GRANT ALL ON TABLE "public"."meta_contribuciones" TO "anon";
GRANT ALL ON TABLE "public"."meta_contribuciones" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_contribuciones" TO "service_role";



GRANT ALL ON TABLE "public"."metas_grupo" TO "anon";
GRANT ALL ON TABLE "public"."metas_grupo" TO "authenticated";
GRANT ALL ON TABLE "public"."metas_grupo" TO "service_role";



GRANT ALL ON TABLE "public"."miembros_grupo" TO "anon";
GRANT ALL ON TABLE "public"."miembros_grupo" TO "authenticated";
GRANT ALL ON TABLE "public"."miembros_grupo" TO "service_role";



GRANT ALL ON TABLE "public"."operaciones_cliente" TO "anon";
GRANT ALL ON TABLE "public"."operaciones_cliente" TO "authenticated";
GRANT ALL ON TABLE "public"."operaciones_cliente" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON TABLE "public"."presupuestos" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";



GRANT ALL ON TABLE "public"."presupuestos_hogar" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos_hogar" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos_hogar" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."recurrentes" TO "anon";
GRANT ALL ON TABLE "public"."recurrentes" TO "authenticated";
GRANT ALL ON TABLE "public"."recurrentes" TO "service_role";



GRANT ALL ON TABLE "public"."transacciones" TO "anon";
GRANT ALL ON TABLE "public"."transacciones" TO "authenticated";
GRANT ALL ON TABLE "public"."transacciones" TO "service_role";



GRANT ALL ON TABLE "public"."transferencias" TO "anon";
GRANT ALL ON TABLE "public"."transferencias" TO "authenticated";
GRANT ALL ON TABLE "public"."transferencias" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







