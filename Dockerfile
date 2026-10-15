# The image of the v3: one Next.js server, built with public variables only.
#
# - No secret and no database at build time: DATABASE_URI, PAYLOAD_SECRET and every other
#   runtime variable are given to the container when it starts, never to `docker build`.
# - Versions are the ones of .nvmrc and of `packageManager` in package.json, with the digest
#   of each image. The CI guard C04 fails when one of them drifts (tests/ci).
# - `bun run image:controle` starts this image against a throwaway database and checks what
#   the README promises (« Image Docker »).

# 1. Dependencies, from the lockfile alone: this layer is rebuilt only when it changes.
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS deps
WORKDIR /app
# The patches of `patchedDependencies` (package.json): bun refuses the lockfile without them.
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile

# 2. Build, on the Node version that runs the server.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /app
COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps /app/node_modules ./node_modules
# Only what .dockerignore lets through: the sources and the build configuration.
COPY . .
# PUBLIC variables only. A name is added here by the ticket that starts reading it, and in
# the list of tests/ci at the same time: a runtime variable declared here would be written
# in the image for good.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_VERSION
ARG SOURCE_COMMIT
ENV NEXT_TELEMETRY_DISABLED=1
# Next freezes a NEXT_PUBLIC_* variable into the build as soon as it exists, even empty, and
# an empty site address would then hide the one given to the container. A build argument
# that was not given must therefore not exist at all.
RUN if [ -z "${NEXT_PUBLIC_SITE_URL:-}" ]; then unset NEXT_PUBLIC_SITE_URL; fi \
	&& if [ -z "${NEXT_PUBLIC_APP_VERSION:-}" ]; then unset NEXT_PUBLIC_APP_VERSION; fi \
	&& bun run build

# 3. What runs: the standalone server and its static files, nothing else.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Owned by `node`: the server writes its image and page caches under .next.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Never root: `node` is the unprivileged user of the base image (uid 1000).
USER node
EXPOSE 3000
# Healthy when /api/health answers 200, that is when the database answers. The first call
# starts Payload, which plays the migrations: the start period leaves it the time.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
