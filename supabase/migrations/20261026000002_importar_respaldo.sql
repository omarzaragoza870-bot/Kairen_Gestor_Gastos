-- 20261026000002_importar_respaldo.sql
--
-- importar_respaldo (Ajustes → Importar datos) fallaba siempre con
-- 'column "categoria_id" of relation "transacciones" does not exist':
-- insertaba en transacciones una columna que la tabla no tiene (los
-- movimientos guardan la categoría por nombre, en categoria_nombre).
-- Se quita esa columna del insert; el resto de la función no cambia.

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
  insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, descripcion, fecha, created_at)
  select
    v_uid,
    (v_map_cuentas->>(e->>'cuenta_id'))::uuid,
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
