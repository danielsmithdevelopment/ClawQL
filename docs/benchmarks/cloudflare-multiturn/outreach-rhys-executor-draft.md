# Draft outreach — Executor maintainers (Rhys / Useful Software)

**Status:** draft for human review — do not send until approved.  
**Tone:** congratulations + harness help request. No product comparison. No public numbers until you respond.

---

**Subject:** Congrats on Executor 2 — can you sanity-check our concurrent HTTP harness?

Hi Rhys —

Congratulations on Executor 2.

We’re remeasuring our equal-arm MCP boards against the current Executor 2 install channel (`executor@beta` → **2.0.0-beta.37** as of 2026-11-05). On npm, `latest` is still **1.6.11**, and we don’t see a non-prerelease GitHub `2.0.0` release — so we’re treating β.37 as today’s launch tip unless you point us at a different binary/tag.

We ran a first concurrency pass and the results look **far off from what we’d expect for a shipped product** (very low sustained clients under a 100 ms p99 SLO, and ~2 GB resident before load). We suspect **our setup**, not your intended operator path. A single warm MCP `execute` on `/mcp` is ~60 ms here; idle RSS is already GB-class (serve + workerd; motel excluded). That smells like a topology/config mismatch (e.g. how we should run concurrent HTTP clients against the background service) more than a fair product measurement.

**Ask:** what’s the recommended way to run Executor 2 for **concurrent Streamable HTTP MCP clients** (stock flags, service vs serve, worker/isolate knobs, anything we should not do)?

**Harness + raw artifacts** (no numbers on our public board until you’ve had a chance to reply):

- Harness: https://github.com/danielsmithdevelopment/ClawQL/blob/cursor/executor-v2-remeasure-invite-c0bf/scripts/benchmarks/http-concurrency-heap-ab.mjs
- OpenAPI→mock app wiring: https://github.com/danielsmithdevelopment/ClawQL/blob/cursor/executor-v2-remeasure-invite-c0bf/scripts/benchmarks/cloudflare-multiturn/lib/ensure-executor-openapi-app.mjs
- Provisional artifacts: https://github.com/danielsmithdevelopment/ClawQL/tree/cursor/executor-v2-remeasure-invite-c0bf/docs/benchmarks/cloudflare-multiturn/remeasure-beta37
- Single-client profile notes: same folder / agent artifacts after merge

Happy to change the arm to whatever you consider a fair default and remasure on the same host.

**Deadline:** if we don’t hear back by **Wednesday 2026-11-12 (America/Los_Angeles)**, we’ll publish the tip-channel board labeled with the exact `executor --version` we used and a note that maintainer config review was invited.

Thanks —  
[Name]

---

## Checklist before send

- [ ] Confirm channel wording with Rhys’s launch post (β.37 tip vs any other tag he names)
- [ ] Prefer private channel first (email `rhys@executor.sh` / Slack connect / Discord) — not a dunk thread
- [ ] Do **not** paste concurrency tables or ClawQL comparisons into the message
- [ ] Sign with real name / ClawQL contact
- [ ] After send: keep `/benchmarks` on labeled historical β.15 cells until response or deadline
