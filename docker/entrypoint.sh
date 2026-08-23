#!/bin/sh
# Runtime guard, then hand off to the server.
#
# Migrations deliberately do NOT run here. The Prisma CLI drags in a
# dependency tree (@prisma/config, effect, and more) that Next's standalone
# tracing does not include, and copying all of node_modules into the runtime
# image to satisfy a CLI that runs once would triple its size. Migrations run
# in the `migrate` service instead, built from the builder stage, which
# already has the full dependency tree. See docker-compose.yml.
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] DATABASE_URL is not set, refusing to start" >&2
  exit 1
fi

if [ -z "${CLAIM_CODE_PEPPER:-}" ]; then
  echo "[entrypoint] CLAIM_CODE_PEPPER is not set, refusing to start" >&2
  echo "[entrypoint] without it no claim code can be verified" >&2
  exit 1
fi

echo "[entrypoint] starting: $*"
exec "$@"
