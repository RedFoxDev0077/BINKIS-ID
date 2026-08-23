# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# BINKIS ID production image.
#
# Debian slim rather than Alpine, deliberately. Prisma ships different query
# engine binaries for glibc and musl, and the Alpine path needs an explicit
# binaryTargets entry plus openssl juggling. This is one of those places where
# a slightly larger base image buys a class of deployment failure never
# happening.
# ---------------------------------------------------------------------------
FROM node:24-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- build -----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The client must be generated before the build, because server components
# import it at compile time.
RUN npx prisma generate
RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Next's standalone tracing does not reliably pick up the Prisma query engine
# binary, so the generated client is copied explicitly. Without this the image
# builds cleanly and then fails on the first query, which is the worst possible
# time to find out.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# The Prisma CLI is deliberately NOT copied here. It needs its own dependency
# tree (@prisma/config, effect, and more) which standalone tracing omits, and
# pulling all of node_modules in to satisfy a one-shot command would triple
# the runtime image. Migrations run in the `migrate` service, built from the
# builder stage above, which already has everything.

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
