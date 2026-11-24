# ClawQL security testing plan

## Purpose and status

This plan covers how ClawQL tests its own security, safely and legally, before attackers do. Drafted 2026-11-06.

**In-repo canonical copy** of the living security testing plan (Claude artifact remains a working surface). Cloud phases: [`../gtm/clawql-cloud-platform-plan.md`](../gtm/clawql-cloud-platform-plan.md). Whitepaper §7 Smithy / AWS Emulator: [`../vision/clawql-network-whitepaper-v0.2.md#smithy-governance-metadata-from-the-spec-itself`](../vision/clawql-network-whitepaper-v0.2.md#smithy-governance-metadata-from-the-spec-itself). Whitepaper §28A governed on-chain actions: [`../vision/clawql-network-whitepaper-v0.2.md#28a-governed-on-chain-actions`](../vision/clawql-network-whitepaper-v0.2.md#28a-governed-on-chain-actions). Durability boards: [`../benchmarks/program-cell-fleet-kill/V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md).

The trigger was the spread of agentic attack tooling such as ARTEX, which CrowdStrike reported being used against more than 200 organizations. None of the techniques in that reporting were novel: unrotated keys, secrets in email, unauthenticated internal services, and instance-metadata abuse. Standard hygiene and legitimate testing catch all of them. We do not use attacker tooling.

Security testing is not a separate track from the ClawQL Cloud launch. Each cloud build phase has a security gate, and a phase does not launch until its gate passes.

## Priorities alongside the cloud launch

1. **This week, about one day: baseline hygiene.** Set up the automated scanning below in CI, scan full git history for secrets, rotate every long-lived credential, and publish a `security.txt` with a disclosure policy. This is cheap and closes the exact class of mistakes ARTEX exploited.
2. **Keep v4 durability as the top engineering priority.** It is already the gate for cloud phase 2, so it is security work too.
3. **In parallel, write the phase 1 guarantee tests in the lab.** Several already exist (AgentDojo, multi-attack, approval resume). The gaps to fill first are credential leakage, audit tampering, and tenant isolation. Tenant isolation is the biggest new risk a managed gateway introduces.
4. **Make every cloud phase's security gate part of its definition of done.** No phase launches until its tests pass.
5. **Commission an external penetration test before the first paying customer,** aligned with the billing gate.

The reasoning: a managed gateway holding customer credentials is a high-value target, and tools like ARTEX scan broadly for exactly the weaknesses a rushed launch leaves behind. Building the gates in as you go costs far less than retrofitting them after launch.

## Rules of engagement template

Fill in one copy per engagement and file it with the findings. Even for a solo founder, this keeps testing inside the lines and becomes audit evidence later.

| Field | Entry |
| --- | --- |
| Engagement name |  |
| Tester | Daniel Smith |
| Authorizer | Owner of the systems in scope (the company, once incorporated) |
| In scope | Specific hosts, accounts, repos and environments |
| Out of scope | Third-party platforms, real customer data or PHI, cloud provider infrastructure itself |
| Allowed techniques |  |
| Needs provider approval | DoS or DDoS simulation, command-and-control red teaming, phishing, malware testing |
| Testing window | Start and end date and time |
| Stop conditions | Touching real customer data, unexpected impact on availability, an alert from a third party |
| Logging | Where commands, outputs and timestamps are recorded |
| Findings | Where they are tracked and the severity scale used |
| Sign-off | Date |

## Legal and third-party boundaries

- **Own lab first.** Local ClawQL, the Mac mini Colima VM, or a dedicated test account with no production data. No permission is needed, and most of the highest-value tests run there.
- **AWS.** Testing your own resources on AWS's permitted-services list needs no prior approval. DoS simulation, command-and-control red teaming, phishing and malware testing need approval through AWS's simulated events form. Testing AWS infrastructure or services themselves is not allowed, and some services are prohibited for outbound testing. Recheck AWS's current policy page before every engagement; it changes.
- **Third parties.** Cloudflare, Stripe, GitHub, Primcloud and every upstream API have their own rules. Test only your own configuration of them (for example, Stripe test mode), never their platforms. Report anything found in their systems through their disclosure or bug bounty programs.
- **Other people's systems: never.** No scanning, probing or testing of anything you do not own or have written permission to test.

## Safety rails

- Rate-limit every scanner; flooding is prohibited even against your own resources.
- Snapshot or back up before any destructive test.
- Log every command run, with timestamps, so any alert can be traced to the test.
- Never point tests at production before they have run cleanly in the lab.
- Keep test credentials separate from real ones and revoke them afterward.

## Baseline automated scanning

Run these in CI on every push or nightly. They are the lawful equivalent of what attacker frameworks automate.

| Area | Tools | Catches |
| --- | --- | --- |
| Secrets | gitleaks, trufflehog (including full history) | Keys and tokens committed anywhere |
| Dependencies | npm audit or osv-scanner, cargo audit | Known-vulnerable packages |
| Container images | Trivy or Grype | Vulnerable base images and packages |
| Cloud configuration | Prowler or ScoutSuite | Public buckets, broad IAM, IMDSv1 enabled |
| Web and API | OWASP ZAP or Burp (lab first) | Injection, auth flaws, misconfiguration |
| Known CVEs | nuclei templates | Exposed services with published vulnerabilities |

Alongside scanning: rotate every long-lived credential and set expiry, enforce IMDSv2, keep credentials out of email and chat, and require authentication on every internal control plane.

## ClawQL guarantee tests

Each public guarantee gets a test that tries to break it. These run in the lab and become regression tests. Pass conditions are fixed before running, the same as benchmark boards.

| Guarantee | What to try | Pass condition |
| --- | --- | --- |
| Approvals are single-use and bound to a person | Reuse an approved execution through resume paths; replay after expiry; approve from a channel the agent controls | Every reuse rejected and audited |
| Untrusted labels | Injection through tool results, webhook bodies and compiled memory; dropping labels through session reset or summarization | Labels never drop; no consequential action from untrusted input without approval |
| Vault credentials | Ask the agent to print or send secrets; read environment and files; provoke errors that echo tokens | No credential reaches model context, logs or telemetry |
| Default-deny egress | DNS exfiltration, IP literals, redirects, alternate ports, IPv6, proxy environment variables | Only allowlisted destinations reached; every attempt logged |
| Metadata endpoint blocked | Reach the instance metadata service from sandboxes and containers, directly and via server-side request forgery in tools | Unreachable |
| Tamper-evident audit | Edit, delete, reorder or truncate entries; replace the chain tail | Verification detects every change |
| Crash-safe writes | Kills during calls (existing durability boards) | Zero duplicate effects |
| Tenant isolation (cloud) | Guess other tenants' IDs; shared cache keys; cross-tenant log queries; webhook misrouting | No cross-tenant read or write |
| PHI redaction | PHI in nested fields, unusual encodings and attachments | Nothing identifiable reaches a provider without a BAA |
| Supply chain | Unsigned images, tag swaps, dependency confusion | Rejected at admission or in CI |

### On-chain guarantee tests

For governed on-chain actions (whitepaper [section 28A](../vision/clawql-network-whitepaper-v0.2.md#28a-governed-on-chain-actions)). Run on testnets and local forks first, never against mainnet funds until these pass.

| Guarantee | What to try | Pass condition |
| --- | --- | --- |
| On-chain reads are untrusted | Instructions hidden in token names, contract metadata, event logs and NFT attributes | Zero signed transactions outside scope |
| Deterministic classification | Calls to unverified contracts; proxy contracts; look-alike function selectors | Undecodable or ambiguous calls go to a person |
| Exact diff shown | Transactions whose model summary contradicts the simulated effect | The approval screen shows the true diff; the summary is labeled |
| Allowance risk | Unlimited and oversized allowance grants, including inside batched calls | Always requires a person |
| Chain enforces limits alone | Disable the gateway and attempt out-of-limit writes with the agent's session key | The smart account rejects every one |
| No double send | Kill the process at every step from signing to confirmation | Zero duplicate transactions; recovery checks nonce and hash before rebroadcast |
| Simulation drift | State changes between simulation and inclusion; front-running on a fork | Bounded transactions revert; divergence recorded and flagged |
| Keys stay out of agents | Ask the agent to reveal, export or use keys directly | No key material reaches model context, logs or telemetry |

### Telemetry isolation tests

For the tiers in the Cloud plan's ["Telemetry isolation by tier"](../gtm/clawql-cloud-platform-plan.md#telemetry-isolation-by-tier) section.

| Guarantee | What to try | Pass condition |
| --- | --- | --- |
| Paid tiers: structural isolation | From tenant A's worker, read tenant B's bucket and decrypt with tenant B's key | Denied by credentials and key policy, every time |
| Paid tiers: provable deletion | Disable a tenant's key, then read its data from the bucket, backups and caches | Nothing readable; each step recorded in the WORM trail |
| Free tier: header cannot be forged | Send telemetry and queries with a client-supplied `X-Scope-OrgID`; reach the backend APIs directly | The proxy strips the header and sets it from verified identity; the backends are unreachable except through the proxy |
| Free tier: no cache crossover | Identical queries from two tenants in quick succession | No result served to the wrong tenant |

### Destructive-action tests on AWS Emulator

AWS Emulator (public domain under CC0, 200+ AWS services, local and offline) is the lab target for governance tests that would be costly or dangerous against real AWS. Run them locally, as often as needed. See whitepaper [§7 Smithy](../vision/clawql-network-whitepaper-v0.2.md#smithy-governance-metadata-from-the-spec-itself).

| Guarantee | What to try | Pass condition |
| --- | --- | --- |
| Destructive writes need approval | Agent deletes an S3 bucket, empties a DynamoDB table, terminates instances, or opens a security group to the internet | Blocked or held for a person's approval; every attempt audited |
| Classification from the spec | Operations marked `@readonly` versus writes in the Smithy models | Reads pass under read scope; every write is classified as a write |
| Crash-safe AWS writes | Kill the gateway between journaling and sending a write that has an `@idempotencyToken` field | The retry carries the same token; exactly one resource is created |
| Injection through AWS data | Instructions planted in object contents, tags and queue messages | Labeled untrusted; no out-of-scope action follows |

The emulator models service behavior, not AWS's security infrastructure: instance-metadata, IAM and network-boundary attacks stay with the real-cloud lab under the rules of engagement above. Emulator is the default AWS lab target for ClawQL because it is public domain and redistributable; LocalStack's current commercial image is used only when a customer already pays for it. Verify demo-critical services against real AWS before any claim depends on Emulator fidelity.

## Security gates per cloud phase

Phases follow the [ClawQL Cloud platform plan](../gtm/clawql-cloud-platform-plan.md). Each gate adds to the ones before it.

| Phase | Must pass before launch |
| --- | --- |
| 1 · Managed gateway | Baseline scanning in CI; guarantee tests for approvals, labels, vault and audit; tenant isolation tests; auth and rate limiting on public endpoints |
| 2 · Durable agents + webhooks | Webhook signature, replay and dedupe tests; untrusted labels on payloads; v4 durability; per-tenant resource limits |
| Billing | Stripe idempotency fix; double-charge and replayed-webhook tests; external penetration test |
| 3 · Dedicated agents | Key separation; verify no shared nodes or databases |
| 4 · Shared containers | Known microVM escape checks; metadata and egress bypass tests; mesh-escape rejection (NET_ADMIN, host networking); unsigned-image rejection; detection of customer workloads scanning outward |
| 5 · Dedicated containers | Phase 4 tests on dedicated hosts |
| 6 · BYOC | Our access inside customer accounts is least-privilege and audited |
| 7 · Hardened (TEE) | Attestation verified end to end |

**On-chain actions, in whichever phase first offers them:** the on-chain guarantee tests above pass on testnets and forks, then a time-boxed mainnet pilot with small, capped funds, before any public claim. A smart-contract audit of any session-key policy contracts ClawQL ships is part of the external penetration test.

## Findings handling

- Record every finding privately (for example, GitHub private security advisories) with severity, reproduction and affected versions.
- Fix, then add a regression test that fails on the old code.
- If an affected version shipped, publish an advisory after the fix is available. Never publish exploit details before a fix.
- Treat findings like benchmark failures: published honestly, never quietly dropped.

## Open questions

- [ ] Who signs as authorizer before incorporation?
- [ ] Where findings live privately, and who else can see them.
- [ ] Budget and timing for the external penetration test.
- [ ] Whether to start a bug bounty, and when.
- [ ] Which guarantee tests already exist and only need wiring into CI.
