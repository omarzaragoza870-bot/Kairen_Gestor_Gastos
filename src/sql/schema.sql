-- ============================================================
-- Kairen Finanzas - Schema inicial
-- Correr esto en: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

-- Cuentas (Efectivo, Tarjeta, etc.) — cada usuario tiene las suyas
create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  tipo text not null default 'efectivo', -- 'efectivo' | 'tarjeta'
  saldo numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- Categorías (predeterminadas + las que el usuario cree, ej. "Ropa", "Inglés")
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  tipo text not null, -- 'gasto' | 'ingreso'
  icono text default '🏷️',
  created_at timestamptz default now()
);

-- Transacciones
-- OJO: guardamos categoria_nombre directo aquí (no solo el id) para que
-- nunca aparezca "Desconocida" si la categoría se edita o se borra después
-- — este fue justo el bug que detectamos en la app original.
create table if not exists public.transacciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  cuenta_id uuid references public.cuentas(id) on delete set null,
  categoria_id uuid references public.categorias(id) on delete set null,
  categoria_nombre text not null,
  tipo text not null, -- 'gasto' | 'ingreso'
  monto numeric(12,2) not null,
  descripcion text,
  fecha date not null default current_date,
  created_at timestamptz default now()
);

-- Ahorro externo (mejora #3): solo tracking manual, NO afecta cuentas/transacciones
create table if not exists public.ahorro_externo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre_banco text not null,
  monto numeric(12,2) not null,
  fecha_registro date not null default current_date,
  nota text,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security: cada usuario solo ve/edita sus propios datos
-- ============================================================
alter table public.cuentas enable row level security;
alter table public.categorias enable row level security;
alter table public.transacciones enable row level security;
alter table public.ahorro_externo enable row level security;

create policy "usuarios ven sus propias cuentas" on public.cuentas
  for all using (auth.uid() = user_id);

create policy "usuarios ven sus propias categorias" on public.categorias
  for all using (auth.uid() = user_id);

create policy "usuarios ven sus propias transacciones" on public.transacciones
  for all using (auth.uid() = user_id);

create policy "usuarios ven su propio ahorro externo" on public.ahorro_externo
  for all using (auth.uid() = user_id);
