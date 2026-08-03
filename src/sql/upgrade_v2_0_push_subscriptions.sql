-- ============================================================
-- Kairen Finanzas - Web Push Subscriptions (v2.0)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  -- Un endpoint único por usuario (evita duplicados si el mismo
  -- navegador se suscribe varias veces)
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "usuarios gestionan sus propias suscripciones"
  on public.push_subscriptions
  for all using (auth.uid() = user_id);
