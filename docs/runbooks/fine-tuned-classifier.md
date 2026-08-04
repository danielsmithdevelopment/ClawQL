# Fine-tuned document classifier (runbook)

**Tracking:** [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248) (classification maturity).  
**Pairs with:** bundled **`docling`** provider ([docling-onboarding.md](../providers/docling-onboarding.md)), optional **LangExtract** ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)), **HITL** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

This runbook describes how operators train, evaluate, and promote a **tenant-specific document classifier** that routes IDP pipelines (lending W-2, invoices, etc.) without baking model weights into ClawQL.

---

## 1. Goals

| Outcome                          | How ClawQL uses it                                   |
| -------------------------------- | ---------------------------------------------------- |
| Document type label + confidence | Agent or Argo step decides auto-process vs HITL      |
| Versioned model artifact         | Env pin (`CLASSIFIER_MODEL_URI` / sidecar image tag) |
| Eval gates before promote        | Block production traffic until metrics pass          |

ClawQL does **not** ship trained weights — only **provider wiring**, **samples**, and **orchestration** hooks (`workflow` suspend/resume, `hitl_enqueue_label_studio`).

---

## 2. Data preparation

1. **Collect** representative documents per class (W-2, 1099, pay stub, bank statement, …). Use **synthetic or redacted** fixtures in git; keep production PII in vault/object storage only.
2. **Parse** with **`docling::docling_convert_source`** or **`docling_convert_file`** — retain layout JSON + markdown for features.
3. **Label** ground truth in Label Studio (see [lending W-2 pack](../../deployment/samples/lending-w2/README.md) `label-studio-config.xml`).
4. **Export** LS annotations to JSONL with stable `doc_id`, `label`, and optional bounding boxes.

**Minimum viable set:** ≥ 50 docs per class for a baseline; ≥ 200 per class before production promote.

---

## 3. Train

Choose one path (BYO — not bundled in ClawQL):

| Approach                                          | When                              |
| ------------------------------------------------- | --------------------------------- |
| **sklearn / fastText** on Docling text + metadata | Fast baseline, CPU-friendly       |
| **LayoutLM / Donut fine-tune**                    | Form-heavy scans (W-2 boxes)      |
| **Hosted AutoML** (Vertex, SageMaker)             | Enterprise MLOps already in place |

**Feature contract (recommended):**

```json
{
  "doc_id": "w2-demo-001",
  "docling_md": "# Form W-2 …",
  "page_count": 1,
  "has_tables": true,
  "label": "w2"
}
```

Train script lives in **your** repo or MLOps project; export:

- `model.joblib` / ONNX / TorchScript
- `labels.json` — class index map
- `metrics.json` — precision/recall per class on holdout

---

## 4. Evaluate (gates)

Before promote, require **all** on a frozen holdout set:

| Metric                           | Suggested gate |
| -------------------------------- | -------------- |
| Macro F1                         | ≥ 0.92         |
| W-2 recall (lending)             | ≥ 0.98         |
| False positive rate on “unknown” | ≤ 2%           |

Log evals to Langfuse or your tracker ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)). **Do not** auto-promote from a single happy-path demo.

---

## 5. Deploy inference

### Sidecar (Kubernetes)

Run classifier HTTP service beside Docling:

```yaml
# Illustrative — adjust image/registry
containers:
  - name: classifier
    image: your-registry/idp-classifier:v1.2.0
    env:
      - name: MODEL_PATH
        value: /models/current
    ports:
      - containerPort: 8080
```

Argo / agent calls `POST /classify` with Docling JSON; response:

```json
{ "label": "w2", "confidence": 0.94, "model_version": "v1.2.0" }
```

### Env pin (agent workstation)

```bash
CLASSIFIER_BASE_URL=http://classifier.idp.svc:8080
CLASSIFIER_MIN_CONFIDENCE=0.85
CLAWQL_ENABLE_IDP_CLASSIFIER=1
```

Agents call MCP **`classify_document`** (posts to **`CLASSIFIER_BASE_URL/classify`**) or **`search`** your custom OpenAPI for `classify` via **`CLAWQL_SPEC_PATHS`**.

Reference heuristic server: [`deployment/samples/classifier-http/`](../../deployment/samples/classifier-http/README.md). Compose with Docling: [`docker/compose/docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml).

---

## 6. Wire confidence → HITL

When `confidence < CLASSIFIER_MIN_CONFIDENCE`:

1. **`workflow` `get`** — workflow at **`suspend`** step (see [workflow-tool.md](../mcp/workflow-tool.md)).
2. **`hitl_enqueue_label_studio`** with **`workflow_ref`**, **`confidence`**, and parsed fields in **`tasks[].data`**.
3. Enable **`CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1`** so annotation webhook auto-**`resume`** ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).

High-confidence path: skip HITL, continue to Paperless/Onyx **`execute`** steps.

---

## 7. Promote / rollback

Use the sample gate script after holdout eval:

```bash
./deployment/samples/classifier-http/promote.sh \
  --metrics deployment/samples/classifier-http/fixtures/metrics.example.json \
  --tag v1.2.0 \
  --helm-print
```

Gates (override with env): macro F1 ≥ `CLASSIFIER_PROMOTE_MACRO_F1` (0.92), W-2 recall ≥ `CLASSIFIER_PROMOTE_W2_RECALL` (0.98), unknown FPR ≤ `CLASSIFIER_PROMOTE_UNKNOWN_FPR` (0.02).

| Action       | Steps                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Promote**  | Pass `promote.sh` → pin Helm `documentPipeline.classifier.image.tag` + `env.modelVersion` (optional model PVC) → smoke W-2 |
| **Rollback** | Revert image tag / `MODEL_VERSION` / PVC; re-run eval suite                                                                |
| **Audit**    | `memory_ingest` title=`Classifier promote <tag>` with metrics.json snapshot                                                |

Helm pin example:

```bash
helm upgrade --install clawql charts/clawql-mcp \
  --set enableIdpClassifier=true \
  --set documentPipeline.classifier.enabled=true \
  --set documentPipeline.classifier.image.tag=v1.2.0 \
  --set documentPipeline.classifier.env.modelVersion=v1.2.0 \
  --set documentPipeline.classifier.env.minConfidence=0.85
```

Optional BYO weights: set `documentPipeline.classifier.model.existingClaim` + `env.modelPath` / `MODEL_PATH`.

---

## 8. Cross-links

- **Extraction after classify:** LangExtract ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)) — MCP **`extract_document`** + [`langextract-onboarding.md`](../providers/langextract-onboarding.md).
- **End-to-end lending demo:** [deployment/samples/lending-w2](../../deployment/samples/lending-w2/README.md).
- **Matrix row:** [IDP master requirements — Classification](../roadmap/idp-master-requirements-matrix.md).
