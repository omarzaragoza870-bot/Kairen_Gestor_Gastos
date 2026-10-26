-- ============================================================
-- Kairen Finanzas - Metas v1.4 (historial de contribuciones)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.meta_contribuciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  meta_id uuid references public.metas(id) on delete cascade not null,
  tipo text not null check (tipo in ('contribucion', 'retiro')),
  monto numeric(12,2) not null check (monto > 0),
  nota text,
  fecha date not null default current_date,
  created_at timestamptz default now()
);

alter table public.meta_contribuciones enable row level security;

drop policy if exists "usuarios ven sus propias contribuciones" on public.meta_contribuciones;
create policy "usuarios ven sus propias contribuciones" on public.meta_contribuciones
  for all using (auth.uid() = user_id);
