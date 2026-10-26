#!/usr/bin/env bash
# Supabase local (Docker) de este repo: aplica supabase/migrations/ en orden.
# En Windows corre dentro de WSL: npm run supabase:local -- start | stop | status | db reset
# En Linux o macOS: bash supabase/local.sh start
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
# Se ejecuta fuera del repo para que npx no use el binario de Windows de node_modules
cd ~
exec npx -y supabase@2.113.0 "$@" --workdir "$repo"
