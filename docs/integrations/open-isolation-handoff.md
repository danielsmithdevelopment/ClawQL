# Handoff: open isolation backends (ClawQL × Ontologiql)

**Status:** ClawQL C1–C4 landed in-repo (ADR 0018 v0.2). Ontologiql O1–O4 still apply with backends swapped.  
**ADR:** [`0018-open-isolation-backends.md`](../adr/0018-open-isolation-backends.md) · **Guide:** [`open-isolation-backends.md`](./open-isolation-backends.md)

## Why Cua is out

FSL-1.1-MIT “self-host OK” does not clearly cover shipping Spaces as an isolation backend inside a **commercial, customer-deployed agent runner**. Enterprise buyers will question it. Do not email for a carve-out and wait — use OSI backends only.

## Shared rules (both repos)

- Put every hypervisor / VM tool behind **`IsolationBackendService`** (`clawql-sandbox`). Never a hard dependency of the runner binary.
- Pin versions in `ISOLATION_BACKEND_PINS` and re-check LICENSE at that tag when bumping.
- **License CI:** `npm run check:isolation-backend-licenses` (OSI allowlist; forbids `cua` / `tart`).
- Record host (Mac model + macOS version on Darwin) in every evidence file.
- Publish-grade numbers: Firecracker / gVisor on the **dedicated Linux host** only. Mac Apple-container / Lima runs stay non-publish.

## Backend matrix

| Host  | Backend         | Pin                  | Job                                     |
| ----- | --------------- | -------------------- | --------------------------------------- |
| Linux | Firecracker     | `v1.17.0`            | microVM; **O4/C3 snapshot spike first** |
| Linux | gVisor          | `release-20261026.0` | middle tier                             |
| macOS | Apple container | `0.1.0`              | Linux guest per lightweight VM          |
| macOS | Lima            | `v2.2.1`             | full Linux VM                           |

**Avoid:** Cua; Tart.

## Ontologiql (still open)

| ID  | Work                                                                | Notes                                             |
| --- | ------------------------------------------------------------------- | ------------------------------------------------- |
| O1  | Admit → create guest at tier → mount worktree → start agent adapter | Same interface; wire Firecracker / Apple / Lima   |
| O2  | Enforcement + escape suite inside the guest                         | Unchanged intent; presence/approvals on host      |
| O3  | Practical costs (start p50/p99, I/O, memory, concurrency)           | Usability only; not publish headlines on Mac      |
| O4  | Snapshot spike with ClawQL C3                                       | **Firecracker first**, then Apple VZ save/restore |

## ClawQL (done in this repo)

| ID  | Work                                   | Entry points                                              |
| --- | -------------------------------------- | --------------------------------------------------------- |
| C1  | Shared interface + mocks + conformance | `runIsolationConformanceEffect`, `createMock*Layer`       |
| C2  | N=50 checkpoint forks                  | `forkPilotTrialsEffect` (Firecracker-first)               |
| C3  | Record-and-replay + digest mismatch    | `CallRecordReplayService` / `assertReplaySpikeDoneEffect` |
| C4  | Gateway no-bypass                      | `assertNoGatewayBypassEffect`                             |

## Don’t test here

- Governance / injection / AgentDojo / token boards (ClawQL logic; VM noise only).
- Density / latency publish runs on Mac VMs.
- Kernel-isolation claims for gVisor as if it were Firecracker.
