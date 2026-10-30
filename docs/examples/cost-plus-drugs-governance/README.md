# Cost Plus Drugs × ClawQL governance demo

**Not medical advice.** Public cash **prices** + **mock** refill orders only. No
clinical, dosing, or substitution guidance — same line Cost Plus Drugs draws on
their [MCP scope page](https://mccpdc-llc.github.io/pricing-api-documentation/mcp.html).

Cost Plus already ships a public, unauthenticated MCP for **reads**
(`https://mcp.costplusdrugs.com/`). Duplicating price lookup would not impress
anyone. This example shows the **next step**: governed writes across models.

| Layer  | What                                                                       |
| ------ | -------------------------------------------------------------------------- |
| Reads  | Official CPD MCP / pricing API (or offline fixture)                        |
| Writes | **Mock** `place_refill_order` — no public ordering API exists              |
| Gate   | Digest-bound **mandate** (agent cannot self-approve)                       |
| PHI    | BAA routing — patient fields only to providers marked `baa: true`          |
| Trail  | Hash-chained demo audit log (stand-in for MCP `audit` + clawql-audit WORM) |

Pitch in one line: _You've built the read side. Here's how agents can safely stage
orders across every model — patient approval bound to exact drug/qty/price, PHI
only to BAA-covered providers, full audit trail._

## Quick smoke (offline)

```bash
cd docs/examples/cost-plus-drugs-governance
chmod +x scripts/smoke.sh
./scripts/smoke.sh
```

Optional live public price fetch (still no PHI, still no real order):

```bash
CPD_LIVE_PRICE=1 ./scripts/smoke.sh
```

## Live ClawQL gateway smoke

After `npm ci && npm run build` from the repo root:

```bash
# One-shot: mock write MCP + clawql-mcp-http + price → mandate → resume → audit
node docs/examples/cost-plus-drugs-governance/scripts/gateway-smoke.mjs

# Leave services up for a screen recording:
CPD_GW_KEEP=1 node docs/examples/cost-plus-drugs-governance/scripts/gateway-smoke.mjs
```

Or via the offline smoke wrapper: `CPD_GATEWAY_SMOKE=1 ./scripts/smoke.sh`.

**Operator notes learned while wiring this:**

| Knob | Why |
| ---- | --- |
| `CLAWQL_CATALOG_SQLITE=0` | Default SQLite `LOAD=db` indexes custom MCP ops but does **not** keep live MCP client bindings; writes fail with “MCP source not connected” after resume. |
| `CLAWQL_CAPABILITY_SESSION_SEED` | Capability lifecycle checks the **inner** `operationId` (`mcp__…`), not just `execute`. Seed federated ops or calls are intercepted. |
| `CLAWQL_ENABLE_SESSION_IFC=0` (smoke only) | Default IFC labels a session after a CPD price read and **blocks** writes to `cpd-mock-writes` — a real healthcare-relevant gate. The smoke disables IFC to isolate the mandate path; show IFC separately if you want the harder story. |
| `addedAt` on sources | Hand-written `sources.json` entries without `addedAt` are ignored — prefer `clawql sources add`. |

Operation ids use underscores: `mcp__cost_plus_drugs_pricing__search`, `mcp__cpd_mock_writes__place_refill_order` (see `operation-risk.example.json`).

Custom-source mechanics: [`docs/getting-started/custom-sources.md`](../../getting-started/custom-sources.md).  
Mandate park/resume: [`docs/specs/risk/execute-pause-resume-v0.1.md`](../../specs/risk/execute-pause-resume-v0.1.md).

## Outreach

Draft reply + 90s video narration: [`REPLY.md`](REPLY.md).

## Layout

<<<<<<< HEAD
| Path                                  | Role                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `scripts/governance-demo.mjs`         | End-to-end offline story (price → BAA → mandate → audit) |
| `scripts/mock-pharmacy-write-mcp.mjs` | Streamable HTTP MCP stub for writes                      |
| `scripts/lib/*`                       | Digest, pending store, BAA gate, audit helpers           |
| `fixtures/atorvastatin-search.json`   | Public price snapshot for CI / airplanes                 |
| `sources.example.json`                | CPD read MCP + local mock write MCP                      |
| `operation-risk.example.json`         | `allow` reads / `mandate` writes                         |
| `baa-routing.example.yaml`            | Illustrative multi-model PHI routing                     |
| `TERMS.md`                            | Third-party API caution (no LICENSE on their docs repo)  |
| `tests/governance-demo.test.mjs`      | Digest / BAA / mandate / audit unit checks               |
=======
| Path | Role |
| ---- | ---- |
| `scripts/governance-demo.mjs` | End-to-end offline story (price → BAA → mandate → audit) |
| `scripts/gateway-smoke.mjs` | Live ClawQL HTTP gateway + CPD MCP + mock write mandate |
| `scripts/token-compaction-demo.mjs` | Full catalog vs targeted search payload size |
| `scripts/mock-pharmacy-write-mcp.mjs` | Streamable HTTP MCP stub for writes |
| `scripts/lib/*` | Digest, pending store, BAA gate, audit helpers |
| `fixtures/atorvastatin-search.json` | Public price snapshot for CI / airplanes |
| `sources.example.json` | CPD read MCP + local mock write MCP |
| `operation-risk.example.json` | `allow` reads / `mandate` writes (underscore op ids) |
| `baa-routing.example.yaml` | Illustrative multi-model PHI routing |
| `REPLY.md` | Cuban-thread reply + video narration |
| `TERMS.md` | Third-party API caution (no LICENSE on their docs repo) |
| `tests/governance-demo.test.mjs` | Digest / BAA / mandate / audit unit checks |
>>>>>>> a10168894 (docs(examples): live CPD gateway smoke, compaction, Cuban reply draft)

## Safety checklist (before any public reply / video)

- [ ] Say **mock order** on camera; never imply a real Cost Plus placement.
- [ ] No dosing, diagnosis, or “you should take…” language.
- [ ] Prescription comes from a clinician; the demo only binds **price + identity of the fill**.
- [ ] Read [`TERMS.md`](TERMS.md) before commercial use of their API.
- [ ] No real patient data until BAAs + HIPAA safeguards exist (there is no official “HIPAA certification”).

## Healthcare vertical, not a pharmacy subsidiary

If Cost Plus does not engage, keep this as a **ClawQL healthcare reference case**
for telehealth, digital pharmacies, and pharmacy software vendors — not a second
company that dispenses drugs. Licensing, DEA, PBM contracts, and state pharmacy
boards are out of scope for this gateway demo.

## Related

- Healthcare IDP pack (synthetic referral, no pharmacy): [`docs/examples/idp/healthcare-referral/`](../idp/healthcare-referral/)
- Act-safely proposal: [`docs/proposals/agentready-act-safely.md`](../../proposals/agentready-act-safely.md)
- Regulated deployment notes: [`docs/mcp/enterprise-mcp-tools.md`](../../mcp/enterprise-mcp-tools.md)
