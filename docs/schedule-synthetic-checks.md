# Synthetic checks as part of `schedule()`

This document describes **scheduled HTTP/API synthetic checks** as a **first-class subset** of the optional **`schedule`** MCP tool. It is the project’s intended pattern for **time-based probes** with **assertions** and **alerts**—**without** embedding any external observability vendor in ClawQL.

**Tracking:** [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76) (`schedule`), [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77) (`notify`) for failure notifications, [#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79) (optional-tool env matrix).

---

## Relationship to `schedule()`

A **job** is: **when** it runs + **what** it does. Synthetic checks are a **restricted `kind` of action**—not a separate product surface.

- **Frequency** (when): cron (UTC), fixed interval, or one-shot time — same as any other scheduled job.
- **Action** (what): for synthetics, `action.kind === "synthetic"` and a **`synthetic_test`** object defines the probe and pass/fail rules.

Other action kinds (e.g. isolated code via **`sandbox_exec`**, or allowlisted tools such as **`notify`**) stay separate; they are documented with the main `schedule` design.

---

## Conceptual API shape

`schedule()` is modeled as **`operation`** + payload (exact JSON will match the implementation in [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76)).

### Create a synthetic job

Use **`operation: "create"`** with:

1. **`frequency`** — when to run (see below).
2. **`action`** — must include **`kind: "synthetic"`** and **`synthetic_test`** (see below).

Example (illustrative):

```json
{
  "operation": "create",
  "schedule": {
    "frequency": {
      "type": "interval",
      "seconds": 300
    }
  },
  "action": {
    "kind": "synthetic",
    "synthetic_test": {
      "name": "api-health",
      "request": {
        "method": "GET",
        "url": "https://api.example.com/health",
        "headers": {},
        "body": null
      },
      "limits": {
        "timeout_ms": 10000,
        "max_response_bytes": 1048576,
        "max_redirects": 3
      },
      "assert": {
        "status_in": [200],
        "latency_ms_max": 2000,
        "body_contains": "\"ok\":true"
      }
    }
  }
}
```

Naming variants are fine as long as the **discriminated union** is clear: e.g. **`action.kind`** + **`synthetic_test`** vs a top-level **`job_type: "synthetic"`** — pick one in the implementation and keep it stable.

### Frequency

| `frequency.type` | Meaning |
| ---------------- | ------- |
| `cron` | Single cron expression, **UTC** (recommended for v1). |
| `interval` | Fixed period in seconds (min/max enforced by env). |
| `one_shot` | Run once at `run_at` (ISO 8601 UTC). |

Manual **`trigger`** (and optional **`dry_run`**) apply to synthetic jobs too, so you can re-run a check without waiting for the next tick.

---

## `synthetic_test` object (normative intent)

| Area | Purpose |
| ---- | ------- |
| **`name`** | Stable id for logs and UI; not a secret. |
| **`request`** | HTTP method, URL, optional headers/body. |
| **`limits`** | Timeouts, max body size, redirect cap. |
| **`assert`** | Pass/fail: status codes, max latency, optional body substring or structured checks (exact JSONPath/stack is TBD in implementation). |

**History:** implementations should persist **last N runs** (pass/fail, latency, truncated error) in the same SQLite store as other scheduled jobs—no dependency on external APM for core behavior.

---

## Safety (required for any URL-based probe)

If URLs are user-controlled or agent-supplied:

- Enforce **timeouts** and **response size** caps.
- Consider **SSRF** controls: **allowlisted URL prefixes** (env), blocking link-local and metadata addresses, limiting redirects.
- **Redact** secrets in stored logs and in **`notify`** payloads.

---

## Notifications

On **failure** (and optionally on **recovery** after a failure), wire to **`notify`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)) with structured messages—no vendor-specific event format required.

---

## What this is not

- **Not** a generic “run arbitrary HTTP from cron” without assertions: the **`synthetic_test`** schema is the contract.
- **Not** a replacement for browser automation in v1; heavy custom flows can use **`sandbox_exec`** under a separate **`schedule`** action kind, with different security review.

---

## Migration from other systems

If you are moving **off** hosted synthetic products, map each external check to **one** `synthetic_test` + **frequency** + optional **notify** routing. ClawQL does not integrate those products; it only provides the **local** schedule + probe + assert + alert pattern.
