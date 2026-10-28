---
title: "Cua Spaces as an optional isolation backend"
status: "October 2026 — accepted (spike + interface)"
version: "0.1"
adr: "0018"
package: "packages/clawql-sandbox/ (isolation-backend + cua/)"
---

# ADR 0018: Cua Spaces as an optional isolation backend

**October 2026 · Accepted · ClawQL C1–C4 + shared Ontologiql rules**

---

## 1. The Decision

ClawQL admits **Cua Spaces** (`@trycua/cua`, pinned) as an **optional** isolation backend behind the shared **`IsolationBackendService`** interface in `clawql-sandbox`. It is one backend among several (Agent Substrate today; Firecracker and Apple container tooling later). Cua is **never** a hard dependency.

**Why Cua (two reasons only):**

1. Run agent sessions inside **Linux Spaces on a Mac**, so the runner’s existing Linux enforcement works there.
2. Prototype **snapshot-based recovery** for unmodified agents (jointly with record-and-replay).

Nothing else. No density, durability-publish, or latency headlines from Cua runs — VM overhead adds noise; publish-grade results stay on the dedicated Linux host.

---

## 2. License gate (blocking)

Checked against [trycua/cua `LICENSE.md`](https://github.com/trycua/cua/blob/main/LICENSE.md), [`legal/COMMERCIAL.md`](https://github.com/trycua/cua/blob/main/legal/COMMERCIAL.md), and [`legal/LICENSING.md`](https://github.com/trycua/cua/blob/main/legal/LICENSING.md):

| Component                         | License       | ClawQL use                                                         |
| --------------------------------- | ------------- | ------------------------------------------------------------------ |
| SDK / Driver / Lume / `cua` CLI   | MIT           | OK                                                                 |
| Cua Spaces (apps, spacesd, …)     | FSL-1.1-MIT   | Self-host / in-house OK, including commercial internal use         |
| Offering Spaces as hosted service | Commercial    | **Out of scope** — would need `licensing@trycua.com`               |

**Verdict:** proceed for self-hosted isolation backend. Operator override `CLAWQL_CUA_LICENSE_BLOCK=1` fails closed. Do not productize a competing hosted Spaces offering without a Cua commercial licence.

---

## 3. Interface (shared with Ontologiql)

`IsolationBackendService` (`packages/clawql-sandbox/src/isolation-backend/`):

- `admit` → Space at tier (`container` \| `microvm` \| `full-vm`)
- `mountWorktree` → mount session worktree
- `exec` → run agent adapter / snippet inside
- `snapshot` / `restore` / `fork` → C2/C3/O4 spike
- `probeEscape` → C4 / O2 gateway and host-escape probes

**Honesty:** container-tier Spaces share one Linux VM kernel — do not claim kernel isolation between container-tier Spaces. Presence and approvals stay on the **host**, never inside the Space.

---

## 4. ClawQL scope (this repo)

| ID  | Deliverable                                                                 | Done when                                      |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| C1  | Optional Cua backend + conformance vs shared interface                      | Mock conformance green per tier                |
| C2  | Fork durability pilot trials (N=50) from one checkpoint                     | Arms share `parentSnapshotId`                  |
| C3  | Record-and-replay by sequence + digest; mismatch → `outcome_unknown`         | Crash mid-tool: no repeated write; divergent caught |
| C4  | Gateway no-bypass (direct IP, DNS, IPv6, hardcoded endpoints)               | Every probe blocked or proxied                 |

**Out of scope here:** governance / injection / AgentDojo / token boards; publish latency or density numbers from Cua.

Ontologiql owns O1–O4 (enforcement suite inside the Space, practical costs, joint snapshot spike).

---

## 5. Pinning and evidence

- Pin: **`@trycua/cua@0.9.0`** (`PINNED_CUA_NPM_*` in `clawql-sandbox`).
- Every evidence file records host Mac model + macOS version (or empty on Linux CI) via `collectIsolationHostEvidence`.
- `publishGradeAllowed: false` for all Cua-backed artifacts.

---

## 6. Consequences

- **Positive:** Mac Linux-Spaces path without coupling production K8s to Cua; shared conformance with Ontologiql; snapshot/replay spike without claiming publish numbers.
- **Negative / follow-ups:** Live cua-spacesd HTTP façade still maps to upstream as the daemon contract settles; real Mac host evidence not produced in Linux CI.
- **Non-goals:** Hard dependency on `@trycua/cua`; replacing Agent Substrate as primary in-cluster backend; publishing Cua-sourced latency/density.

---

_Isolation Architecture Decision Record · ADR 0018 · v0.1 · October 2026_
