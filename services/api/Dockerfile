# syntax=docker/dockerfile:1

# The Mercury API, for Coolify.
#
# BUILD CONTEXT IS THE REPO ROOT, not this directory. The API imports
# workspace packages (@mercury/chain, core, market, types) and every one
# of them exports raw .ts — nothing in this repo compiles — so the image has
# to carry the workspace and run TypeScript through tsx.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/",
# Dockerfile Location "/services/api/Dockerfile", Ports Exposes "8787".

FROM node:24-slim

# tini, because node ends up as PID 1. PID 1 does not get the kernel's default
# signal disposition: a process with no SIGTERM handler ignores SIGTERM rather
# than dying from it, so every Coolify stop or redeploy would sit out the grace
# period and then take a SIGKILL. tini forwards signals and reaps children.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Manifests before source, so editing a handler does not reinstall the tree.
#
# Every workspace package the API reaches needs its line here. One that is
# missing is linked without its own dependencies: the image builds, and the
# container dies on its first import. src/dockerfile.test.ts checks the list.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/chain/package.json packages/chain/
COPY packages/core/package.json packages/core/
COPY packages/market/package.json packages/market/
COPY packages/types/package.json packages/types/
COPY tooling/tsconfig/package.json tooling/tsconfig/
COPY services/api/package.json services/api/

# `@mercury/api...` is the API plus the workspace packages it depends on, so
# apps/web and apps/mobile never reach the image.
#
# Deliberately not --prod. Nothing is compiled, so tsx — a devDependency — is
# the runtime. Pruning dev dependencies would prune the thing that runs.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @mercury/api...

COPY packages/ packages/
COPY tooling/ tooling/
COPY services/api/ services/api/

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Coolify may run its own check instead; this one keeps `docker run` honest.
# node:24-slim ships no curl, and Node 24 has fetch, so ask Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

# pnpm isolates each package's dependencies, so tsx lives in the API's own
# node_modules and not the root's. `--import tsx` resolves against the working
# directory, so the working directory has to be the package that declares it.
WORKDIR /app/services/api

ENTRYPOINT ["/usr/bin/tini", "--"]

# Not `pnpm start`: that script reads a local .env, and it would put a process
# between tini and the server. `--import tsx` loads the transpiler in-process
# rather than spawning a child, which is what keeps signals working.
#
# Three arguments in one order, and both orderings are load-bearing. tsx comes
# first because the telemetry module is TypeScript and node cannot parse it
# otherwise — that failure at least announces itself, because the container
# dies at boot. Telemetry comes before the app because OpenTelemetry patches
# libraries as they load, so anything imported ahead of it goes
# uninstrumented; that failure announces nothing. The server starts, serves
# normally, and the only symptom is an empty Grafana, which reads as a broken
# collector and sends whoever is debugging it to the wrong machine.
# src/dockerfile.test.ts asserts the order for exactly that reason.
CMD ["node", "--import", "tsx", "--import", "./src/telemetry/otel.ts", "src/index.ts"]
