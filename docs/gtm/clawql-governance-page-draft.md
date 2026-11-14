# Governance page draft (`clawql.com/governance`)

**Status:** Draft for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/governance/page.tsx`](../../apps/www/src/app/governance/page.tsx). Numbers and statuses checked against the repository on this date (see verification table).

**Related:** [`/durability`](https://clawql.com/durability) · [`/ontology`](https://clawql.com/ontology) · [`/benchmarks`](https://clawql.com/benchmarks) · [`/security`](https://clawql.com/security) · [multi-attack smoke](../benchmarks/security-suite/multi-attack-injection/results-smoke.json) · [operation risk](../specs/risk/operation-risk-from-spec-v0.1.md).

---

# Governance

**Rules your agents can't rewrite.**

An agent with real access can be tricked. A web page, an email or a document it reads can carry instructions, and a model that follows them can send data somewhere it shouldn't or take an action no one approved. Telling the model, in its prompt, not to do something is not a control: models given a capability and told not to use it still use it, with real frequency.

ClawQL governs agents from outside the agent. Every tool call passes through ClawQL's gateway, which decides what the agent may do using rules the agent cannot see, edit or argue with. The guarantees hold regardless of which model you use, how it was prompted, or whether it has been manipulated.

Three principles run through everything below:

- **Enforce outside the agent.** Rules live where the agent can't reach them.
- **Deterministic first.** Decisions come from types, labels and specifications, not from another model's judgment.
- **When in doubt, ask a person.** Anything the rules don't cover goes to a human, never to a guess.

## One tool call, end to end

*Steps 2 to 8 run in the gateway. The agent only ever sees step 1 and the shaped result of step 7.*

1. **The agent asks.** It names a tool and its arguments. Anything it read earlier in the session may have influenced the request, so ClawQL treats the request with the trust of the least-trusted content behind it.
2. **Classify.** The call is mapped to an action type from the API's own specification (OpenAPI, Smithy, a contract ABI). Reads and writes are told apart by the spec, never by a model's guess. A call that can't be classified goes to a person.
3. **Check.** The action type is checked against the session's mandate (what it is authorized to do), the scope a person confirmed, and the labels on the data involved. Rules are written over types, so rephrasing a request doesn't change the answer.
4. **Approve, if required.** Consequential actions wait for a named person. The approval shows what the action will actually do, where a preview exists; it can be used once, and it expires.
5. **Inject credentials.** API keys and tokens come from the vault and are attached at the gateway's proxy. The agent never holds them, so it can't leak them.
6. **Execute.** The intent is recorded durably before the call, and the call carries an idempotency key, so a crash can't cause a repeat (see [/durability](/durability)). Outbound traffic can only go where policy allows.
7. **Label and shape.** The result is labeled by origin (anything from outside is untrusted), sensitive fields are redacted, and only the fields the agent asked for are returned.
8. **Record.** Every decision, approval and result is written to a hash-chained audit trail that reveals any later change.

## The controls

### Approvals bound to a person

A consequential action waits for a specific, authenticated person. Each approval covers one action, can be used once, and expires. Where the action supports a dry run, the approval shows its predicted effect rather than just the agent's request, and any model-written summary appears beside that effect, labeled. Approval channels match the risk: a chat button for low-risk actions, a stronger person-bound signature, such as a passkey, for consequential ones.

*Planned:* replaying a proposed policy over recorded traffic to see what it would have blocked before enforcing it, and proposing allowlists from what an agent actually did in a trial run, for a person to approve.

### Labels that follow the data

Everything that enters a session is labeled by where it came from: a person, the agent, a trusted system, or the outside world. Labels travel with the data through the session, into memory and through consolidation, and any context built from untrusted content is itself untrusted. So an agent that has read a malicious email can't then approve its own consequential action on the strength of that email: the action needs a person.

### Policy over types

Rules are written against action types and data types (*read* on *documents* in *project X*; *delete* on anything needs approval), not against strings or command names. Classification comes from API specifications, so it can't be talked around. See [/ontology](/ontology).

### Credentials the agent never holds

Keys and tokens live in a vault and are attached by the gateway at the moment of the call. They never enter the model's context, logs or telemetry, so a manipulated agent has nothing to leak. ClawQL Cloud never handles consumer-subscription credentials for model providers.

### Default-deny egress

Outbound traffic is blocked unless policy allows the destination. Every attempt is logged, including blocked ones. In ClawQL Cloud, network tunnels are treated as egress paths too, so they can't be used to route around the proxy.

### Redaction and projection

Sensitive fields (for example protected health information sent toward a model provider without a business associate agreement) are redacted before they leave. Results are projected to only the fields the agent asked for, which keeps sensitive data out of context and context small.

### A tamper-evident record

Every decision, approval, denial and result is written to a hash-chained audit trail: changing, deleting or reordering any entry breaks the chain, detectably. Where configured, entries are also stored write-once (for example with S3 Object Lock in compliance mode), and batches can be anchored externally so the record can be verified without trusting ClawQL.

## What we measured

| Test | Result |
| --- | --- |
| Multi-attack suite (smoke): attacks that achieved their goal under ClawQL defaults | **0 of 12** (scripted worst-case complying agent; measures the gateway) |
| Crash trials: wrong outcomes (repeated or lost actions) | **0 of 1,000** (see [/durability](/durability)) |

**Not published here:** AgentDojo attack-success figures (draft candidate 30% → 6.4%). As of 2026-11-11 there is **no AgentDojo citation or artifact in-tree**, and publish-readiness / agentready explicitly forbid inventing that claim. Land evidence before adding the row.

Results that *are* published come with their test sets, configurations and raw data on [/benchmarks](/benchmarks). Pass criteria are fixed before a run and never loosened after.

## What governance doesn't do

- **It doesn't make the model right.** ClawQL controls what an agent may do, not whether its answers are correct. A governed agent can still be wrong within its permissions.
- **It governs what passes through the gateway.** Tool calls routed through ClawQL are covered; a container's internal behavior, or a tool an agent reaches some other way, is not. That is why egress is default-deny: it closes the other ways out.
- **Labels are conservative.** Treating anything external as untrusted means some legitimate actions will ask a person. That is the deliberate tradeoff, and policy tools exist to make routine actions pass.
- **An approval is only as strong as the approver's account.** That is why consequential actions use stronger, person-bound approval channels.

## Works with what you already use

ClawQL sits underneath the agent, so the agent doesn't need to change. Any MCP-capable client can route its tools through ClawQL today (including Claude Code and other MCP clients). Hermes Agent and Pi as one-click Cloud harnesses, a Docker Sandboxes setup guide, and customer Tailscale connectivity are Cloud / network plan items — supported as design or docs, not yet as a published one-click product surface. ClawQL itself never needs to see a model provider's subscription credentials.

## Status

| Control | Status |
| --- | --- |
| Approvals bound to a person, single-use | Built — atomic single-use consume is implemented and tested; approval-integrity board cells still scaffold. `/security` covers the defense stack; it does **not** yet narrate a specific resume-reuse bug fix. |
| Untrusted labels | Built; measured on the multi-attack smoke (IFC / park) |
| Vault credentials injected at the proxy | Built |
| Default-deny egress | Partial — Istio egress allowlist manifests ship for mesh deploys; chart NetworkPolicy and Cloud egress-proxy guarantee tests remain planned |
| Redaction and projection | Built (Presidio / Stirling in the stack). Cost Plus Drugs as a redaction demo is **not** evidenced in-tree for this claim |
| Hash-chained audit with write-once storage | Built; write-once requires S3 Object Lock configuration |
| Preview before approval, risk-tiered approval channels | Design |
| Policy replay and allowlists proposed from trial runs | Design |
| Policy over ontology types | Partial — gateway operation risk from specs is built; full ontology ActionType policy is design (see [/ontology](/ontology)) |

---

## Notes for publishing

- [x] Verify AgentDojo figures — **not found in-tree; omitted from live page** until evidence lands.
- [x] Verify multi-attack 0 of 12 — `results-smoke.json` `clawql_default_effectuated: 0` / `planted: 12`.
- [x] Verify the two status rows (egress Partial; policy over ontology types Partial).
- [x] `/security` exists; do **not** link a specific resume-reuse bug narrative until that page covers it.
- [x] Cross-link `/durability`, `/ontology`, `/benchmarks`, `/security`.
- [x] Integrations: MCP clients (incl. Claude Code) = today; Hermes / Pi / Docker Sandboxes / Tailscale = plan/docs — wording adjusted.

### Verification (2026-11-11)

| Claim | Evidence | Verdict |
| --- | --- | --- |
| AgentDojo 30% / 6.4% | No artifact; `docs/proposals/agentready-act-safely.md` — “no AgentDojo citation in-tree” | **Do not publish** |
| Multi-attack 0/12 | `docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json` | Publish (smoke; scripted model) |
| Crash 0/1000 | Durability remesure board | Publish (link /durability) |
| Default-deny egress | `docs/security/clawql-security-defense-deliverables.md` row 17 Planned; Istio allowlist manifests present | Partial |
| Policy over ontology types | Operation-risk built; ontology ActionType design | Partial |
| Approvals single-use | `packages/clawql-api/src/pending/atomic-consume.test.ts` + pending service | Built; integrity board scaffold |
| Cost Plus redaction demo | Only durability X-thread correction found | Do not claim as redaction demo |
