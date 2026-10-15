# syntax=docker/dockerfile:1

# The Mercury telemetry stack — Grafana, Prometheus, Tempo and Loki — for Coolify.
#
# BUILD CONTEXT IS THE REPO ROOT, as it is for the API and the web app, so that
# all three resources are configured the same way in Coolify and nobody has to
# remember which one is different.
#
# In Coolify: Build Pack "Dockerfile", Base Directory "/",
# Dockerfile Location "/deploy/lgtm/Dockerfile", Ports Exposes "3000".
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

# Nobody signs up for an internal telemetry stack.
ENV GF_USERS_ALLOW_SIGN_UP="false"

# Tempo's and Loki's retention.
#
# Both files are the image's own, taken with `docker run --rm --entrypoint cat`
# and edited — a partial config does not start, and the image's copies change
# between versions. Each says so at the top, along with the trap it exists to
# avoid.
COPY deploy/lgtm/tempo-config.yaml /otel-lgtm/tempo-config.yaml
COPY deploy/lgtm/loki-config.yaml /otel-lgtm/loki-config.yaml

# The dashboards, and the provisioner that loads them.
#
# In the image rather than bind-mounted, so a deploy carries them. A dashboard
# that lives only in a container's volume is one you rebuild from memory after
# the next redeploy, and it cannot be reviewed in a pull request.
COPY deploy/lgtm/grafana/provisioning/dashboards/ /otel-lgtm/grafana/conf/provisioning/dashboards/
COPY deploy/lgtm/grafana/dashboards/ /var/lib/grafana/dashboards/

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
# And one thing that is not configuration at all: a persistent volume mounted
# at /data. Every component writes there, and without it a redeploy is a total
# history loss. See README.md.
