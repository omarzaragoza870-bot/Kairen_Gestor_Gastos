-- Copia este archivo a supabase/fundadores.local.sql (ignorado por git),
-- pon los correos reales y ejecútalo contra producción:
--   npx supabase db query --linked -f supabase/fundadores.local.sql
-- Repetirlo es seguro: los correos que ya están se ignoran.
insert into public.correos_fundadores (email, nota) values
  ('tester1@gmail.com', 'tester'),
  ('tester2@gmail.com', 'tester')
on conflict (email) do nothing;
