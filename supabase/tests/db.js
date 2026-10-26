// Base de datos de prueba: Postgres en WASM (PGlite) con el esquema real.
//
// Carga en orden todo lo que haya en supabase/migrations/ sobre un Postgres
// vacío: la primera es el volcado de producción del 2026-10-19.
// Antes crea lo mínimo que Supabase trae de fábrica y el volcado da
// por hecho: los roles, auth.uid(), Vault y pg_net. net.http_post no hace
// ninguna petición: guarda la llamada en net.llamadas para poder revisarla,
// y las pruebas escriben a mano en net._http_response la respuesta simulada.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const raiz = fileURLToPath(new URL('../../', import.meta.url))
const leer = (ruta) => readFileSync(raiz + ruta, 'utf8')

// El prefijo de fecha (formato de la CLI) da el orden de aplicación.
const MIGRACIONES = readdirSync(raiz + 'supabase/migrations')
  .filter(nombre => nombre.endsWith('.sql'))
  .sort()
  .map(nombre => 'supabase/migrations/' + nombre)

const PRELUDIO = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values
    ('project_url', 'https://proyecto-prueba.supabase.co'),
    ('internal_cron_secret', 'secreto-de-prueba');

  create schema net;
  create table net.llamadas (
    id bigserial primary key,
    url text,
    headers jsonb,
    body jsonb
  );
  create function net.http_post(
    url text,
    body jsonb default '{}'::jsonb,
    params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb,
    timeout_milliseconds integer default 5000
  ) returns bigint language sql as $$
    insert into net.llamadas (url, headers, body) values (url, headers, body) returning id
  $$;
  create table net._http_response (
    id bigint,
    status_code integer,
    content_type text,
    headers jsonb,
    content text,
    timed_out boolean,
    error_msg text,
    created timestamptz not null default now()
  );
`

export async function crearBaseDePrueba() {
  const db = new PGlite()
  await db.exec(PRELUDIO)
  for (const migracion of MIGRACIONES) {
    await db.exec(leer(migracion))
    // El volcado deja search_path vacío y row_security apagado para la sesión;
    // los restauramos para que las pruebas se comporten como producción.
    await db.exec(`select pg_catalog.set_config('search_path', 'public', false); set row_security = on;`)
  }
  return db
}

/** Crea un usuario en auth.users con su perfil y devuelve su id. */
export async function crearUsuario(db, { plan = 'gratis' } = {}) {
  const { rows: [{ id }] } = await db.query(`select gen_random_uuid() as id`)
  await db.query(`insert into auth.users (id) values ($1)`, [id])
  await db.query(`insert into public.perfiles (user_id, plan) values ($1, $2)`, [id, plan])
  return id
}

/** Crea una cuenta (como superusuario) y devuelve su id. */
export async function crearCuenta(db, userId, { nombre = 'Efectivo', tipo = 'efectivo', saldo = 0 } = {}) {
  const { rows: [{ id }] } = await db.query(
    `insert into public.cuentas (user_id, nombre, tipo, saldo) values ($1, $2, $3, $4) returning id`,
    [userId, nombre, tipo, saldo]
  )
  return id
}

export async function saldo(db, cuentaId) {
  const { rows: [fila] } = await db.query(`select saldo from public.cuentas where id = $1`, [cuentaId])
  return Number(fila.saldo)
}

/**
 * Ejecuta `fn` como lo haría la app: con el rol `authenticated` y el JWT del
 * usuario, así que aplican RLS y los GRANT de producción. Al final vuelve a
 * superusuario aunque `fn` falle.
 */
export async function comoUsuario(db, userId, fn) {
  await db.exec(`set role authenticated`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
  try {
    return await fn()
  } finally {
    await db.exec(`reset role`)
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

/** Igual que comoUsuario pero con el rol `anon` (sin sesión). */
export async function comoAnonimo(db, fn) {
  await db.exec(`set role anon`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role`)
  }
}
