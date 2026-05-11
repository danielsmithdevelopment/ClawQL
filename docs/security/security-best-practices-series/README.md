# Agentic AI Security Curriculum (training modules)

Twenty **vendor-neutral training modules** for security architects, platform engineers, and teams shipping **LLM agents, tool calling, and MCP-style integrations**. Each file is standalone Markdown with YAML frontmatter for a static site, LMS, or internal wiki.

## Instructor guide

Workshop agendas, delivery modes, and **assessment quiz stubs** (one row per module) live in **[`INSTRUCTOR.md`](INSTRUCTOR.md)**.

## How to use this curriculum

- **Self-study:** Work through `01-` … `20-` in order, or jump to gaps (frontmatter includes `prev` / `next` slugs).
- **Instructor-led / paid consulting:** Each module includes learning objectives, time guidance, a suggested discussion or lab (where applicable), **Further reading** links to NIST / OWASP / CNCF / OpenSSF and similar sources, and a short **Commercial training use** note so you can adapt examples to the customer’s stack and compliance regime.
- **Examples:** Body text uses illustrative YAML, policies, and product names (Harbor, Kyverno, Istio, Kata, etc.). Treat them as **patterns**, not mandatory SKUs.

## Time and scope

| Metric | Value |
| --- | --- |
| Modules | 20 |
| Approx. reading time (sum of `estimated_minutes` in frontmatter) | ~10.5–11 hours |
| With linked standards + discussion / labs | Plan **2–4 days** for a compact workshop, or **multi-week** self-paced |

## Module index

| # | Slug | File |
| ---: | --- | --- |
| 1 | `supply-chain-pinning-mirror-registry` | [`01-supply-chain-pinning-mirror-registry.md`](01-supply-chain-pinning-mirror-registry.md) |
| 2 | `golden-images-distroless-pipelines` | [`02-golden-images-distroless-pipelines.md`](02-golden-images-distroless-pipelines.md) |
| 3 | `cluster-admission-control-signing-policy` | [`03-cluster-admission-control-signing-policy.md`](03-cluster-admission-control-signing-policy.md) |
| 4 | `least-privilege-scoped-identities` | [`04-least-privilege-scoped-identities.md`](04-least-privilege-scoped-identities.md) |
| 5 | `zero-trust-fundamentals` | [`05-zero-trust-fundamentals.md`](05-zero-trust-fundamentals.md) |
| 6 | `advanced-zero-trust-vault-hsm-provenance` | [`06-advanced-zero-trust-vault-hsm-provenance.md`](06-advanced-zero-trust-vault-hsm-provenance.md) |
| 7 | `rbac-mtls-istio-service-mesh` | [`07-rbac-mtls-istio-service-mesh.md`](07-rbac-mtls-istio-service-mesh.md) |
| 8 | `sandboxing-kata-gvisor-tradeoffs` | [`08-sandboxing-kata-gvisor-tradeoffs.md`](08-sandboxing-kata-gvisor-tradeoffs.md) |
| 9 | `mcp-runtime-protection-panguard-atr` | [`09-mcp-runtime-protection-panguard-atr.md`](09-mcp-runtime-protection-panguard-atr.md) |
| 10 | `data-classification-pii-redaction-logs` | [`10-data-classification-pii-redaction-logs.md`](10-data-classification-pii-redaction-logs.md) |
| 11 | `model-integrity-verifying-weights` | [`11-model-integrity-verifying-weights.md`](11-model-integrity-verifying-weights.md) |
| 12 | `runtime-monitoring-observability` | [`12-runtime-monitoring-observability.md`](12-runtime-monitoring-observability.md) |
| 13 | `automated-response-containment` | [`13-automated-response-containment.md`](13-automated-response-containment.md) |
| 14 | `incident-response-recovery-picerl` | [`14-incident-response-recovery-picerl.md`](14-incident-response-recovery-picerl.md) |
| 15 | `gpu-resource-protection` | [`15-gpu-resource-protection.md`](15-gpu-resource-protection.md) |
| 16 | `workstation-local-development-security` | [`16-workstation-local-development-security.md`](16-workstation-local-development-security.md) |
| 17 | `production-deployment-secure-full-stack` | [`17-production-deployment-secure-full-stack.md`](17-production-deployment-secure-full-stack.md) |
| 18 | `threat-modeling-stride-agentic-ai` | [`18-threat-modeling-stride-agentic-ai.md`](18-threat-modeling-stride-agentic-ai.md) |
| 19 | `owasp-agentic-top-10-mitigations` | [`19-owasp-agentic-top-10-mitigations.md`](19-owasp-agentic-top-10-mitigations.md) |
| 20 | `quarterly-security-review-checklist` | [`20-quarterly-security-review-checklist.md`](20-quarterly-security-review-checklist.md) |

## Frontmatter reference (CMS / site generators)

| Key | Purpose |
| --- | --- |
| `title` | Page / lesson title |
| `series` | Always `Agentic AI Security Curriculum` |
| `course_type` | `instructor-ready / self-study` |
| `audience` | Short learner description |
| `estimated_minutes` | Reading-time hint for scheduling |
| `level` | `foundational` (modules 1–5), `intermediate` (6–14), or `advanced` (15–20) — tune for your LMS |
| `tags` | YAML list of lowercase tokens (e.g. `kubernetes`, `sbom`, `owasp`) for faceted search / related content |
| `part` / `total_parts` | Position in curriculum |
| `date` | Publication or review stamp |
| `slug` | URL-safe identifier |
| `canonical_path` | Suggested site path (e.g. `/security/best-practices/<slug>`) |
| `description` | Short SEO / catalog blurb |
| `prev` / `next` | Optional neighbor slugs for pagination |

Adjust `canonical_path`, `level`, and `tags` to match your CMS taxonomy.

## Source monolith

The full narrative is still available as one file: [`../security-guide-series.md`](../security-guide-series.md).

## Maintenance scripts

| Script | Role |
| --- | --- |
| [`_training_transform.py`](_training_transform.py) | Original training framing (objectives, further reading blocks). **Not idempotent** if re-run without guards — do not duplicate sections. |
| [`_polish_headings_and_frontmatter.py`](_polish_headings_and_frontmatter.py) | Inserts `level` / `tags`, normalizes spacing before `###` headings and common glued prose patterns **outside** fenced code blocks. Strips prior `level`/`tags` before re-inserting so it can be re-run safely for formatting passes. |

Prefer hand-editing module prose; use scripts when doing bulk layout updates.
