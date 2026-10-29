# Cost Plus Drugs × ClawQL governance demo

**Not medical advice.** Public cash **prices** + **mock** refill orders only. No
clinical, dosing, or substitution guidance — same line Cost Plus Drugs draws on
their [MCP scope page](https://mccpdc-llc.github.io/pricing-api-documentation/mcp.html).

Cost Plus already ships a public, unauthenticated MCP for **reads**
(`https://mcp.costplusdrugs.com/`). Duplicating price lookup would not impress
anyone. This example shows the **next step**: governed writes across models.

| Layer | What |
| ----- | ---- |
| Reads | Official CPD MCP / pricing API (or offline fixture) |
| Writes | **Mock** `place_refill_order` — no public ordering API exists |
| Gate | Digest-bound **mandate** (agent cannot self-approve) |
| PHI | BAA routing — patient fields only to providers marked `baa: true` |
| Trail | Hash-chained demo audit log (stand-in for MCP `audit` + clawql-audit WORM) |

Pitch in one line: *You've built the read side. Here's how agents can safely stage
orders across every model — patient approval bound to exact drug/qty/price, PHI
only to BAA-covered providers, full audit trail.*

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

## Wire into a real ClawQL gateway

After `npm ci && npm run build` from the repo root:

```bash
# Terminal A — mock write MCP (local only)
node docs/examples/cost-plus-drugs-governance/scripts/mock-pharmacy-write-mcp.mjs

# Register sources (merge into ~/.ClawQL/sources.json — do not overwrite other sources)
# See sources.example.json for the intended entries.
clawql sources add https://mcp.costplusdrugs.com/ --kind mcp --name "Cost Plus Drugs Pricing"
clawql sources add http://127.0.0.1:9892/mcp --kind mcp --name "CPD Mock Writes"

# Risk overrides — copy fields into ~/.ClawQL/operation-risk.json
# (operation-risk.example.json). Ensure place_refill_order is policy: mandate.

export CLAWQL_OPERATION_RISK_ENFORCE=1
# Restart clawql-mcp / Managed Gateway, then from an agent:
#   search "atorvastatin" → execute mcp/cost-plus-drugs-pricing/search
#   execute mcp/cpd-mock-writes/place_refill_order {…} → mandate_required
#   human: clawql resume <executionId>
#   audit list
```

Custom-source mechanics: [`docs/getting-started/custom-sources.md`](../../getting-started/custom-sources.md).  
Mandate park/resume: [`docs/specs/risk/execute-pause-resume-v0.1.md`](../../specs/risk/execute-pause-resume-v0.1.md).

## Layout

| Path | Role |
| ---- | ---- |
| `scripts/governance-demo.mjs` | End-to-end offline story (price → BAA → mandate → audit) |
| `scripts/mock-pharmacy-write-mcp.mjs` | Streamable HTTP MCP stub for writes |
| `scripts/lib/*` | Digest, pending store, BAA gate, audit helpers |
| `fixtures/atorvastatin-search.json` | Public price snapshot for CI / airplanes |
| `sources.example.json` | CPD read MCP + local mock write MCP |
| `operation-risk.example.json` | `allow` reads / `mandate` writes |
| `baa-routing.example.yaml` | Illustrative multi-model PHI routing |
| `TERMS.md` | Third-party API caution (no LICENSE on their docs repo) |
| `tests/governance-demo.test.mjs` | Digest / BAA / mandate / audit unit checks |

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
