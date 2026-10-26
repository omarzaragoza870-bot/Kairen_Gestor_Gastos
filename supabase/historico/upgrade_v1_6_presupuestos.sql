-- ============================================================
-- Kairen Finanzas - Presupuestos por categoría (v1.6)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  categoria_nombre text not null,
  monto_limite numeric(12,2) not null check (monto_limite > 0),
  created_at timestamptz default now(),
  unique (user_id, categoria_nombre)
);

alter table public.presupuestos enable row level security;

drop policy if exists "usuarios ven sus propios presupuestos" on public.presupuestos;
create policy "usuarios ven sus propios presupuestos" on public.presupuestos
  for all using (auth.uid() = user_id);
