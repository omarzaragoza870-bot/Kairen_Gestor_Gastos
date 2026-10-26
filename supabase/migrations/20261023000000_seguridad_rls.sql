-- 20261023000000_seguridad_rls.sql (antes upgrade_v2_9_seguridad_rls.sql)
--
-- Correcciones de seguridad detectadas en la auditoría previa a publicación.
-- Idempotente y sin borrar datos. Aplicada en producción el 2026-10-23
-- (verificado contra el catálogo el 2026-10-26).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) CRÍTICO — perfiles: cualquier usuario podía hacer
--      update perfiles set plan = 'premium', acceso_fundador = true
--    sobre su propia fila (la política era FOR ALL), saltándose el Premium
--    del servidor. Ahora el usuario solo puede LEER su perfil; las altas las
--    hace el trigger (security definer) y los cambios de plan la service_role.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "usuarios ven su propio perfil" on public.perfiles;
drop policy if exists "usuarios leen su propio perfil" on public.perfiles;
create policy "usuarios leen su propio perfil" on public.perfiles
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on table public.perfiles from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) ALTO — tablas del modo colaborativo: las políticas comparaban la columna
--    consigo misma (m.grupo_id = m.grupo_id), así que cualquier miembro de
--    CUALQUIER grupo podía leer y escribir los datos de TODOS los grupos.
--    Se reemplazan por una función security definer (evita recursión de RLS)
--    y políticas de solo lectura; todas las escrituras ya pasan por RPC.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.es_miembro_de_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros_grupo
    where grupo_id = p_grupo_id and user_id = auth.uid()
  );
$$;

revoke all on function public.es_miembro_de_grupo(uuid) from public, anon;
grant execute on function public.es_miembro_de_grupo(uuid) to authenticated, service_role;

drop policy if exists "miembros ven gastos del hogar" on public.gastos_hogar;
create policy "miembros ven gastos del hogar" on public.gastos_hogar
  for select to authenticated using (public.es_miembro_de_grupo(grupo_id));

drop policy if exists "miembros ven metas del grupo" on public.metas_grupo;
create policy "miembros ven metas del grupo" on public.metas_grupo
  for select to authenticated using (public.es_miembro_de_grupo(grupo_id));

drop policy if exists "miembros ven presupuestos del hogar" on public.presupuestos_hogar;
create policy "miembros ven presupuestos del hogar" on public.presupuestos_hogar
  for select to authenticated using (public.es_miembro_de_grupo(grupo_id));

drop policy if exists "miembros ven otros miembros del grupo" on public.miembros_grupo;
create policy "miembros ven otros miembros del grupo" on public.miembros_grupo
  for select to authenticated
  using (user_id = auth.uid() or public.es_miembro_de_grupo(grupo_id));

drop policy if exists "miembros ven su grupo" on public.grupos;
create policy "miembros ven su grupo" on public.grupos
  for select to authenticated using (public.es_miembro_de_grupo(id));

-- crear_grupo y unirse_a_grupo eran SECURITY INVOKER y dependían de las
-- políticas permisivas de escritura de arriba (y unirse_a_grupo no podía ver
-- el grupo por código antes de ser miembro). Ya validan auth.uid() y Premium
-- dentro de la función, así que se ejecutan como definer.
alter function public.crear_grupo(text) security definer;
alter function public.unirse_a_grupo(text) security definer;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) MEDIO — funciones internas (cron / triggers) ejecutables por cualquiera
--    vía /rest/v1/rpc: permitían a un usuario anónimo disparar notificaciones
--    push a todos los usuarios. Solo las usa pg_cron (postgres) y triggers.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.recordatorio_registrar_gastos() from public, anon, authenticated;
revoke all on function public.revisar_notificaciones_tarjetas_credito() from public, anon, authenticated;
revoke all on function public.limpiar_rate_limit_ia() from public, anon, authenticated;
revoke all on function public.crear_perfil_usuario() from public, anon, authenticated;
revoke all on function public.notificar_presupuesto() from public, anon, authenticated;
