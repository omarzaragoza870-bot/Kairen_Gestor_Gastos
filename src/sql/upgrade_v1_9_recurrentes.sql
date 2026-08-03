-- ============================================================
-- Kairen Finanzas - Transacciones Recurrentes (v1.9)
-- Correr una sola vez en Supabase > SQL Editor
-- ============================================================

create table if not exists public.recurrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  cuenta_id uuid references public.cuentas(id) on delete set null,
  cuenta_nombre text not null,
  tipo text not null check (tipo in ('gasto', 'ingreso')),
  categoria_nombre text not null,
  monto numeric(12,2) not null check (monto > 0),
  descripcion text,
  frecuencia text not null check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual', 'anual')),
  dia_del_mes int check (dia_del_mes between 1 and 31), -- para mensual
  proxima_fecha date not null,
  activa boolean default true,
  created_at timestamptz default now()
);

alter table public.recurrentes enable row level security;

drop policy if exists "usuarios ven sus propias recurrentes" on public.recurrentes;
create policy "usuarios ven sus propias recurrentes" on public.recurrentes
  for all using (auth.uid() = user_id);

-- Procesa todas las transacciones recurrentes que vencen hoy o antes,
-- creándolas como transacciones reales y actualizando la próxima fecha.
-- Retorna cuántas se procesaron.
create or replace function procesar_recurrentes()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rec record;
  v_cuenta_saldo numeric;
  v_procesadas int := 0;
  v_proxima date;
begin
  for v_rec in
    select * from public.recurrentes
    where user_id = v_user_id
      and activa = true
      and proxima_fecha <= current_date
  loop
    -- Obtener saldo actual de la cuenta
    select saldo into v_cuenta_saldo
    from public.cuentas
    where id = v_rec.cuenta_id and user_id = v_user_id;

    if v_cuenta_saldo is null then
      v_cuenta_saldo := 0;
    end if;

    -- Crear la transacción usando la función segura existente
    perform crear_transaccion_segura(
      v_rec.cuenta_id,
      v_cuenta_saldo,
      v_rec.tipo,
      v_rec.categoria_nombre,
      v_rec.monto,
      v_rec.descripcion,
      v_rec.proxima_fecha
    );

    -- Calcular la próxima fecha según la frecuencia
    v_proxima := case v_rec.frecuencia
      when 'diario'     then v_rec.proxima_fecha + interval '1 day'
      when 'semanal'    then v_rec.proxima_fecha + interval '7 days'
      when 'quincenal'  then v_rec.proxima_fecha + interval '15 days'
      when 'mensual'    then v_rec.proxima_fecha + interval '1 month'
      when 'anual'      then v_rec.proxima_fecha + interval '1 year'
    end;

    update public.recurrentes
    set proxima_fecha = v_proxima
    where id = v_rec.id;

    v_procesadas := v_procesadas + 1;
  end loop;

  return v_procesadas;
end;
$$;
