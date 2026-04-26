# API Operations Recipes

## 1) Safe Update with Verification

### Use case

Update a production resource without blind writes.

### Steps

1. `search` for read/list operation.
2. `execute` read call to capture current state.
3. `search` for update/patch operation.
4. `execute` mutation with minimal args.
5. `execute` read call again for post-change validation.
6. `memory_ingest` summary with before/after notes.

### Why this pattern

- Reduces accidental misconfiguration.
- Produces an auditable change trail.

---

## 2) Create-Then-Validate Resource

### Use case

Provision a new object (project, issue, DNS record, workflow) and ensure it exists.

### Steps

1. `search` create operation.
2. `execute` create with minimal required payload.
3. Capture created identifier from response.
4. `search` get/list operation.
5. `execute` validation read using returned identifier.

---

## 3) Multi-Provider Orchestration (Discovery First)

### Use case

Run one flow across multiple providers (for example GCP + Cloudflare + Jira).

### Steps

1. Run all `search` queries first and map operationIds by provider.
2. Validate required args per operation.
3. Execute in dependency order.
4. Store temporary ids in `cache` during the run.
5. Persist final output in `memory_ingest`.

---

## 4) Parameter Debug Recipe

### Use case

`execute` fails due to argument mismatch.

### Steps

1. Re-run `search` with a more specific intent.
2. Compare returned parameter names against sent args.
3. Retry `execute` with corrected argument keys/types.
4. If still failing, run a simpler read/list operation for baseline.

---

## 5) Token-Efficient Response Recipe

### Use case

You need only a few response fields and want small context payloads.

### Steps

1. Use `execute` with `fields` set to top-level keys you need.
2. Avoid full payload pulls unless debugging.
3. Persist compact summaries via `memory_ingest`.
