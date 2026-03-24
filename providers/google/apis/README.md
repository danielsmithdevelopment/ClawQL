# Curated Google APIs (top 50)

This folder contains **pinned Discovery JSON** for 50 common Google Cloud services, plus **`introspection.json`** / **`schema.graphql`** when `npm run pregenerate-google-top50-graphql` succeeds.

| Slug | API |
|------|-----|
| `iam-v2` | Identity and Access Management (IAM) |
| `compute-v1` | Compute Engine |
| `storage-v1` | Cloud Storage |
| `container-v1` | Kubernetes Engine (GKE) — copied from `../discovery.json` when present |
| `run-v2` | Cloud Run |
| `pubsub-v1` | Cloud Pub/Sub |
| `bigquery-v2` | BigQuery |
| `cloudresourcemanager-v3` | Resource Manager |
| `logging-v2` | Cloud Logging |
| `monitoring-v3` | Cloud Monitoring |
| `secretmanager-v1` | Secret Manager |
| `cloudfunctions-v2` | Cloud Functions |
| `cloudbuild-v2` | Cloud Build |
| `cloudkms-v1` | Cloud KMS |
| `sqladmin-v1` | Cloud SQL Admin |
| `gkehub-v2` | GKE Hub |
| `artifactregistry-v1` | Artifact Registry |
| `serviceusage-v1` | Service Usage |
| `dns-v1` | Cloud DNS |
| `servicenetworking-v1` | Service Networking |

**Full catalog** (all public Google APIs, not pre-downloaded): [`../google-apis-lookup.json`](../google-apis-lookup.json).

**Refresh this bundle:**

```bash
npm run fetch-google-top50
npm run build && npm run pregenerate-google-top50-graphql
# or
npm run refresh-google-top50
```

Use a specific API offline with ClawQL:

```bash
export CLAWQL_SPEC_PATH="$PWD/providers/google/apis/run-v2/discovery.json"
# Discovery is converted internally; same as CLAWQL_DISCOVERY_URL for that service.
```

Manifest: [`../google-top50-apis.json`](../google-top50-apis.json).
