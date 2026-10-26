-- Fix: procesar_recurrentes() tenia 7 argumentos en vez de 6
create or replace function public.procesar_recurrentes()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rec record;
  v_procesadas int := 0;
  v_proxima date;
begin
  for v_rec in
    select * from public.recurrentes
    where user_id = v_user_id
      and activa = true
      and proxima_fecha <= current_date
  loop
    perform crear_transaccion_segura(
      v_rec.cuenta_id,
      v_rec.categoria_nombre,
      v_rec.tipo,
      v_rec.monto,
      v_rec.descripcion,
      v_rec.proxima_fecha
    );
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
