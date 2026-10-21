# syntax=docker/dockerfile:1

# The Mercury web app, for Coolify. Builds the SPA and serves it with nginx.
#
# BUILD CONTEXT IS THE REPO ROOT, not this directory — the app imports the same
# workspace packages the API does, and they ship raw .ts.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/",
# Dockerfile Location "/apps/web/Dockerfile", Ports Exposes "80".
#
# THE VITE_ VARIABLES ARE BUILD-TIME, NOT RUNTIME. Vite substitutes them into
# the bundle during `vite build`; setting them on the running container does
# nothing at all. In Coolify each one has to be ticked "Build Variable".

FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/chain/package.json packages/chain/
COPY packages/core/package.json packages/core/
COPY packages/market/package.json packages/market/
COPY packages/sdk/package.json packages/sdk/
COPY packages/types/package.json packages/types/
COPY packages/view/package.json packages/view/
COPY tooling/tsconfig/package.json tooling/tsconfig/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @mercury/web...

COPY packages/ packages/
COPY tooling/ tooling/
COPY apps/web/ apps/web/

ARG VITE_API_URL
ARG VITE_PRIVY_APP_ID
ARG VITE_SOLANA_RPC_URL
ARG VITE_REOWN_PROJECT_ID

# Fail here rather than ship a broken bundle. Both variables have quiet
# failure modes: VITE_API_URL falls back to http://localhost:8787, so every
# visitor's browser would call their own machine and the app would look like a
# backend outage; VITE_PRIVY_APP_ID throws on first render, which is a white
# screen. Neither is visible until someone opens the site.
RUN test -n "$VITE_API_URL" \
  || (echo "ERROR: VITE_API_URL must be set as a BUILD argument (Coolify: tick 'Build Variable'). Unset, the bundle would ship pointing at http://localhost:8787." && exit 1)
RUN test -n "$VITE_PRIVY_APP_ID" \
  || (echo "ERROR: VITE_PRIVY_APP_ID must be set as a BUILD argument (Coolify: tick 'Build Variable'). Unset, the app throws on first render." && exit 1)

# A warning rather than a failure, because there is now a default that works:
# the app falls back to a public endpoint that serves browsers. Shared, rate
# limited, and no indexed methods — a floor under a misconfigured deployment,
# not something to run on. Use a key restricted by domain: this ships to every
# visitor.
RUN test -n "$VITE_SOLANA_RPC_URL" \
  || echo "WARNING: VITE_SOLANA_RPC_URL is not set as a BUILD argument (Coolify: tick 'Build Variable'). Falling back to the shared public endpoint, which is rate limited."

# Optional, and only a warning: without it the deposit methods that need a
# wallet somebody already holds are hidden, and nothing else changes.
RUN test -n "$VITE_REOWN_PROJECT_ID" \
  || echo "WARNING: VITE_REOWN_PROJECT_ID is not set as a BUILD argument (Coolify: tick 'Build Variable'). Funding from a connected wallet will be hidden."

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
ENV VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL
ENV VITE_REOWN_PROJECT_ID=$VITE_REOWN_PROJECT_ID

RUN pnpm --filter @mercury/web build

# ---- serve --------------------------------------------------------------
# Nothing from the build survives but dist: no node_modules, no source, no
# pnpm store. The image is the static site and a web server.
FROM nginx:alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
