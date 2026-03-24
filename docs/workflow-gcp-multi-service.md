# GCP multi-service workflow (ClawQL)

This guide outlines a **logical order** of Google Cloud API calls to stand up **GKE**, **IAM**, **firewall**, **logging**, **monitoring**, **load balancing**, **DNS**, **Cloud Storage**, and **BigQuery**. It maps to **`operationId`** values from the bundled Discovery docs under [`providers/google/apis/`](../providers/google/apis/README.md).

> **Multi-service in one MCP process**  
> Set **`CLAWQL_GOOGLE_TOP50_SPECS=1`** to merge the curated list in [`providers/google/google-top50-apis.json`](../providers/google/google-top50-apis.json) (each `providers/google/apis/<slug>/discovery.json`) into **one** operation list — **no** extra servers.  
> Or set **`CLAWQL_SPEC_PATHS`** to a comma/semicolon/newline-separated list of spec paths (any mix of local OpenAPI or Discovery JSON).  
> **Priority:** if either multi env is set, it **replaces** single-spec `CLAWQL_SPEC_PATH` / `CLAWQL_DISCOVERY_URL` and `CLAWQL_PROVIDER` for loading.  
> **Execution:** merged mode uses **REST** for `execute` (correct Discovery doc per operation). The optional GraphQL proxy, if started, builds its schema from the **first** API only — use MCP `search` + `execute` for cross-API GCP flows.

**Try it offline (real MCP stdio):** `npm run workflow:gcp-multi` spawns the MCP server (`dist/server.js`), issues **`tools/call` → `search`** for each workflow query (same wire path as Cursor/Claude), and writes [`docs/workflow-gcp-multi-latest.json`](../workflow-gcp-multi-latest.json) including the full **`CallToolResult`** envelope + parsed JSON body.  
For a faster in-process ranking check only (no MCP), use `npm run workflow:gcp-multi:direct` → `docs/workflow-gcp-multi-direct-latest.json`.

**Write-up:** queries, services, size/token comparison, and illustrative MCP request/response shapes — [`experiment-gcp-multi-mcp-workflow.md`](experiment-gcp-multi-mcp-workflow.md). Refresh stats: `npm run report:gcp-multi-experiment`.

Replace placeholders:

| Placeholder | Meaning |
|-------------|---------|
| `PROJECT_ID` | GCP project ID |
| `REGION` | e.g. `us-central1` |
| `ZONE` | e.g. `us-central1-a` |
| `CLUSTER_ID` | GKE cluster name |

---

## 0. Enable APIs (Service Usage)

**Spec:** `providers/google/apis/serviceusage-v1/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 0a | `serviceusage.services.batchEnable` | Enable many APIs in one call |
| 0b | `serviceusage.services.enable` | Enable a single service |

**Typical `batchEnable` parent:** `projects/PROJECT_ID`  
**Body:** list of service names, e.g. `container.googleapis.com`, `compute.googleapis.com`, `dns.googleapis.com`, `logging.googleapis.com`, `monitoring.googleapis.com`, `storage.googleapis.com`, `bigquery.googleapis.com`, `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`.

Use `search` then `execute` with the JSON body the Discovery doc describes (`BatchEnableServicesRequest`).

---

## 1. Project IAM (bindings)

**Spec:** `providers/google/apis/cloudresourcemanager-v3/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 1a | `cloudresourcemanager.projects.getIamPolicy` | Read current policy |
| 1b | `cloudresourcemanager.projects.setIamPolicy` | Add/remove members & roles |

**Resource:** `projects/PROJECT_ID` (path parameter `resource` per Discovery).

**Body (`SetIamPolicyRequest`):** full `Policy` with `bindings[]` (`role` + `members[]`). Use **get → merge → set** to avoid wiping bindings.

> **Fine-grained IAM v2** (deny policies, org policies) uses **`iam-v2`** (`iam.policies.*`). Most “who can do what on this project?” flows use **Resource Manager** `setIamPolicy` above.

---

## 2. Networking & firewall (VPC + rules)

**Spec:** `providers/google/apis/compute-v1/discovery.json`

GKE can start on the **default VPC**; production often uses a custom VPC and subnets first.

| # | operationId | Purpose |
|---|-------------|---------|
| 2a | `compute.networks.insert` | Create VPC (optional if using default) |
| 2b | `compute.subnetworks.insert` | Subnet in `REGION` (optional) |
| 2c | `compute.firewalls.insert` | Allow/deny rules (e.g. SSH, internal, health checks) |

**`compute.firewalls.insert`:**  
- Path params: `project`, usually `name` (firewall name).  
- **Body:** `Firewall` — `network`, `allowed`/`denied`, `sourceRanges` or `sourceTags`, `targetTags`, etc.

---

## 3. GKE cluster

**Spec:** `providers/google/apis/container-v1/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 3a | `container.projects.locations.clusters.create` | Create cluster |
| 3b | `container.projects.locations.operations.get` | Poll long-running `Operation` |

**`create` path parameter:**  
- `parent` = `projects/PROJECT_ID/locations/REGION` (regional cluster) **or** use **zonal** APIs with `container.projects.zones.clusters.create` if you use a zone.

**Body:** `CreateClusterRequest` with `cluster` (`name`, `initialNodeCount`, `nodeConfig`, `network`, `subnetwork`, `ipAllocationPolicy`, **workload identity** config, etc.).

After `create`, poll **`operations.get`** with the operation `name` until `done: true`.

---

## 4. Logging

**Spec:** `providers/google/apis/logging-v2/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 4a | `logging.projects.sinks.create` | Export logs to BigQuery, Pub/Sub, or storage bucket |

**Parent-style params:** `projects/PROJECT_ID` as sink parent (see Discovery for exact `projectsId` / body `LogSink`).

**Body:** `LogSink` — `name`, `destination` (e.g. `storage.googleapis.com/BUCKET` or `bigquery.googleapis.com/projects/.../datasets/...`), `filter`.

---

## 5. Monitoring

**Spec:** `providers/google/apis/monitoring-v3/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 5a | `monitoring.projects.notificationChannels.create` | Email, Slack, PagerDuty, etc. |
| 5b | `monitoring.projects.alertPolicies.create` | Conditions + notification channels |

**Name prefix:** `projects/PROJECT_ID`  
**Bodies:** `NotificationChannel`, `AlertPolicy` (see Discovery `$ref` schemas).

**Metrics / charts:** `monitoring.projects.timeSeries.list`, `monitoring.projects.timeSeries.query` (see Discovery for `filter`, `interval`, etc.).

---

## 6. Load balancing (HTTP(S) — simplified global path)

**Spec:** `providers/google/apis/compute-v1/discovery.json`

External HTTP(S) load balancing uses **global** resources and a **chain** of objects. Typical **creation order**:

| # | operationId | Purpose |
|---|-------------|---------|
| 6a | `compute.healthChecks.insert` | Health check for backends |
| 6b | `compute.backendServices.insert` | Backend service (attach health check, backends) |
| 6c | `compute.urlMaps.insert` | URL routing to backend service |
| 6d | `compute.targetHttpProxies.insert` or `compute.targetHttpsProxies.insert` | HTTP(S) proxy |
| 6e | `compute.globalForwardingRules.insert` | Front IP / forwarding rule |

**Zonal/internal** LBs use regional forwarding rules and different resource mixes — adjust using the same Compute API.

---

## 7. Cloud DNS

**Spec:** `providers/google/apis/dns-v1/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 7a | `dns.managedZones.create` | Hosted zone for a domain |
| 7b | `dns.resourceRecordSets.create` | Add A/AAAA/CNAME records |

**Project scope:** `project` query param = `PROJECT_ID` (see Discovery).  
**Bodies:** `ManagedZone`; for RRs use `ResourceRecordSet` per `resourceRecordSets.create` (managed zone name + record name/type/rrdatas).

---

## 8. Cloud Storage

**Spec:** `providers/google/apis/storage-v1/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 8a | `storage.buckets.insert` | Create bucket |
| 8b | `storage.buckets.setIamPolicy` | Bucket-level IAM |
| 8c | `storage.objects.insert` | Upload object (multipart / resumable per client) |

**`buckets.insert`:** query `project` and body `Bucket` with `name`, `location`, `uniformBucketLevelAccess`, etc.

---

## 9. BigQuery

**Spec:** `providers/google/apis/bigquery-v2/discovery.json`

| # | operationId | Purpose |
|---|-------------|---------|
| 9a | `bigquery.datasets.insert` | Dataset in project |
| 9b | `bigquery.tables.insert` | Table schema |
| 9c | `bigquery.jobs.insert` | Load job from GCS or query job |

**Path/query:** `projectId` = `PROJECT_ID`; dataset/table IDs in body or path per method.

**`datasets.insert` body:** `DatasetReference` + location.

---

## Using ClawQL `search` / `execute`

1. Point at the right spec, e.g.  
   `export CLAWQL_SPEC_PATH=/path/to/ClawQL/providers/google/apis/container-v1/discovery.json`
2. **`search("create GKE cluster")`** → should surface `container.projects.locations.clusters.create`.
3. **`execute(operationId, { parent: "projects/PROJECT_ID/locations/REGION", ... })`** with the **request body** fields required by `CreateClusterRequest` (often nested under a key like `cluster` — match the Discovery schema).

Repeat with `compute-v1`, `logging-v2`, etc., after switching `CLAWQL_SPEC_PATH`.

---

## Suggested overall order (dependencies)

1. **Service Usage** — enable APIs  
2. **Resource Manager** — project IAM as needed  
3. **Compute** — VPC/subnets/firewalls (if not using defaults)  
4. **Container** — GKE cluster (+ poll operation)  
5. **Logging** — sinks (destinations must exist or be creatable)  
6. **Monitoring** — channels + alert policies  
7. **Compute** — load balancer chain (if exposing services)  
8. **DNS** — zones + records (often after you know LB IPs)  
9. **Storage** — buckets + IAM  
10. **BigQuery** — datasets/tables/jobs (often linked from Logging sinks)

---

## Related docs

- [Google APIs lookup (full index + top 50 bundle)](google-apis-lookup.md)
- [Bundled `providers/google/apis/` README](../providers/google/apis/README.md)

This document is a **route map** for API ordering and **operationId** discovery — not a substitute for security review, quotas, org policies, or production Terraform/IaC.
