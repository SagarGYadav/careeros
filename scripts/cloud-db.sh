#!/bin/bash
# Prepares PostgreSQL inside a Claude Code cloud session (see PROMPTS.md §5). Not used locally.
# The cloud image ships PostgreSQL 16; the environment's setup script installs pgvector.
set -e

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  echo "cloud-db.sh is only for Claude Code cloud sessions; locally use the DATABASE_URL in .env."
  exit 0
fi

service postgresql start

as_postgres() { su postgres -c "$1"; }

as_postgres "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='careeros'\" | grep -q 1" \
  || as_postgres "psql -c \"CREATE ROLE careeros LOGIN SUPERUSER PASSWORD 'careeros'\""

for db in careeros careeros_test; do
  as_postgres "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$db'\" | grep -q 1" \
    || as_postgres "createdb -O careeros $db"
done

echo "PostgreSQL ready: careeros and careeros_test."
