# syntax=docker/dockerfile:1

# The Mercury treasury, for Coolify.
#
# BUILD CONTEXT IS THE REPO ROOT, not this directory. It imports @mercury/keys,
# which exports raw .ts like everything else here, so the image carries the
# workspace and runs TypeScript through tsx.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/",
# Dockerfile Location "/services/treasury/Dockerfile".
#
# DO NOT MAP A PUBLIC PORT. This service holds spendable keys and is reached by
# services/api on the internal network only. There is nothing here that anyone
# outside should be able to ask. See docs/adr/0015-treasury-service.md.

FROM node:24-slim

# tini, for the same reason as services/api: node ends up as PID 1, and PID 1
# without a SIGTERM handler ignores SIGTERM rather than dying from it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Manifests before source, so editing a handler does not reinstall the tree.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/keys/package.json packages/keys/
COPY tooling/tsconfig/package.json tooling/tsconfig/
COPY services/treasury/package.json services/treasury/

# Deliberately not --prod: nothing is compiled, so tsx — a devDependency — is
# the runtime, and pruning dev dependencies would prune the thing that runs.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @mercury/treasury...

COPY packages/keys/ packages/keys/
COPY tooling/ tooling/
COPY services/treasury/ services/treasury/

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# node:24-slim ships no curl, and Node 24 has fetch, so ask Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

WORKDIR /app/services/treasury

ENTRYPOINT ["/usr/bin/tini", "--"]

# `--import tsx` loads the transpiler in-process rather than spawning a child,
# which is what keeps signals working under tini.
CMD ["node", "--import", "tsx", "src/index.ts"]
