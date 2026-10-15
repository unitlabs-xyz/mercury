#!/bin/sh
# Refuse to start without the two things that cannot be baked into the image.
#
# The compose file guaranteed these with `${VAR:?message}`, which fails the
# deploy when they are missing. Translating it to a Dockerfile silently lost
# that: the base image starts Grafana with admin/admin and prints as much, so
# a resource deployed without the password would come up reachable, on the
# public URL Coolify gives it, with a credential anybody can guess.
#
# So this is the guard, restored. A failed deploy is a far better outcome than
# a successful one nobody looks at twice.
set -e

if [ -z "${GF_SECURITY_ADMIN_PASSWORD:-}" ]; then
  echo "FATAL: GF_SECURITY_ADMIN_PASSWORD is not set." >&2
  echo "Grafana would start with admin/admin on whatever URL this is reachable at." >&2
  echo "Generate one with: openssl rand -base64 24" >&2
  if [ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]; then
    echo >&2
    echo "GRAFANA_ADMIN_PASSWORD is set, but that was the compose file's name for it." >&2
    echo "This image reads Grafana's own variable: rename it to GF_SECURITY_ADMIN_PASSWORD." >&2
  fi
  exit 1
fi

if [ -z "${GF_SERVER_ROOT_URL:-}" ]; then
  echo "FATAL: GF_SERVER_ROOT_URL is not set." >&2
  echo "Grafana's own links — alerts, shares, OAuth redirects — would point at localhost." >&2
  echo "Set it to the URL Coolify serves this on, e.g. https://grafana.example.com" >&2
  if [ -n "${GRAFANA_ROOT_URL:-}" ]; then
    echo >&2
    echo "GRAFANA_ROOT_URL is set, but that was the compose file's name for it." >&2
    echo "Rename it to GF_SERVER_ROOT_URL." >&2
  fi
  exit 1
fi

exec /otel-lgtm/run-all.sh
