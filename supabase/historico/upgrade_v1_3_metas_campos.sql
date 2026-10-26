-- ============================================================
-- Kairen Finanzas - Metas v1.3 (campos extra)
-- Correr una sola vez en Supabase > SQL Editor
-- Requiere haber corrido antes upgrade_v1_2_metas.sql
-- ============================================================

alter table public.metas add column if not exists icono text default '🎯';
alter table public.metas add column if not exists descripcion text;
alter table public.metas add column if not exists prioridad text not null default 'media';

-- Restringe prioridad a valores válidos
alter table public.metas drop constraint if exists metas_prioridad_check;
alter table public.metas add constraint metas_prioridad_check check (prioridad in ('baja', 'media', 'alta'));
