---
title: "Open isolation backends (Firecracker, gVisor, Apple container, Lima)"
status: "October 2026 — accepted (supersedes Cua spike)"
version: "0.2"
adr: "0018"
package: "packages/clawql-sandbox/ (isolation-backend/)"
---

# ADR 0018: Open isolation backends

**October 2026 · Accepted · ClawQL C1–C4 + shared Ontologiql rules**  
**Supersedes:** Cua Spaces as a candidate backend (rejected — FSL competing-use risk for a commercial agent runner; enterprise buyers will question it).

---

## 1. The Decision

ClawQL keeps a shared **`IsolationBackendService`** and implements **fully open-source** backends only:

| Host  | Backend                                  | License    | Role                                            |
| ----- | ---------------------------------------- | ---------- | ----------------------------------------------- |
| Linux | **Firecracker**                          | Apache-2.0 | microVM + **primary snapshot/replay spike**     |
| Linux | **gVisor**                               | Apache-2.0 | sandboxed-kernel middle tier                    |
| macOS | **Apple `container` / Containerization** | Apache-2.0 | Linux guest per lightweight VM on Apple Silicon |
| macOS | **Lima** (CNCF)                          | Apache-2.0 | full Linux VM tier                              |

**Avoid:** Cua Spaces (FSL-1.1-MIT competing-use ambiguity for sold runners); **Tart** (source-available with commercial restrictions).

Agent Substrate (ADR 0011: Cloud Hypervisor / gVisor) remains the primary **in-cluster** `sandbox_exec` path. These backends share the same isolation interface for Ontologiql / open reference runner conformance — they are not hard npm dependencies.

**Why (two jobs only):**

1. Run agent sessions inside **Linux guests** (on Mac or Linux) so existing Linux enforcement applies.
2. Prototype **snapshot-based recovery** + record-and-replay for unmodified agents.

---

## 2. Snapshot spike order

1. **Firecracker** first (best-documented snapshot/restore) — O4 / C3 joint spike.
2. Then **Apple Virtualization.framework** save/restore (via Apple container / Lima path) on recent macOS.

---

## 3. ClawQL scope (C1–C4)

| ID  | Deliverable                                                   | Done when                           |
| --- | ------------------------------------------------------------- | ----------------------------------- |
| C1  | Same interface; mocks for Firecracker / gVisor / Apple / Lima | Conformance green per backend       |
| C2  | Fork durability pilot trials (N=50) from one checkpoint       | Arms share `parentSnapshotId`       |
| C3  | Record-and-replay by sequence + digest; mismatch → unknown    | No repeated write; divergent caught |
| C4  | Gateway no-bypass probes                                      | Every probe blocked or proxied      |

**Out of scope here:** governance / injection / AgentDojo / token boards. Ontologiql owns O2 (enforcement + escape) and O3 (costs) unchanged.

Publish-grade numbers: allowed for Firecracker/gVisor on the **dedicated Linux host** only. Mac VM backends stay `publishGradeAllowed: false`.

---

## 4. License CI

Every backend pin in `ISOLATION_BACKEND_PINS` must use an SPDX id on the OSI allowlist (`Apache-2.0`, `MIT`, `BSD-*`, …). CI runs `scripts/check-isolation-backend-licenses.mjs` and fails on drift. Re-confirm license text at each pinned version when bumping.

---

## 5. Consequences

- **Positive:** No FSL / competing-use cloud over sold runners; stronger Apple Silicon boundary than shared-kernel container tiers; Firecracker-shaped snapshot path.
- **Negative / follow-ups:** Live Firecracker/Apple wiring still operator-hosted; mock conformance is CI-default.
- **Non-goals:** Bundling Cua; auto-selecting open isolation backends for `sandbox_exec` without explicit pin; claiming kernel isolation claims that Firecracker/Apple VM already provide incorrectly for gVisor.

---

_Isolation Architecture Decision Record · ADR 0018 · v0.2 · October 2026_
