# LGTM on Coolify

Grafana, Prometheus, Tempo and Loki in one container, receiving OTLP from the
API. The design and the reasoning for self-hosting rather than buying are in
`docs/superpowers/specs/2026-10-15-observability-design.md`; this file is how
to run it.

## Before you start

- **The image is 3.5 GB.** First pull on a small Coolify box is slow and needs
  the disk headroom.
- **It idles at roughly 0.6–2 GB of RAM.** That box already runs the API, the
  web container and Postgres. Check free memory first, not after.
- **Grafana calls this image "for development, demo, and testing
  environments"** and points production users at Grafana Cloud. We run it
  anyway, and the spec says why — the short version is that the application
  only ever knows an OTLP endpoint, so moving to a managed backend later is one
  environment variable and no code.

## What this is, and what goes where

**A separate container.** Nothing of this stack lives inside the API, and that
is the point: the API knows one thing about it, a URL. Three containers on the
box, each its own Coolify resource:

| Resource            | Built from                | Its share of this                             |
| ------------------- | ------------------------- | --------------------------------------------- |
| the API             | `services/api/Dockerfile` | reads `OTEL_EXPORTER_OTLP_ENDPOINT` and sends |
| the web app         | `apps/web/Dockerfile`     | untouched by any of this                      |
| the telemetry stack | `deploy/lgtm/Dockerfile`  | receives, stores, draws                       |

All three are Dockerfile resources built from this repository, so all three are
configured the same way and nobody has to remember which one is different.

The API needs **one environment variable** and no code. This stack needs two
secrets and a volume. If the stack is down the API carries on normally: the
exporter drops what it cannot deliver and the request path never notices.

## Deploy

Exactly as the API and the web app are deployed — same repo, same build pack,
same base directory. There is nothing to create on the host first.

| Setting             | Value                     |
| ------------------- | ------------------------- |
| Build Pack          | **Dockerfile**            |
| Base Directory      | `/`                       |
| Dockerfile Location | `/deploy/lgtm/Dockerfile` |
| Ports Exposes       | `3000`                    |

Two environment variables, both required:

| Variable                     |                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GF_SECURITY_ADMIN_PASSWORD` | a password you generate (`openssl rand -base64 24`). A secret, not a build arg.                                                  |
| `GF_SERVER_ROOT_URL`         | the public URL Coolify serves this on, e.g. `https://grafana.trymercury.xyz`. Without it Grafana's own links point at localhost. |

And **one persistent volume, mounted at `/data`**. This is the only manual step
and the only one that cannot be repaired later: all four components write
there, so without it every redeploy is a total history loss. Add it in the
resource's Storages tab before the first deploy.

Everything else — the retention figures, the dashboards, the Tempo and Loki
configs — is in the image, because it is in this repository.

### Why a Dockerfile and not the compose file beside it

The compose file was how this stack was verified locally, and it is kept for
that. It is the wrong shape for Coolify, which was established the hard way:

- **Compose gives each resource its own network.** The API is its own Coolify
  resource on its own network, so it could not resolve this container at all.
  Working around it meant an external network created by hand on the host and
  re-attached to the API after every redeploy — a manual step that gets
  forgotten and then looks like "telemetry broke".
- **Relative bind mounts do not resolve.** Coolify checks the repository out
  somewhere of its own choosing, so `./tempo-config.yaml` named a path that did
  not exist, Docker created a directory over it, and the container died with
  `error mounting … not a directory: Are you trying to mount a directory onto a
file`.

Built as a Dockerfile the configs are in the image, so there are no mounts to
resolve, and Coolify wires this container to the others the same way it already
wires the API to the web app — so there is nothing to create and nothing to
remember.

## The API's side: one variable

On the **API** resource:

| Variable                      | Required                 |                                                                                                                                                                 |
| ----------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | **yes, to switch it on** | the address Coolify gives this resource on its internal network, port 4318. Unset means telemetry is off: the SDK never starts, and the API says which at boot. |
| `GIT_SHA`                     | no, but do it            | becomes `service.version`. Without it every deploy reports the same version, so "did this start at the last deploy" has no answer.                              |
| `LOG_LEVEL`                   | no                       | `info` by default. `debug` adds the decision inputs while reproducing somebody's problem.                                                                       |
| `OTEL_SERVICE_NAME`           | no                       | `mercury-api` by default.                                                                                                                                       |

That is the whole of the API's side: no code change, no SDK to initialise in a
handler, no sidecar. And it is reversible for the same reason — point that one
variable at a managed backend and delete this resource.

OTLP has no authentication of any kind, which is why port 4318 is not exposed
and the API reaches it over Coolify's internal network rather than a published
port.

## Two things not to change

**Only port 3000 is exposed.** The OTLP ports, 4317 and 4318, are deliberately
not declared — Coolify publishes what a resource exposes. The API reaches OTLP
over Coolify's internal network instead, which needs nothing published. OTLP
ingest has no authentication at all, so publishing it is an invitation to fill
the disk.

**The `/data` volume is not optional**, and it is the one thing the repository
cannot carry for you. All four components write there. Without it a redeploy is
a total history loss, and it is the only failure here that cannot be repaired
afterwards.

## Retention, and why it lives in three different places

Each store wants it somewhere different, which is the whole reason two config
files are mounted:

| Store      | Where                                       | Value      |
| ---------- | ------------------------------------------- | ---------- |
| Prometheus | `PROMETHEUS_EXTRA_ARGS` in the compose file | 90d        |
| Loki       | `loki-config.yaml`                          | 720h (30d) |
| Tempo      | `tempo-config.yaml`                         | 336h (14d) |

All three are in the repository rather than in Coolify's UI, so the current
value is reviewable. Both config files were taken verbatim from the image and
edited. If an upgrade
breaks one, diff it against the image's current copy rather than guessing:

```bash
docker run --rm --entrypoint cat grafana/otel-lgtm:latest /otel-lgtm/loki-config.yaml
```

Three traps, all of which cost a container restart to find:

- **`LOKI_EXTRA_ARGS=--limits.retention-period=720h` does not work.** It looks
  right by analogy with the Prometheus line. Loki exits with `flag provided but
not defined: -limits.retention-period` and the container dies with `Error:
Loki exited before becoming ready`.
- **Loki needs both halves.** `retention_period` with no `retention_enabled`
  compactor is a setting that reports no error and deletes nothing. The disk
  fills while the config looks correct.
- **Tempo's retention is not a top-level `compactor:` block.** That is Tempo
  2.x, and what the guides still show. Tempo 3.1 answers `field compactor not
found in type app.Config`. It is a per-tenant override now:
  `overrides.defaults.compaction.block_retention`.

## Dashboards

Two, provisioned from `grafana/dashboards/` and in git on purpose. One clicked
together in a running Grafana is one you rebuild from memory after the next
redeploy, and it cannot be reviewed in a pull request. `allowUiUpdates` is on,
so experimenting in the UI works; the file wins on restart.

- **Mercury · API health** — request rate, 5xx rate and latency percentiles,
  all grouped by `http_route`, which is the route pattern (`/v1/invest/:ticker`)
  and never the path.
- **Mercury · background jobs** — failures and durations per job. The panel
  that matters is **"Snapshot ran in the last 90 minutes"**: `portfolio-snapshot`
  is the only record of what an account used to be worth, nothing can
  reconstruct a reading that was never taken, and it runs hourly. Alert on that
  one before anything else.

Job metrics are labelled `mercury_job`, not `job`. Prometheus owns `job` and
overwrites it with the scrape target's name — measured, and it collapsed all
eight jobs into a single series with no job names at all.

## Running it locally

The compose file, which is what it is now for:

```bash
cd deploy/lgtm
GRAFANA_ADMIN_PASSWORD=local GRAFANA_ROOT_URL=http://localhost:3000 \
  docker compose up -d
```

It bind-mounts the configs rather than baking them, so editing retention or a
dashboard and restarting is immediate. It also declares an external `mercury`
network, so `docker network create mercury` once before the first run.

## Verifying a deployment

Everything below was verified against this exact config locally before it was
committed, so a failure here is the deployment rather than the files.

1. **The two containers can see each other.** From the API container,
   `getent hosts mercury-lgtm`. If that prints nothing, step 0 did not happen
   and nothing else below will work — the API will still say `telemetry: on` at
   boot, because all it knows is that a URL was configured.
1. **Grafana answers.** `curl -s $GRAFANA_ROOT_URL/api/health` → `"database":
"ok"`.
1. **The dashboards provisioned.** Both appear in the Mercury folder within
   30 seconds (the provisioner's poll interval).
1. **Telemetry arrives.** Make one request to the API, then in Grafana →
   Explore → Prometheus: `sum(rate(http_server_request_duration_seconds_count[5m]))`
   is above zero.
1. **Traces arrive.** Explore → Tempo → Search, service `mercury-api`. The span
   should be named for the route pattern.
1. **Logs arrive, and join to traces.** Explore → Loki,
   `{service_name="mercury-api"} | scope="orders"`. Each line carries
   `trace_id` as structured metadata; the Tempo datasource's trace-to-logs link
   uses it, and it works in both directions.
1. **Cardinality is sane.** `curl .../loki/api/v1/labels` should list only
   `service_name` and `deployment_environment_name`. Everything else —
   `trace_id`, `scope`, `ticker` — is structured metadata, which is queryable
   without being indexed. If that list grows, something started promoting
   attributes to labels and Loki's index will suffer for it.
1. **The flush on shutdown works.** Restart the API and confirm the spans from
   its last request still arrived. That is `LGTM_SHUTDOWN_TIMEOUT_SECONDS` and
   the `SIGTERM` handler in `services/api/src/telemetry/otel.ts`.

## When to stop running this

Named in advance so it is a decision rather than a drift: if the box runs short
of memory, if retention has to outgrow one volume, or if anyone spends a second
day operating it — point `OTEL_EXPORTER_OTLP_ENDPOINT` at a managed backend and
delete this container. No application code changes.
