-- ============================================================
-- Kairen Finanzas - FCM Tokens Android (v2.2)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null,
  plataforma text default 'android',
  created_at timestamptz default now(),
  unique(user_id, token)
);

alter table public.fcm_tokens enable row level security;

create policy "usuarios gestionan sus propios tokens FCM"
  on public.fcm_tokens
  for all using (auth.uid() = user_id);
