# syntax=docker/dockerfile:1

# The Mercury admin dashboard, for Coolify. Builds the SPA and serves it with
# nginx — the same shape as apps/web, and a separate resource from it.
#
# BUILD CONTEXT IS THE REPO ROOT, not this directory: the app imports
# @mercury/view for money formatting, and workspace packages ship raw .ts.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/",
# Dockerfile Location "/apps/admin/Dockerfile", Ports Exposes "80".
#
# THE VITE_ VARIABLES ARE BUILD-TIME, NOT RUNTIME. Vite substitutes them into
# the bundle during `vite build`; setting them on the running container does
# nothing at all. In Coolify each one has to be ticked "Build Variable".
#
# This image contains no secret. Who may read the dashboard is decided by
# ADMIN_PRIVY_USER_IDS on the *API*, and the API answers 404 to everybody
# else — so a copy of this bundle is worth nothing without an allowlisted
# account.

FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/view/package.json packages/view/
COPY tooling/tsconfig/package.json tooling/tsconfig/
COPY apps/admin/package.json apps/admin/

# `--filter @mercury/admin...` installs this app and what it depends on, and
# nothing else — @mercury/view and no other workspace package. It does not
# make the bundle smaller: Privy ships the wallet stack transitively, so this
# builds to about the same size as apps/web. It makes the install smaller and
# the dependency surface honest.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @mercury/admin...

COPY packages/ packages/
COPY tooling/ tooling/
COPY apps/admin/ apps/admin/

ARG VITE_API_URL
ARG VITE_PRIVY_APP_ID

# Fail here rather than ship a broken bundle. Both have quiet failure modes:
# VITE_API_URL falls back to http://localhost:8787, so every visitor's browser
# would call their own machine and the dashboard would look like a backend
# outage; VITE_PRIVY_APP_ID throws on first render, which is a white screen.
# Neither is visible until somebody opens the site.
RUN test -n "$VITE_API_URL" \
  || (echo "ERROR: VITE_API_URL must be set as a BUILD argument (Coolify: tick 'Build Variable'). Unset, the bundle would ship pointing at http://localhost:8787." && exit 1)
RUN test -n "$VITE_PRIVY_APP_ID" \
  || (echo "ERROR: VITE_PRIVY_APP_ID must be set as a BUILD argument (Coolify: tick 'Build Variable'). Unset, the app throws on first render." && exit 1)

# It has to be the same Privy app as the web app, because the allowlist on the
# API holds Privy DIDs and a different app issues different ones. A build that
# looks fine and signs you in as a DID the API has never heard of answers 404
# to everything, which reads as a broken dashboard rather than a wrong app id.
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID

RUN pnpm --filter @mercury/admin build

# ---- serve --------------------------------------------------------------
FROM nginx:alpine AS runtime

COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
