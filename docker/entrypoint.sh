#!/bin/sh
# Applies pending migrations, then hands off to the server.
#
# `migrate deploy` only ever applies migrations that already exist in
# prisma/migrations. It never generates one, never prompts, and never resets,
# so it is safe to run unattended on every container start. That matters here:
# a piece row losing its claim_hash would mean a hologram that can never be
# claimed, and there is no recovery from that short of a reprint.
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] DATABASE_URL is not set, refusing to start" >&2
  exit 1
fi

echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] starting: $*"
exec "$@"
