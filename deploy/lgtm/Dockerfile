# syntax=docker/dockerfile:1

# The Mercury telemetry stack — Grafana, Prometheus, Tempo and Loki — for Coolify.
#
# BUILD CONTEXT IS THIS DIRECTORY, unlike the API and the web app, whose
# context is the repo root because they import workspace packages. This
# resource needs nothing outside deploy/lgtm, so a smaller context is both
# faster and self-contained.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/deploy/lgtm",
# Dockerfile Location "/deploy/lgtm/Dockerfile", Ports Exposes "3000".
#
# Those COPY paths are relative to this directory. With Base Directory "/" the
# build context is the repo root and every one of them fails with
# `"/deploy/lgtm/tempo-config.yaml": not found` — the two have to agree.
#
# A Dockerfile rather than the docker-compose.yml beside it, and that is the
# whole reason this file exists. Compose gives each resource its own network,
# so an API deployed as its own Coolify resource cannot resolve this container
# at all; working around it meant an external network created by hand on the
# host and re-attached to the API after every redeploy — a manual step that
# gets forgotten and then looks like "telemetry broke". Built this way, Coolify
# wires this container to the others exactly as it already wires the API to the
# web app, and there is nothing to create and nothing to remember.
#
# The compose file stays for local use; see README.md.

FROM grafana/otel-lgtm:latest

# Retention, baked in rather than left as Coolify environment variables.
#
# These are decisions, so they belong in the repository where they can be
# reviewed, not in a text field in a UI where the only record of the current
# value is the UI. Prometheus is the only one of the three that takes its
# retention as a flag; Tempo's and Loki's are in the config files below, which
# is itself the reason those files are copied in.
ENV PROMETHEUS_EXTRA_ARGS="--storage.tsdb.retention.time=90d"

# Five seconds is the default and is tight for flushing four stores to disk. A
# redeploy that cuts them off loses whatever had not been written yet.
ENV LGTM_SHUTDOWN_TIMEOUT_SECONDS="30"

# Anonymous access OFF, which the base image turns ON.
#
# This is the single most important line in this file. grafana/otel-lgtm does:
#
#   export GF_AUTH_ANONYMOUS_ENABLED="${GF_AUTH_ANONYMOUS_ENABLED:-true}"
#   export GF_AUTH_ANONYMOUS_ORG_ROLE="${GF_AUTH_ANONYMOUS_ORG_ROLE:-Admin}"
#
# — defaults that make sense for the demo stack it says it is, and are a hole
# anywhere reachable. Measured against the image: with no credentials at all,
# `GET /api/search` answers 200, and so does any password you invent, because
# the request is served as an anonymous Admin. GF_SECURITY_ADMIN_PASSWORD is
# decorative until this is set, and GF_USERS_ALLOW_SIGN_UP does nothing about
# it either — there is no sign-up to allow when nobody needs an account.
#
# An admin in Grafana can query every datasource through Explore and add new
# ones. On a public URL that is the whole telemetry store, and a foothold.
ENV GF_AUTH_ANONYMOUS_ENABLED="false"
ENV GF_AUTH_ANONYMOUS_ORG_ROLE="Viewer"

# Nobody signs up for an internal telemetry stack.
ENV GF_USERS_ALLOW_SIGN_UP="false"

# Tempo's and Loki's retention.
#
# Both files are the image's own, taken with `docker run --rm --entrypoint cat`
# and edited — a partial config does not start, and the image's copies change
# between versions. Each says so at the top, along with the trap it exists to
# avoid.
COPY tempo-config.yaml /otel-lgtm/tempo-config.yaml
COPY loki-config.yaml /otel-lgtm/loki-config.yaml

# The dashboards, and the provisioner that loads them.
#
# In the image rather than bind-mounted, so a deploy carries them. A dashboard
# that lives only in a container's volume is one you rebuild from memory after
# the next redeploy, and it cannot be reviewed in a pull request.
COPY grafana/provisioning/dashboards/ /otel-lgtm/grafana/conf/provisioning/dashboards/
COPY grafana/dashboards/ /var/lib/grafana/dashboards/

# Grafana only.
#
# The OTLP ports, 4317 and 4318, are deliberately not declared. Coolify
# publishes what a resource exposes, and OTLP ingest has no authentication of
# any kind — the API reaches it over Coolify's internal network by container
# name, which needs no port published at all.
EXPOSE 3000

# Two things still have to be set in Coolify, and neither can live here:
#
#   GF_SECURITY_ADMIN_PASSWORD  a secret, so not in an image
#   GF_SERVER_ROOT_URL          the public URL, which the repository does not know
#
# The entrypoint refuses to start without either, rather than letting the base
# image come up on admin/admin — which it does, and announces, and which would
# be reachable on whatever URL Coolify assigns. It also names the compose
# file's old variable names if it finds those set instead, because that is
# exactly the mistake available here.
#
# Note for whoever reads Coolify's build log: Coolify passes every environment
# variable on the resource as a build ARG, so buildkit warns
# `SecretsUsedInArgOrEnv` about the password. Turn off "Build Variable" for it
# on the resource — it is only needed at runtime, and a secret passed as a
# build argument is recorded in the image's build metadata.
COPY entrypoint.sh /otel-lgtm/mercury-entrypoint.sh
ENTRYPOINT ["/otel-lgtm/mercury-entrypoint.sh"]

# And one thing that is not configuration at all: a persistent volume mounted
# at /data. Every component writes there, and without it a redeploy is a total
# history loss. See README.md.
