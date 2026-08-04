# Docker Compose vertical stacks ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251))

Opinionated **local / POC** stacks for IDP verticals. These complement — but do not replace — **`make local-k8s-up`** (full Helm + Istio) or **`charts/clawql-idp`**.

**Disclaimer:** All vertical stacks use **synthetic or demo data** only. They are **not** legal, medical, tax, education, or underwriting advice. Train and promote tenant-specific models before production.

## Conflict with Kubernetes

Do **not** run Compose on the same host ports as **`make local-k8s-up`** (MCP **8080**, Docling **5001**, etc.). Stop one runtime before starting the other:

```bash
docker compose -f docker/compose/lending.compose.yml down
# or: make local-k8s-mcp-delete
```

Default ports are **offset per vertical** so you can run more than one stack locally (lending **8080**, healthcare **8180**, legal **8280**, education **8380**).

## Stacks

| File                                                               | Vertical                                                                                                                                                                          | Default MCP port | Sample pack                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| [`lending.compose.yml`](lending.compose.yml)                       | **Lending / mortgage W-2**                                                                                                                                                        | 8080             | [`lending-w2`](../../deployment/samples/lending-w2/)                     |
| [`healthcare.compose.yml`](healthcare.compose.yml)                 | **Healthcare / clinical referral**                                                                                                                                                | 8180             | [`healthcare-referral`](../../deployment/samples/healthcare-referral/)   |
| [`legal.compose.yml`](legal.compose.yml)                           | **Legal / contract review**                                                                                                                                                       | 8280             | [`legal-contract`](../../deployment/samples/legal-contract/)             |
| [`education.compose.yml`](education.compose.yml)                   | **Education / transcript verification**                                                                                                                                           | 8380             | [`education-transcript`](../../deployment/samples/education-transcript/) |
| [`docling-classifier.compose.yml`](docling-classifier.compose.yml) | **Docling + classifier + LangExtract** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248), [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)) | —                | —                                                                        |

Each vertical stack runs: ClawQL MCP (incl. **`inspect_pdf`** / **`convert_document`**), Docling, reference classifier, LangExtract (demo), Label Studio CE.

### Providers / flags (all four verticals)

| Enabled                             | Purpose                         |
| ----------------------------------- | ------------------------------- |
| Documents tier (default)            | IDP vendor merge + ingest tools |
| `CLAWQL_ENABLE_ANYDOC=1`            | Fast Office/PDF/CSV → GFM       |
| `CLAWQL_ENABLE_PDF_INSPECTOR=1`     | PDF classify + Markdown route   |
| `CLAWQL_ENABLE_IDP_CLASSIFIER=1`    | `classify_document`             |
| `CLAWQL_ENABLE_LANGEXTRACT=1`       | `extract_document`              |
| `CLAWQL_ENABLE_IDP_PIPELINE=1`      | `run_idp_pipeline`              |
| `CLAWQL_ENABLE_HITL_LABEL_STUDIO=1` | HITL enqueue + webhook          |

## Quick starts

```bash
# Lending
cp docker/compose/lending.env.example docker/compose/lending.env
docker compose -f docker/compose/lending.compose.yml --env-file docker/compose/lending.env up -d --build

# Healthcare
cp docker/compose/healthcare.env.example docker/compose/healthcare.env
docker compose -f docker/compose/healthcare.compose.yml --env-file docker/compose/healthcare.env up -d --build

# Legal
cp docker/compose/legal.env.example docker/compose/legal.env
docker compose -f docker/compose/legal.compose.yml --env-file docker/compose/legal.env up -d --build

# Education
cp docker/compose/education.env.example docker/compose/education.env
docker compose -f docker/compose/education.compose.yml --env-file docker/compose/education.env up -d --build
```

### Per-vertical endpoints (defaults)

| Vertical   | MCP                         | Label Studio            | Docling                 | LangExtract             |
| ---------- | --------------------------- | ----------------------- | ----------------------- | ----------------------- |
| Lending    | `http://localhost:8080/mcp` | `http://localhost:8095` | `http://localhost:5001` | `http://localhost:8090` |
| Healthcare | `http://localhost:8180/mcp` | `http://localhost:8195` | `http://localhost:5101` | `http://localhost:8190` |
| Legal      | `http://localhost:8280/mcp` | `http://localhost:8295` | `http://localhost:5201` | `http://localhost:8290` |
| Education  | `http://localhost:8380/mcp` | `http://localhost:8395` | `http://localhost:5301` | `http://localhost:8390` |

HITL webhook path on each MCP host: **`/hitl/label-studio/webhook`**.

### Data categories

| Vertical   | Synthetic fixtures cover         | Compliance note                                    |
| ---------- | -------------------------------- | -------------------------------------------------- |
| Lending    | W-2 / wage statements            | Not underwriting or tax advice                     |
| Healthcare | Clinical referral letters        | Not medical advice; no real PHI                    |
| Legal      | NDA / contract excerpts          | Not legal advice; privilege flags are demo UX only |
| Education  | Transcript / enrollment excerpts | Not FERPA certification; synthetic student records |

### Bootstrap Label Studio (any vertical)

1. Open the Label Studio UI for that stack and sign in with `LABEL_STUDIO_USERNAME` / `LABEL_STUDIO_PASSWORD`.
2. Create a project → paste the vertical’s `label-studio-config.xml` as the labeling setup.
3. **Account & Settings → Access Token** → copy into **`CLAWQL_LABEL_STUDIO_API_TOKEN`** in the vertical `.env`, then recreate the MCP service.
4. Add webhook URL `http://clawql-mcp:8080/hitl/label-studio/webhook` with Bearer `CLAWQL_HITL_WEBHOOK_TOKEN`.
5. Optional pre-annotations: import / call MCP with [`sample-tasks.json`](../../deployment/samples/lending-w2/sample-tasks.json) (or the vertical’s pack) — see [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247).

### Demo flow (agent / MCP)

1. Parse fixture via Docling or **`convert_document`** / **`inspect_pdf`**.
2. Classify: MCP **`classify_document`** — low confidence → **`hitl_enqueue_label_studio`** (optionally with **`predictions`**).
3. Review in Label Studio → webhook persists to vault via **`memory_ingest`**.

### Real estate demo (reuse lending stack)

Same Compose services support title commitment and PSA fixtures — see [`deployment/samples/real-estate/README.md`](../../deployment/samples/real-estate/README.md).

## Validate Compose (CI / local)

```bash
make compose-vertical-config-test
# or: make compose-lending-config-test
```

## Resource hints

| Stack                   | Rough minimum                                         |
| ----------------------- | ----------------------------------------------------- |
| Any full vertical       | **8 GB RAM**, **4 CPU** (Docling cold start is heavy) |
| docling-classifier only | **4 GB RAM**                                          |

Do not run four full vertical stacks at once on a laptop without raising RAM — Docling images are large.

## Related

- [`../README.md`](../README.md) — base MCP image + `docker/docker-compose.yml`
- [`docs/deployment/clawql-idp-helm.md`](../../docs/deployment/clawql-idp-helm.md) — umbrella Helm chart
- [`docs/mcp/hitl-label-studio.md`](../../docs/mcp/hitl-label-studio.md) — HITL + pre-annotations (#247)
- [`docs/roadmap/gap-closure-plan-prioritized-2026.md`](../../docs/roadmap/gap-closure-plan-prioritized-2026.md) — P4 vertical stacks
