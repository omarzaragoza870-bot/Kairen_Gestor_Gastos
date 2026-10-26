-- 20261026000003_token_un_dueno.sql
--
-- Un dispositivo (token FCM de Android o suscripción push del navegador)
-- recibe los avisos de UNA sola cuenta: la última que inició sesión en él.
-- Antes, si alguien cerraba sesión sin conexión y otra persona entraba con
-- su cuenta en el mismo teléfono, el token quedaba registrado para las dos y
-- el teléfono seguía recibiendo los avisos (con montos) de la cuenta anterior.
-- La app ya borra el token al cerrar sesión; esto lo garantiza en el servidor.

create or replace function public.dejar_dispositivo_a_un_usuario() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'fcm_tokens' then
    delete from public.fcm_tokens where token = new.token and user_id <> new.user_id;
  else
    delete from public.push_subscriptions where endpoint = new.endpoint and user_id <> new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.dejar_dispositivo_a_un_usuario() from public, anon, authenticated;

drop trigger if exists fcm_tokens_un_dueno on public.fcm_tokens;
create trigger fcm_tokens_un_dueno
  after insert on public.fcm_tokens
  for each row execute function public.dejar_dispositivo_a_un_usuario();

drop trigger if exists push_subscriptions_un_dueno on public.push_subscriptions;
create trigger push_subscriptions_un_dueno
  after insert on public.push_subscriptions
  for each row execute function public.dejar_dispositivo_a_un_usuario();

-- Limpieza de lo que ya estaba repetido: se queda la cuenta más reciente
delete from public.fcm_tokens a
  using public.fcm_tokens b
  where a.token = b.token and a.user_id <> b.user_id
    and (a.created_at, a.id) < (b.created_at, b.id);

delete from public.push_subscriptions a
  using public.push_subscriptions b
  where a.endpoint = b.endpoint and a.user_id <> b.user_id
    and (a.created_at, a.id) < (b.created_at, b.id);
