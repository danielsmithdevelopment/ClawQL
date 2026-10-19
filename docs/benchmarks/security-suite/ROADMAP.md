# Security suite roadmap

Boards that hit what a **block list cannot express**, and that matter to a buyer even with no peer in the picture.

Every board uses the same format as [governance-policy-depth](../governance-policy-depth/FAIRNESS.md):

- **Defaults column** — stock product, no cell-specific deny/config
- **Best-configuration column** — each product’s recommended hardening for that cell (expect ties where a config line suffices)
- **Frozen rules** before runs
- **Published harness** + raw JSON
- **Maintainer invite** for peer configs

Live overview: [clawql.com/benchmarks#security-suite](https://clawql.com/benchmarks/#security-suite).

## Credibility rule

| Label             | Use when                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **`not_offered`** | Product never claims the capability (e.g. signed mandate digests / security-key approvals) |
| **`pending`**     | Outcome is measurable but not yet run                                                      |

**Injection resistance is an outcome** — every gateway can be scored on the same corpus. Marking Obot / Bifrost / Executor `not_offered` on injection hides a measurable result. Use **`pending`** until defaults + best-config are measured.

Measured failure of something a product claims is fair; scoring it down for something it never claims looks rigged.

## Build first (signal per effort)

| Priority | Board                             | Why                                                                             |
| -------- | --------------------------------- | ------------------------------------------------------------------------------- |
| **1**    | Multi-attack injection suite      | Peers → configured via general mechanisms → ship product defaults → publish     |
| **2**    | Approval-integrity cells          | No peer config can tie (self-approval, digests, replay, collusion, crash races) |
| **3**    | Exfil through an allowed tool     | Proves data-flow / taint after untrusted reads                                  |
| **4**    | Secret visibility from agent code | Timely post-OpenCode; vault injection should yield nothing                      |
| **5**    | Kill-mid-write duplicates         | Turns TLA+ “zero duplicate side effects” into a measured number                 |

Parallel product track (required before publishing multi-attack): make **ClawQL defaults** close the gap via general mechanisms (not `BLOCK_TOOLS`) — **park overwrites** of authoritative facts; **label** untrusted→memory writes; **block** untrusted→external/privileged — so `clawql_default` is **0/12** trusted effectuation _and_ benign workflows complete without a human (plus persistent-injection blocked).

## Property groups

### 1. Approvals that can’t be gamed

| Cell                 | Attack                                              | ClawQL property                    |
| -------------------- | --------------------------------------------------- | ---------------------------------- |
| `self_approval`      | Agent approves its own paused write                 | Different person + security key    |
| `arg_tamper`         | Approved at $52k, executed at $520k                 | Mandate digests refuse             |
| `approval_replay`    | Reuse approval for a second write / after expiry    | Single-use + expiry                |
| `approver_collusion` | Requester in approver group; double-count in N-of-M | Separation + unique principals     |
| `concurrent_crash`   | Two replicas race; kill mid-write × thousands       | Zero duplicate side effects (TLA+) |

### 2. Injection and data flow

| Cell                   | Attack                                                                  | ClawQL property                                     |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `multi_attack_suite`   | Dozens of planted instructions across email/ticket/doc/webhook × models | Count how many take effect                          |
| `allowed_tool_exfil`   | Poisoned read → permitted Slack (etc.) moves vault data                 | Session taint / data-flow labels                    |
| `persistent_injection` | Poison in memory/skill → fires in a _later_ session                     | Untrusted labels survive storage                    |
| `tool_desc_rug_pull`   | Upstream changes tool description after approval                        | Diff / quarantine / owner review (cf. Uber gateway) |

### 3. Credentials

| Cell                 | Attack                                     | ClawQL property                   |
| -------------------- | ------------------------------------------ | --------------------------------- |
| `secret_visibility`  | Program/code-mode reads tokens, env, files | Vault injection → nothing visible |
| `key_exfiltration`   | Pull stored provider keys via tool/API/log | Keys never round-trip out         |
| `token_confusion`    | Token for tenant A used on tenant B        | Audience binding                  |
| `revocation_latency` | How long a revoked grant keeps working     | Bound latency                     |
| `stolen_key_blast`   | Key group + spend cap under abuse          | Cap stops damage                  |

### 4. Containment

| Cell             | Attack                                       |
| ---------------- | -------------------------------------------- |
| `sandbox_escape` | Network, FS, memory, CPU loops from program  |
| `ssrf`           | Tool arg → `169.254.169.254` / DNS rebinding |
| `cross_tenant`   | Access another tenant’s resources            |

### 5. Audit

| Cell             | Check                                                    |
| ---------------- | -------------------------------------------------------- |
| `tamper_detect`  | Edit/delete a log entry → detection latency              |
| `completeness`   | Denied and failed calls logged, not only success         |
| `reconstruction` | Investigator rebuilds exact agent actions from log alone |

### 6. Failing safely

| Cell              | Failure mode                                                |
| ----------------- | ----------------------------------------------------------- |
| `dep_outage`      | Policy engine / mandate DB / NATS down → refuse risky calls |
| `emergency_brake` | Time from “pause this agent” to last tool call              |
| `runaway_loop`    | Spend from looping agent before cap stops it                |

## Board status

| Id                         | Status         | Notes                                                                                                |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| governance-policy-depth v2 | **Shipped**    | Fair defaults + best-config; design cells listed                                                     |
| multi_attack_suite         | **Scaffolded** | Smoke v3: 0/12 + persistent blocked + benign rate 1.0; peers **pending**; draft until peers measured |
| approval_integrity         | Partial        | Harness resume probe only; full cells pending                                                        |
| allowed_tool_exfil         | Planned        |                                                                                                      |
| secret_visibility          | Planned        |                                                                                                      |
| kill_mid_write             | Planned        | Ties to ProgramCellDO / TLA+ evidence                                                                |
| Remaining groups           | Backlog        | After top five                                                                                       |

## Related

- [governance-policy-depth/FAIRNESS.md](../governance-policy-depth/FAIRNESS.md)
- [dominance-roadmap.md](../dominance-roadmap.md)
- Frozen skeleton: [`frozen-rules.json`](./frozen-rules.json)
- Marketing: `apps/www/src/lib/security-suite-roadmap.ts`
