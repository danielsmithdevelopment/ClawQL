# Cloudflare Multi-Turn Gateway Benchmark: Spec

Oct 13, 2026 · @Daniel

## Goal

**Measure what each MCP gateway costs an agent on a real API: the Cloudflare v4 spec, one 12-step zone audit, 3 interleaved runs of 10,000 sessions per arm.** Cloudflare popularized code mode and ships its own code-mode server for this API, which makes it the fairest real-world test bed available.

The board will support these claims, and only these:

- **Tokens per session:** input tokens and the code the model writes, broken down so every total can be rebuilt.
- **Task success:** scripted checks on every step, plus a smaller real-model run.
- **Latency:** per call and per session, with real Cloudflare latency injected so the numbers reflect a real deployment.
- **Memory:** process-tree RSS and anonymous memory under load.
- **Full-spec feasibility:** which arms can expose all 2,500+ endpoints within a model's context at all.

It makes no claims about live API performance, and no claims about writes beyond producing a gated proposal.

## Safety and cost

**Nothing in this benchmark writes to Cloudflare, and after a one-time recording nothing contacts Cloudflare at all.**

- **Record with a read-only API token.** Create it with Read permission groups only: zones, zone settings, DNS, Workers scripts, R2 buckets, account settings and firewall rules. The recorder then cannot write, even by mistake.
- **The recording is a few dozen read calls, made once.** It stays well inside rate limits and is effectively free. List R2 buckets, but not R2 object contents, since some R2 operations are billable.
- **All benchmark traffic goes to the local mock** that replays the recordings. The workflow's change step only produces a gated proposal, which never leaves the harness.
- **No credentials in the fixture.** Strip account IDs, emails and tokens from recordings, replacing them with consistent fake values, before anything is committed.

## Arms and catalogs

**Six arms run against two catalogs: the full Cloudflare v4 spec, which only search-based arms can load, and a curated subset every arm can run.**

Cloudflare documents what exposing the whole API natively costs: 2,594 tools at about 1,170,000 tokens with full schemas, or about 244,000 with required parameters only, against about 1,000 tokens for its two-tool code-mode server ([Cloudflare docs](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)). Pass-through aggregators therefore cannot run the full spec within any model's context. The board reports that as a finding rather than a gap.

| Arm | Transport | Full spec | Curated subset | Notes |
| --- | --- | --- | --- | --- |
| ClawQL, default | Streamable HTTP | Yes | Yes | Search then execute, SQLite catalog on |
| ClawQL, known-op | Streamable HTTP | Yes | Yes | Execute by ID; steady-state mode |
| [Cloudflare code-mode server](https://github.com/cloudflare/mcp) | Streamable HTTP | Yes | Yes | Self-hosted if possible; otherwise tokens only, no latency |
| Executor v2 | Streamable HTTP | Yes | Yes | Record the exact beta version |
| MCPJungle | Streamable HTTP | No | Yes | Fronts a REST-to-MCP server; measure the process tree |
| agentgateway | Streamable HTTP | No | Yes | Same REST-to-MCP server as MCPJungle |

A no-gateway baseline runs on the curated subset only: all subset tool definitions in context, raw responses back.

**The curated subset** is the operations the workflow calls plus their nearest neighbors in the same product areas, about 60 in total. **Frozen** in [`curated-subset.json`](./curated-subset.json) (`frozenAt: 2026-10-14`). Do not retune after the first published run.

Record every arm's version, commit and runtime flags on the board. All arms use Streamable HTTP so latency compares like with like.

## Fixture: record once, replay forever

**Every arm reads byte-identical responses from one isolated mock that replays a single recording of the test account.**

1. **Record** each read the workflow makes, with the read-only token: method, path, query, status, headers and body. Record each call's real latency too, a few samples per endpoint. Script: `scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs`.
2. **Sanitize:** replace account IDs, zone IDs, emails and any tokens with consistent fake values (`lib/sanitize.mjs`).
3. **Scale, if the account is sparse,** and label it (`lib/scale-dns.mjs`). Keep an unscaled run as well.
4. **Replay** through `mock/cloudflare-replay-mock.mjs` on its own core.
5. **Inject latency** with `MT_UPSTREAM_LATENCY=recorded` on a second board.

Until a live recording exists, the repo ships [`recording.synthetic.json`](../../scripts/benchmarks/cloudflare-multiturn/fixtures/recording.synthetic.json) labeled **"real schemas, synthetic content"** (see [`MANIFEST.json`](./MANIFEST.json)).

## The workflow: a 12-step zone audit

**Eleven reads and one gated proposal.** Scripted checks: `lib/success-checks.mjs`.

1. **List zones** → audit zone ID  
2. **Zone details** → status + plan name  
3. **SSL/TLS mode** → setting value  
4. **List DNS records** → count of A records  
5. **A records at a given IP** → names  
6. **Which of those are not proxied** → unproxied names  
7. **List Workers scripts** → script names  
8. **One script's settings** → compatibility date  
9. **Zone Worker routes** → route for that script  
10. **List R2 buckets** → names + creation dates  
11. **Custom firewall rules** → count of enabled rules  
12. **Propose proxy on** for one unproxied record → gated proposal (`proxied: true`), never sent  

## Measurements and run protocol

**Three interleaved runs of 10,000 sessions per arm, on the isolated layout**, reporting every component so each total can be rebuilt (definition / discovery / result / model-written code tokens; calls; task success; latency p50/p99/p999; process-tree RSS + anonymous memory plateau).

**Protocol:** interleave arms; isolate mock/client/gateway cores; one tokenizer (`cl100k_base`); two boards (zero-latency vs recorded latency); publish code-mode scripts in `code-mode/published-scripts.mjs`.

## Real-model validation

**50 sessions per arm × two models**, same workflow and fixture, mock only. Hosted Cloudflare code-mode is out of this gate (live API / write risk). Peers: `clawql_known_op`, `clawql_program`, `executor_v2`.

### Pre-committed gate (freeze before the run — do not edit after seeing results)

These rules are committed **before** secrets are set and the gate runs. Blog / explainer claims must follow them; mixed outcomes may not be re-read in a flattering light.

#### Models and settings

| Knob | Pre-commit |
| --- | --- |
| Frontier model | **`gpt-4.1`** (OpenAI family) — env `CF_MT_MODEL_FRONTIER` must match this string for the dual-model claim |
| Small model | **`claude-haiku-4-5-20251001`** (Anthropic family) — env `CF_MT_MODEL_SMALL` must match; smaller, different family |
| Temperature | `0` for every arm |
| System prompt | Shared across arms (tool descriptions differ per gateway `listTools` only) |
| Sessions | `CF_MT_REAL_ITERS=50` per arm per model |

**Why these IDs (revised 2026-10-15, before any gate session):** `claude-3-5-haiku-20241022` is retired; Haiku 4.5 is the current small Anthropic peer. `gpt-4.1` stays the OpenAI frontier for this gate because the harness uses **Chat Completions + tools**; current GPT-6 flagships (`gpt-6.1-sol`, `gpt-6-astra`) require the **Responses API** for tool calling, and upgrading the transport mid-gate would change more than the model pin. `gpt-4.1` remains available on the API (removal scheduled 2027-01-14).

Serve both over one OpenAI-compatible base URL (`OPENAI_BASE_URL`, e.g. OpenRouter). The harness freezes these IDs into `precommit.models` before the first session and never overwrites them. A single-model override (`CF_MT_MODEL`) may smoke-test but **cannot** support the dual-model claim. Any other frontier/small pair is a different experiment — not this gate.

#### Ordering

**Interleave sessions across arms** within each model: for `i = 1..50`, run arm A session `i`, then arm B session `i`, then arm C session `i` (arm order fixed in `CF_MT_REAL_ARMS`). Provider drift during the run hits every arm equally. Do not run 50×A then 50×B then 50×C.

#### Comparison metrics (per model)

Primary head-to-head: **`clawql_known_op` vs `executor_v2`**, using:

| Metric | Definition |
| --- | --- |
| Median weighted tokens | Session `weighted = definition + observation + 5×code` (same code bucket as the scripted board: `where` / plan / JS) |
| p90 weighted tokens | 90th percentile of the same |
| Sessions over 10,000 | Count of sessions with `observation_tokens > 10_000` (`CF_MT_REAL_TOKEN_CEILING`) |
| Task success | Fraction of sessions that pass all 12 scripted checks |

`clawql_program` is reported for context; it does not decide the headline claim.

#### Claims each outcome allows

Let **win** on a model mean: known-op is strictly better on **median weighted** and **p90 weighted**, has **task success ≥** Executor, and has **sessions-over-ceiling ≤** Executor.

| Outcome | Allowed claim |
| --- | --- |
| Win on **both** frontier and small | “known-op beats code mode for real models” (this gate) |
| Win on exactly one model | Report that one model only — e.g. “wins on frontier; mixed/loss on small” — **not** the dual-model claim |
| Win on median but lose p90 (or vice versa) on a model | No win on that model; report the split metrics |
| Task success lower than Executor on a model | No win on that model, even if tokens look better |
| Any other mix | State the metrics; no stronger claim than the table allows |

The harness writes `precommit.verdict_rules` (copy of this section’s rule IDs) and `verdict` (computed only from those rules) into the result artifact. Do not hand-edit `verdict` after the run.

### Next lever after the dual-model gate: `clawql_routed`

Known-op’s lead (1,743 weighted vs default’s 17,731) is mostly **discovery**. Closing the first-session gap without leaking candidates to the model:

1. Agent calls `execute` with a **description** + `where` (no `operationId`).
2. ClawQL narrows candidates server-side (same search index; nothing returned).
3. **GLiNER2-Decide** picks among the top ~10 as a calibrated choice.
4. On calibrated confidence → run the op. Else → return top-three **compact signatures** (hundreds of tokens, not full search).

Constraints: auto-resolve **reads only** (writes still proposal-gated); missing args return the chosen op’s compact signature for one retry; re-prove routing on a held-out Cloudflare (description → op) set before trusting; measure GLiNER memory (prefer a shared decision service if RSS regresses). Prove with a `clawql_routed` board arm beside known-op and default.

## Fairness rules

- Label every mode and setting; invite maintainers to submit config fixes; version-scope claims; never mix zero-latency with recorded-latency or scripted with real-model in one table.
- Never mix real-model ClawQL with scripted Executor / Cloudflare token rows in one claim table.

## Open questions

See [`open-questions.md`](./open-questions.md).

## Sources

- [Cloudflare's own MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- [cloudflare/mcp](https://github.com/cloudflare/mcp)
