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

| Container      |             |                                               |
| -------------- | ----------- | --------------------------------------------- |
| `mercury-api`  | the API     | reads `OTEL_EXPORTER_OTLP_ENDPOINT` and sends |
| `mercury-web`  | the web app | untouched by any of this                      |
| `mercury-lgtm` | this stack  | receives, stores, draws                       |

So the API needs **one environment variable** and no code, and this stack needs
its two secrets and a network. If the stack is down the API carries on
normally: the exporter drops what it cannot deliver and the request path never
notices.

## Step 0: the shared network

Do this once, before the first deploy, or nothing below reaches anything else:

```bash
docker network create mercury
```

Then attach **both** the API resource and this one to it (in Coolify, the
resource's network settings; or `docker network connect mercury <container>`).

This is the step that is easy to skip and fails confusingly. Each Coolify
resource gets its own Docker network by default, so without a shared one the
API cannot resolve `mercury-lgtm` at all — the endpoint points at a hostname
that does not exist, the exporter retries quietly, and Grafana stays empty
while the API reports `telemetry: on` at boot. Exactly the symptom that sends
somebody off to debug the collector.

The alternative — publishing port 4318 — is what the shared network exists to
avoid. OTLP ingest has no authentication at all.

## Deploy

In Coolify, new resource → Docker Compose:

| Setting                 | Value                             |
| ----------------------- | --------------------------------- |
| Build Pack              | Docker Compose                    |
| Base Directory          | `/deploy/lgtm`                    |
| Docker Compose Location | `/deploy/lgtm/docker-compose.yml` |

Environment variables (both required — the compose file refuses to start
without them):

| Variable                 |                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `GRAFANA_ADMIN_PASSWORD` | the admin password. A secret, not a build arg.                                               |
| `GRAFANA_ROOT_URL`       | the public URL Coolify serves Grafana on. Without it Grafana's own links point at localhost. |

## The API's side: one variable

On the **API** resource:

| Variable                      | Required                 |                                                                                                                                                            |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | **yes, to switch it on** | `http://mercury-lgtm:4318` — the container name on the shared network. Unset means telemetry is off: the SDK never starts, and the API says which at boot. |
| `GIT_SHA`                     | no, but do it            | becomes `service.version`. Without it every deploy reports the same version, so "did this start at the last deploy" has no answer.                         |
| `LOG_LEVEL`                   | no                       | `info` by default. `debug` adds the decision inputs while reproducing somebody's problem.                                                                  |
| `OTEL_SERVICE_NAME`           | no                       | `mercury-api` by default.                                                                                                                                  |

That is the whole of the API's side. No code change, no SDK to initialise in a
handler, no sidecar. And it is reversible for the same reason: point that one
variable at a managed backend and delete this container.

## Two things not to change

**Only port 3000 is published.** The OTLP ports, 4317 and 4318, are
deliberately absent from the compose file. The API reaches them over the Docker
network by service name. OTLP ingest has no authentication of any kind, so
publishing it to the internet is an invitation to fill the disk.

**The `/data` volume is not optional.** All four components write there. Without
it a Coolify redeploy is a total history loss — and `portfolio_snapshot`-shaped
losses aside, it is the one failure here that cannot be repaired afterwards.

## Retention, and why it lives in three different places

Each store wants it somewhere different, which is the whole reason two config
files are mounted:

| Store      | Where                                       | Value      |
| ---------- | ------------------------------------------- | ---------- |
| Prometheus | `PROMETHEUS_EXTRA_ARGS` in the compose file | 90d        |
| Loki       | `loki-config.yaml`                          | 720h (30d) |
| Tempo      | `tempo-config.yaml`                         | 336h (14d) |

Both config files were taken verbatim from the image and edited. If an upgrade
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
