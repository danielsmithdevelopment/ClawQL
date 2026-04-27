---
name: clawql-ouroboros-workflows
description: Run iterative specification-first workflows with ouroboros_* tools, lineage checks, and clear boundaries vs raw infra (kubectl/Helm).
---

# ClawQL ouroboros workflows

## When to apply

- Task requirements are **ambiguous** and need **iterative convergence** over a **Seed** (goal, acceptance criteria, ontology-shaped extraction).
- You want **traceable lineage** (`ouroboros_get_lineage_status`) across generations, not only a one-off answer.

## What the tools **do** and **do not** do

| Tool | Purpose |
|------|---------|
| `ouroboros_create_seed_from_document` | Turn **document text** (or pasted incident report) into a structured **Seed** (`goal`, `acceptance_criteria`, ontology fields, `metadata.seed_id`). |
| `ouroboros_run_evolutionary_loop` | Run **Wonder / Reflect / Execute / Evaluate** cycles on that Seed until `maxGenerations` or convergence. |
| `ouroboros_get_lineage_status` | Read **stored generations** for a `seed_id` (durable if Postgres-backed ouroboros DB is configured). |

**They do not:** call `kubectl`, `helm`, SSH, or the Kubernetes API. The default **Executor** only does meaningful *ClawQL-internal* work when the Seed includes **`brownfield_context.context_references`** entries shaped as **`clawql_execute`** or **`clawql_search`** objects (see `website/src/app/ouroboros/page.mdx` § *Route hints*). If `context_references` is only plain strings (e.g. a document id), execution stays a **stub** (`"No internal tool route selected"`).

So: **Ouroboros = spec / ontology / acceptance iteration + optional OpenAPI-routed execution.** **Infra triage = kubectl, logs, Helm values, cluster events** — run that in parallel or first when failures are scheduler- or container-exit-driven.

## Recommended workflow (skill order)

1. **`ouroboros_create_seed_from_document`** — Set `extractedText` to the **requirements doc**, **design notes**, or a **redacted** paste of `kubectl describe` / `logs` / events if you want a durable *seed* anchored to the incident (not a substitute for reading those logs yourself).
2. **If the task includes validating HTTP/OpenAPI behavior** — add **`context_references`** with **`clawql_search`** / **`clawql_execute`** hints (or extend the seed after step 1) so generations can drive real tool routes.
3. **`ouroboros_run_evolutionary_loop`** — Use a **small `maxGenerations`** first (e.g. 2–6); raise only if convergence is too weak.
4. **`ouroboros_get_lineage_status`** — Inspect `seed_id` for scores, execution blobs, and whether acceptance criteria passed per generation.
5. **Refine** constraints / acceptance criteria / hints and rerun when needed.
6. **`memory_ingest`** — Persist decisions, chart paths, and operator runbooks (no secrets). Link related vault titles via `wikilinks`.

## Hybrid with Kubernetes / Helm (common case)

When the user goal is **“fix the cluster”** (CrashLoop, `Pending`, `Insufficient memory`, chart bugs):

1. **Do not skip** steps 1–4 if the user attached this skill: still **create a seed** from the incident summary so **lineage exists** and acceptance criteria are explicit—even when the next step is mostly `kubectl`.
2. **Run infra investigation in parallel** (or immediately): `kubectl get pods`, `describe`, `logs`, Helm `values.yaml` / templates. The **first root cause** usually lives here.
3. **Use `ouroboros_run_evolutionary_loop`** to **converge on spec-level acceptance** (e.g. “helm template validates”, “documented health checks pass”) **only if** you can express checks via **execute hints** or human-verified criteria; do not expect the loop alone to discover a bad Helm `command:` block.
4. After code or chart changes, **persist** with **`memory_ingest`** (and optional `wikilinks` to related notes such as `[[Helm full Onyx stack Docker Desktop]]`).

## Guardrails

- Keep **acceptance criteria** concrete and testable.
- Separate **shipped behavior** from **roadmap assumptions**.
- **Never** put tokens, kubeconfig blobs, or `OPENSEARCH_ADMIN_PASSWORD`-style values into Seeds or `memory_ingest`.

## Further reading (repo)

- Route hints and sample `ouroboros_run_evolutionary_loop` JSON: `website/src/app/ouroboros/page.mdx`
- Skill overview: `docs/skills/ouroboros.md`
- ADR: `docs/adr/0001-ouroboros-workflow-engine.md`
