# Draft outreach — Infinity / Shadaj Laddad’s team

Ready to send once you review. Tone: candid, same-host evidence, invite their review before any “denser than” promotion.

---

**Subject:** Same-host 8 GiB history-density harness vs Infinity `agent_scale` — request for review

Hi Shadaj / Infinity team —

Your [AWS Open Source post](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/) and the public ~75k-agents-@-8 GB line prompted us to reproduce `agent_scale` on the same host as a ClawQL matched-history arm and publish the evidence for review before any cross-project claim.

**What we measured (memory / history storage, not full-runtime throughput)**

Under `memory.max=8G` and `memory.swap.max=0`, with the same unique-per-agent 20-turn history shape:

| Arm                                                       | Latency-gated lastFit | RSS/N      |
| --------------------------------------------------------- | --------------------- | ---------- |
| Infinity `agent_scale` (full scripted runtime round-trip) | 77 500                | ~105.3 KiB |
| ClawQL matched-shape resident history store               | 100 000               | ~78.8 KiB  |

That is about **29% more agents** on the ClawQL side **for storing matched histories under the cap**. We are **not** claiming “the ClawQL runtime runs 29% more agents”: our ClawQL arm is a history harness (`DensityConversationRuntime` append path), not the full durable/MCP stack. Infinity’s arm runs the real `agent_scale` loop. If you want a fuller ClawQL arm for a fairer runtime comparison, we would welcome that design from you.

Fit quality used the same gate both sides: lastFit turn-latency p50 and p99 within **2×** of a low-N (2 500) baseline (within-system ratios only — Infinity p99 ~1.04×, ClawQL ~1.69×). Absolute turn ms are not cross-comparable and we do not quote them that way.

**Tuning we want your view on**

- ClawQL required `--expose-gc --max-old-space-size=8192` plus multi-pass `gc()` between waves.
- Infinity stock `agent_scale` used glibc malloc + `malloc_trim(0)` between waves; no jemalloc/mimalloc env.

Should a fair 8 GiB density operator set an allocator/heap analog to `--max-old-space-size=8192` on the Infinity side? If yes, which knobs and defaults would you want quoted next to the 75k@8 GB line?

**Host (disclosed)**

KVM guest, 4 vCPU, `Intel(R) Xeon(R) Processor` from `/proc/cpuinfo` (GenuineIntel family 6, model 207, stepping 2 @ 2400 MHz — **likely** Emerald Rapids; guest cannot confirm SKU). ~15.6 GiB RAM. DMI `product_name` unavailable on this guest. Instance type unknown (no metadata endpoint).

Evidence + harness: `docs/benchmarks/program-density/infinity-on-pi/` in [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) (PR #1443). Criteria are frozen in the evidence JSON as `frozenCriteria`.

Happy to adjust the ClawQL arm, reclaim protocol, or allocator settings to whatever you consider a fair operator default, then re-measure on the same host before anyone promotes a density claim.

Thanks for the post and for inviting feedback —
[Name]

---

## Checklist before send

- [ ] Confirm PR #1443 tip has `frozenCriteria` + claim-scope wording
- [ ] Attach or link README + `evidence-*-fit-latency.json`
- [ ] Decide channel (GitHub issue on hydro-project/infinity, email, X/Twitter reply to the post, etc.)
- [ ] Sign with real name / ClawQL contact
