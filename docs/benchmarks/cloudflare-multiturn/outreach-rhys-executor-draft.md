# Draft outreach — Executor maintainers (Rhys / Useful Software)

**Status:** draft for human review — do **not** send until approved.  
**Tone:** congratulations + config questions. No product comparison. No ClawQL numbers in the message.

**Before send:** merge/publish the “Executor v2 β — under review” HTTP concurrency row on `/benchmarks` so the claim in the email is true when he opens the page.

**Pinned SHA:** `2a0998368ab353391e78f8949fb1bca797458aa7`

---

**Subject:** Congrats on Executor 2, and a config question for our benchmark harness

Hi Rhys,

Congrats on the Executor 2 launch. I'm Daniel, building ClawQL, an open-source MCP gateway. We publish equal-arm benchmark boards that include Executor, and I want to make sure we run v2 the way you'd recommend.

We're testing the current install channel (`executor@beta`, 2.0.0-beta.37 as of today). Please tell me if a different tag is the right one.

Since Executor is meant to serve as a shared gateway for teams, I want to make sure we're measuring concurrent use the way you'd recommend. Our first concurrent-HTTP pass looks far off from a multi-client gateway story: single requests are fine (~60 ms for a warm execute on `/mcp`), but sustained concurrency is very low, peak throughput stays flat around ~70 RPS as we add clients, and memory is ~2 GB at idle (serve plus workerd). Our page currently shows similar numbers from beta.15; I've marked that row as under review until we sort this out.

Three questions:
1. What's the recommended way to run Executor 2 for concurrent Streamable HTTP MCP clients? Is that a supported setup?
2. For governance tests, what's the recommended v2 way to configure approvals and blocked tools?
3. Is there anything in our setup we shouldn't be doing?

Harness and raw results (pinned to commit `2a0998368ab353391e78f8949fb1bca797458aa7`):
- Harness: https://github.com/danielsmithdevelopment/ClawQL/blob/2a0998368ab353391e78f8949fb1bca797458aa7/scripts/benchmarks/http-concurrency-heap-ab.mjs
- OpenAPI-to-mock wiring: https://github.com/danielsmithdevelopment/ClawQL/blob/2a0998368ab353391e78f8949fb1bca797458aa7/scripts/benchmarks/cloudflare-multiturn/lib/ensure-executor-openapi-app.mjs
- Provisional results: https://github.com/danielsmithdevelopment/ClawQL/tree/2a0998368ab353391e78f8949fb1bca797458aa7/docs/benchmarks/cloudflare-multiturn/remeasure-beta37

Happy to switch to whatever configuration you consider fair and rerun on the same host. If I don't hear back by Wednesday, November 19, we'll publish with the exact `executor --version` used, noting that we invited your review.

Thanks,
Daniel

---

## Checklist before send

- [ ] Under-review row live on clawql.com/benchmarks (HTTP concurrency Executor cell)
- [ ] Confirm channel wording with Rhys’s launch post (β.37 tip vs any other tag he names)
- [ ] Prefer private channel first (email `rhys@executor.sh` / Slack connect / Discord) — not his launch thread
- [ ] Do **not** paste ClawQL comparisons or adjectives into the message
- [ ] After send: keep under-review label until response or Nov 19 deadline
