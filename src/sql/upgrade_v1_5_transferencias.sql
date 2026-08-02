-- ============================================================
-- Kairen Finanzas - Transferencias entre cuentas (v1.5)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.transferencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  cuenta_origen_id uuid references public.cuentas(id) on delete set null,
  cuenta_destino_id uuid references public.cuentas(id) on delete set null,
  cuenta_origen_nombre text not null,
  cuenta_destino_nombre text not null,
  monto numeric(12,2) not null check (monto > 0),
  descripcion text,
  fecha date not null default current_date,
  created_at timestamptz default now()
);

alter table public.transferencias enable row level security;

drop policy if exists "usuarios ven sus propias transferencias" on public.transferencias;
create policy "usuarios ven sus propias transferencias" on public.transferencias
  for all using (auth.uid() = user_id);

-- Crea la transferencia y mueve el saldo de una cuenta a otra en una sola
-- operación atómica (o se hace todo, o no se hace nada).
create or replace function crear_transferencia_segura(
  p_cuenta_origen_id uuid,
  p_cuenta_destino_id uuid,
  p_monto numeric,
  p_descripcion text,
  p_fecha date
) returns uuid
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_origen_nombre text;
  v_destino_nombre text;
  v_nueva_id uuid;
begin
  if p_cuenta_origen_id = p_cuenta_destino_id then
    raise exception 'La cuenta origen y destino no pueden ser la misma.';
  end if;

  select nombre into v_origen_nombre from public.cuentas where id = p_cuenta_origen_id and user_id = v_user_id;
  select nombre into v_destino_nombre from public.cuentas where id = p_cuenta_destino_id and user_id = v_user_id;

  if v_origen_nombre is null or v_destino_nombre is null then
    raise exception 'Cuenta no encontrada.';
  end if;

  update public.cuentas set saldo = saldo - p_monto where id = p_cuenta_origen_id and user_id = v_user_id;
  update public.cuentas set saldo = saldo + p_monto where id = p_cuenta_destino_id and user_id = v_user_id;

  insert into public.transferencias (
    user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto, descripcion, fecha
  ) values (
    v_user_id, p_cuenta_origen_id, p_cuenta_destino_id, v_origen_nombre, v_destino_nombre, p_monto, p_descripcion, p_fecha
  ) returning id into v_nueva_id;

  return v_nueva_id;
end;
$$;

-- Elimina una transferencia y revierte el movimiento de saldo.
create or replace function eliminar_transferencia_segura(p_transferencia_id uuid) returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_registro record;
begin
  select * into v_registro from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
  if v_registro is null then
    raise exception 'Transferencia no encontrada.';
  end if;

  if v_registro.cuenta_origen_id is not null then
    update public.cuentas set saldo = saldo + v_registro.monto where id = v_registro.cuenta_origen_id and user_id = v_user_id;
  end if;
  if v_registro.cuenta_destino_id is not null then
    update public.cuentas set saldo = saldo - v_registro.monto where id = v_registro.cuenta_destino_id and user_id = v_user_id;
  end if;

  delete from public.transferencias where id = p_transferencia_id and user_id = v_user_id;
end;
$$;
