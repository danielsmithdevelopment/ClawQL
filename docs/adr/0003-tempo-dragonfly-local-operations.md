# ADR 0003: Grafana Tempo for local traces and DragonflyDB for Redis-protocol brokers

- Status: Accepted
- Date: 2026-05-02
- Related: [#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155) (Istio / mesh), [#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160) (OTLP traces), [#113](https://github.com/danielsmithdevelopment/ClawQL/issues/113) (document pipeline), [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118) (Onyx), [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) (Grafana)
- Docs / scripts: [`docs/deployment/docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md), [`docker/README.md`](../../docker/README.md), [`scripts/kubernetes/install-istio-docker-desktop.sh`](../../scripts/kubernetes/install-istio-docker-desktop.sh), [`charts/clawql-mcp`](../../charts/clawql-mcp/README.md)

## Context

### Distributed tracing (Docker Desktop Istio lab)

The optional **Docker Desktop + Istio** path installs a small **local observability lab** in `istio-system`: Prometheus, Grafana, Kiali, an in-repo **OpenTelemetry Collector**, and (by default) **Helm**-managed **Grafana Loki** + **Grafana Tempo**. Earlier iterations also applied Istio’s sample **Jaeger** addon and forwarded the **same** OTLP trace stream to **both** Jaeger and Tempo.

That duplication added RAM/CPU on laptops without giving ClawQL a distinct capability: **Jaeger** and **Tempo** both answer “store and query distributed traces.” The repo already standardizes on **Grafana** for dashboards and (optionally) **Loki** for logs; keeping **Tempo** as the **sole** trace backend aligns vendor-neutral OTLP ingress with a **single** query path in **Grafana Explore**.

### Redis-protocol brokers (`clawql-mcp` Helm chart)

**Paperless** and **Onyx** (full vector stack) use **Celery** with a **Redis-compatible** broker: today that is expressed as **`PAPERLESS_REDIS=redis://…`**, **`REDIS_HOST`**, and **`CELERY_BROKER_BACKEND=redis`** — the **`redis://`** URL scheme and Kombu backend name denote the **RESP** wire protocol and client stack, not a mandate to ship **Redis Open Source** as the in-cluster process.

Separately, **Redis Ltd** has moved **Redis OSS** under a **source-available** license ([Redis Open Source is now AGPLv3 + RSALv2](https://redis.io/legal/licenses/); see Redis Ltd announcements). For a project that **bundles** an in-chart container image, that shifts compliance and redistribution posture compared with permissively licensed alternatives.

**DragonflyDB** implements the **Redis wire protocol** for common Celery workloads, is **Apache 2.0** licensed, and is typically **more throughput-efficient** than Redis OSS for the same broker role—so it fits “default in-chart broker without Redis OSS, with clearer licensing and better headroom.”

### Compatibility and naming (brokers)

- **Naming:** Keeping **`redis://`**, **`PAPERLESS_REDIS`**, **`REDIS_HOST`**, and **`CELERY_BROKER_BACKEND=redis`** is **desirable and expected**—they describe the **RESP** client path and Celery/Kombu conventions, not “run Redis Ltd’s server binary.”
- **Compatibility bar for this repo:** Dragonfly must satisfy **full wire-protocol needs of the broker surfaces the chart actually wires** today (**Paperless** Celery, **Onyx** Celery / cache as configured in [`charts/clawql-mcp/templates`](../../charts/clawql-mcp/templates)). That is standard list/stream/set usage for queues—not Redis modules or exotic server features.
- **Not a goal:** renaming every substring `redis` in third-party env vars; **is** a goal: **no Redis OSS container** in chart defaults, **Apache-2.0** broker, **performance** headroom for local/full-stack installs.

## Decision

### 1) Traces: Tempo only (remove Jaeger from the Istio Docker Desktop install path)

- Do **not** apply Istio’s sample **`jaeger.yaml`** in [`scripts/kubernetes/install-istio-docker-desktop.sh`](../../scripts/kubernetes/install-istio-docker-desktop.sh).
- When heavy observability addons are enabled, **Helm-install Grafana Tempo** and configure the **ClawQL OTel Collector** to export traces to **Tempo only** ([`docker/istio/docker-desktop/otel-collector.yaml`](../../docker/istio/docker-desktop/otel-collector.yaml)).
- **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=0`** skips **Helm Loki** only; **Tempo** + the collector remain (see install script header comments).
- Primary trace UX for the lab: **Grafana → Explore → Tempo** (after adding the data source).

### 2) Brokers: DragonflyDB only in `clawql-mcp` (no Redis OSS image in chart defaults)

- Chart values use **`stores.dragonfly`** and **`onyx.dragonfly`** (not `stores.redis` / `onyx.redis`); Kubernetes Services/Deployments use **`*-dragonfly`** / **`*-onyx-dragonfly`** naming.
- Default container image: **`docker.dragonflydb.io/dragonflydb/dragonfly`** (pinned tag in [`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml)).
- **Paperless** / **Onyx** env vars that say **`redis://`** or **`CELERY_BROKER_BACKEND=redis`** stay as-is (**RESP** / Kombu naming); Dragonfly is the process behind those endpoints.
- This ADR does **not** change **ADR 0002**’s backlog item **[#183](https://github.com/danielsmithdevelopment/ClawQL/issues/183) “Redis source”** — that issue is about a **GraphQL Mesh / data source** integration, not the Helm broker Deployment.

## Consequences

### Positive

- **Traces:** one backend, less duplication, clearer story with **Grafana + Loki + Tempo**.
- **Brokers:** **Apache 2.0** default for bundled infra; avoids shipping **Redis OSS** as the in-chart broker; **Dragonfly** targets **full RESP compatibility** for the chart’s **Paperless / Onyx** Celery paths, with **better performance** than Redis OSS in typical broker workloads.
- **Operations:** fewer moving parts to explain in [`docs/deployment/docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md) and [`charts/clawql-mcp/README.md`](../../charts/clawql-mcp/README.md).

### Trade-offs

- **Traces:** no standalone Jaeger UI from the sample addon; users rely on **Grafana** (or raw Tempo HTTP APIs) for trace inspection in the lab path.
- **Brokers:** Dragonfly does **not** implement every Redis module or niche command; if a future **Paperless** / **Onyx** release depended on unsupported semantics, the chart would need a **compat spike** or an **external** broker—outside today’s **standard Celery broker** contract.
- **Upgrades:** Helm **Breaking** rename when moving from `*-redis` / `onyx-cache` to **`*-dragonfly`** / **`*-onyx-dragonfly`** workloads (see [`CHANGELOG.md`](../../CHANGELOG.md)).

## Alternatives considered

| Area    | Alternative                                 | Why not chosen                                                                                                                                                                                                         |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traces  | Keep Jaeger **or** dual-export Jaeger+Tempo | Duplicate storage and UI overlap; Grafana-centric lab favors one trace store.                                                                                                                                          |
| Traces  | Jaeger only                                 | Weaker native pairing with Grafana + Loki in the same lab story.                                                                                                                                                       |
| Brokers | **Redis OSS** container in chart            | **Bundled** Redis OSS sits under **AGPLv3 + RSALv2** ([licenses](https://redis.io/legal/licenses/)); **Dragonfly** is **Apache 2.0** and matches broker **RESP** needs here with **stronger throughput** for defaults. |
| Brokers | Strip `redis` from env var names            | Unnecessary—names reflect the **wire protocol**; upstream images own those strings.                                                                                                                                    |
