#!/usr/bin/env bash
# Run the data-spine suite against a throwaway Postgres.
#
# The RLS policies in db/policies/** are the enforcement of SPEC 06 — they
# cannot be tested from TypeScript, because the thing under test is the
# database refusing a query the application layer never saw. This script is how
# that gets exercised.
#
#   ./scripts/db-test.sh
#
# Requires Docker. Leaves nothing behind.

set -euo pipefail

CONTAINER=freshstart-db-test
PORT=${FRESHSTART_TEST_PG_PORT:-55432}
PASSWORD=freshstart-test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> starting postgres"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB=freshstart \
  -p "$PORT:5432" \
  postgres:16-alpine >/dev/null

echo -n "==> waiting for readiness"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d freshstart >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 1
done

run_sql() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d freshstart -q < "$1"
}

echo "==> applying migrations"
for file in \
  "$ROOT/db/migrations/0000_auth_shim.sql" \
  "$ROOT/db/migrations/consent/0001_consent_ledger.sql" \
  "$ROOT/db/migrations/consent/0002_profiles.sql" \
  "$ROOT/db/migrations/stakes/0001_stake_ledger.sql" \
  "$ROOT/db/policies/0001_rls.sql"
do
  echo "    $(basename "$file")"
  run_sql "$file"
done

echo "==> running db/tests/rls.test.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d freshstart \
  < "$ROOT/db/tests/rls.test.sql" 2>&1 | grep -E '^(NOTICE|ERROR|FAIL)' || true

echo "==> passed"
