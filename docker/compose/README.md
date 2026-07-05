# Docker Compose vertical stacks ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251))

Opinionated **local / POC** stacks for IDP verticals. These complement — but do not replace — **`make local-k8s-up`** (full Helm + Istio) or **`charts/clawql-idp`**.

**Disclaimer:** All vertical stacks use **synthetic or demo data** only. They are **not** legal, medical, tax, or underwriting advice. Train and promote tenant-specific models before production.

## Conflict with Kubernetes

Do **not** run Compose on the same host ports as **`make local-k8s-up`** (MCP **8080**, Docling **5001**, etc.). Stop one runtime before starting the other:

```bash
docker compose -f docker/compose/lending.compose.yml down
# or: make local-k8s-mcp-delete
```

## Stacks

| File                                                               | Vertical                                                                                            | Services                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`lending.compose.yml`](lending.compose.yml)                       | **Lending / mortgage W-2**                                                                          | ClawQL MCP, Docling, reference classifier, LangExtract (demo), Label Studio CE |
| [`docling-classifier.compose.yml`](docling-classifier.compose.yml) | **Docling + classifier only** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)) | Docling, classifier, LangExtract — no MCP                                      |

**Planned:** healthcare, legal, education Compose files (same issue [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).

## Lending quick start

```bash
cp docker/compose/lending.env.example docker/compose/lending.env
docker compose -f docker/compose/lending.compose.yml --env-file docker/compose/lending.env up -d --build
```

| Endpoint                     | URL                                               |
| ---------------------------- | ------------------------------------------------- |
| ClawQL MCP (Streamable HTTP) | `http://localhost:8080/mcp`                       |
| Health                       | `http://localhost:8080/healthz`                   |
| HITL webhook                 | `http://localhost:8080/hitl/label-studio/webhook` |
| Label Studio UI              | `http://localhost:8095`                           |
| Docling (debug)              | `http://localhost:5001/health`                    |
| LangExtract (debug)          | `http://localhost:8090/health`                    |

### Bootstrap Label Studio (first run)

1. Open **`http://localhost:8095`** and sign in with **`LABEL_STUDIO_USERNAME`** / **`LABEL_STUDIO_PASSWORD`** from `lending.env`.
2. Create a project → paste [`deployment/samples/lending-w2/label-studio-config.xml`](../../deployment/samples/lending-w2/label-studio-config.xml) as the labeling setup.
3. **Account & Settings → Access Token** → copy token into **`CLAWQL_LABEL_STUDIO_API_TOKEN`** in `lending.env`, then:

   ```bash
   docker compose -f docker/compose/lending.compose.yml --env-file docker/compose/lending.env up -d clawql-mcp
   ```

4. **Project → Settings → Webhooks** → add:
   - URL (from Label Studio container): `http://clawql-mcp:8080/hitl/label-studio/webhook`
   - Header: `Authorization: Bearer <CLAWQL_HITL_WEBHOOK_TOKEN>`

### Demo W-2 flow (agent / MCP)

1. Parse fixture: `execute` **`docling::docling_convert_file`** with [`fixtures/synthetic-w2.txt`](../../deployment/samples/lending-w2/fixtures/synthetic-w2.txt).
2. Classify: MCP **`classify_document`** — low confidence → **`hitl_enqueue_label_studio`**.
3. Review in Label Studio → webhook persists to vault via **`memory_ingest`**.

Full k8s + Argo suspend/resume path: [`deployment/samples/lending-w2/README.md`](../../deployment/samples/lending-w2/README.md).

### Real estate demo (reuse lending stack)

Same Compose services support title commitment and PSA fixtures:

1. Parse: [`fixtures/synthetic-title-commitment.txt`](../../deployment/samples/real-estate-title/fixtures/synthetic-title-commitment.txt) or [`synthetic-psa.txt`](../../deployment/samples/real-estate-psa/fixtures/synthetic-psa.txt).
2. Classify: MCP **`classify_document`** — labels include `title_commitment`, `purchase_agreement`, `buyer_offer`.
3. Extract: **`extract_document`** with `schema_preset: "title_commitment"`, `"purchase_agreement"`, or `"buyer_offer"`.
4. HITL + Argo: see [`deployment/samples/real-estate/README.md`](../../deployment/samples/real-estate/README.md).

## Validate Compose (CI / local)

```bash
make compose-lending-config-test
```

## Resource hints

| Stack                   | Rough minimum                                         |
| ----------------------- | ----------------------------------------------------- |
| Lending                 | **8 GB RAM**, **4 CPU** (Docling cold start is heavy) |
| docling-classifier only | **4 GB RAM**                                          |

## Related

- [`../README.md`](../README.md) — base MCP image + `docker/docker-compose.yml`
- [`docs/deployment/clawql-idp-helm.md`](../../docs/deployment/clawql-idp-helm.md) — umbrella Helm chart
- [`docs/roadmap/gap-closure-plan-prioritized-2026.md`](../../docs/roadmap/gap-closure-plan-prioritized-2026.md) — P4 vertical stacks
