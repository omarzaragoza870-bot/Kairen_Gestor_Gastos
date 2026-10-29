-- 20261029000001_correos_fundadores.sql
--
-- Premium de por vida (acceso_fundador) para los testers por correo.
-- Antes solo lo recibía quien se registró antes del 21 de agosto de 2026.
-- Ahora también cualquier correo de public.correos_fundadores:
--   - si la cuenta ya existe, se activa al agregar el correo;
--   - si se registra después (Google, correo, o un invitado que vincula su
--     cuenta), se activa cuando el correo queda CONFIRMADO. Si no, cualquiera
--     podría registrarse con el correo de un tester sin ser su dueño.
-- La app no puede leer ni escribir esta tabla.
--
-- Los correos NO van en el repo (son datos personales): se cargan con
--   npx supabase db query --linked -f supabase/fundadores.local.sql
-- (archivo ignorado por git; ver supabase/fundadores.example.sql).

create table if not exists public.correos_fundadores (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  nota text,
  created_at timestamptz not null default now()
);

alter table public.correos_fundadores enable row level security;
revoke all on table public.correos_fundadores from anon, authenticated;

create or replace function public.es_correo_fundador(p_email text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_email is not null
     and exists (select 1 from public.correos_fundadores where email = lower(trim(p_email)));
$$;

revoke all on function public.es_correo_fundador(text) from public, anon, authenticated;

-- Al crear el usuario: fundador por fecha o por estar en la lista
create or replace function public.crear_perfil_usuario() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (user_id, acceso_fundador)
  values (
    NEW.id,
    -- Fundador si se registró antes del 21 de agosto 2026 (fecha de corte) o
    -- si su correo, ya confirmado, está en la lista (Google lo confirma al crear)
    NEW.created_at < '2026-08-21 00:00:00+00'
      or (NEW.email_confirmed_at is not null and public.es_correo_fundador(NEW.email))
  )
  on conflict (user_id) do nothing;
  return NEW;
end;
$$;

-- Después de creado el usuario: al confirmar el correo, o un invitado que vincula su cuenta
create or replace function public.activar_fundador_por_correo_usuario() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_correo_fundador(NEW.email) then
    update public.perfiles set acceso_fundador = true
    where user_id = NEW.id and not acceso_fundador;
  end if;
  return NEW;
end;
$$;

revoke all on function public.activar_fundador_por_correo_usuario() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_fundador on auth.users;
create trigger on_auth_user_email_fundador
  after update of email, email_confirmed_at on auth.users
  for each row
  when (NEW.email_confirmed_at is not null
        and (NEW.email is distinct from OLD.email or OLD.email_confirmed_at is null))
  execute function public.activar_fundador_por_correo_usuario();

-- Al agregar un correo a la lista, la cuenta que ya exista lo recibe al momento
create or replace function public.activar_fundador_por_lista() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles p set acceso_fundador = true
  from auth.users u
  where u.id = p.user_id and lower(u.email) = NEW.email
    and u.email_confirmed_at is not null and not p.acceso_fundador;
  return NEW;
end;
$$;

revoke all on function public.activar_fundador_por_lista() from public, anon, authenticated;

drop trigger if exists correos_fundadores_activar on public.correos_fundadores;
create trigger correos_fundadores_activar
  after insert on public.correos_fundadores
  for each row execute function public.activar_fundador_por_lista();
