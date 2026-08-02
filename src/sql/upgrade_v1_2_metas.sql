-- ============================================================
-- Kairen Finanzas - Metas (v1.2)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  monto_objetivo numeric(12,2) not null,
  monto_actual numeric(12,2) not null default 0,
  fecha_limite date,
  completada boolean not null default false,
  created_at timestamptz default now()
);

alter table public.metas enable row level security;

drop policy if exists "usuarios ven sus propias metas" on public.metas;
create policy "usuarios ven sus propias metas" on public.metas
  for all using (auth.uid() = user_id);
