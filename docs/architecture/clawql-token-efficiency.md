# How ClawQL Reduces Token Usage: A Layered Approach to Efficient Agent Architectures

Most discussions about LLM cost focus on the wrong variable. Teams swap models, tweak prompts, or negotiate bulk pricing — while their agent architecture quietly burns most of every context window on tool schemas the model never needed to see in the first place.

ClawQL addresses this at the systemic level, with multiple optimization layers operating at different points in the request/response lifecycle. Because each layer targets a different kind of token waste, their savings compound rather than overlap. The result is an agent framework that stays fast and cheap whether it's running a short script or a long multi-step reasoning session.

One thing worth stating up front: not all of these layers are equally easy to get. Some work automatically with zero configuration. Others require setup, and a couple only fully apply in specific execution environments. The headline efficiency numbers later in this document assume the full stack is configured — if you're only using the defaults, you're getting real savings, but not all of them. We'll be specific about which is which as we go.

## The Problem: API Surfaces Don't Fit in a Context Window

The standard approach to giving an AI agent access to tools (via the Model Context Protocol, or MCP) is to load a description of every available operation directly into the model's context window. For a small, single-purpose server, this is fine. For a real enterprise setup connecting to multiple providers, it isn't.

Consider three common providers bundled together:

| Provider     | Operations in Spec | Estimated Tokens (Full Spec) |
| ------------ | ------------------ | ---------------------------- |
| Google Cloud | 4,141              | ~84,000+                     |
| Cloudflare   | 2,697              | ~2,206,000+                  |
| Jira         | 336                | ~266,000+                    |
| **Combined** | **7,174**          | **~2,556,000+**              |

The Cloudflare figure here is measured directly from Cloudflare's full published OpenAPI specification, downloaded in April 2026. Cloudflare's own cited internal estimate for the same API surface, discussed below, comes in at roughly 1.17 million tokens — about half this number. That difference reflects scope rather than a discrepancy in method: a complete downloaded OpenAPI spec typically carries more verbose descriptions, examples, and edge-case endpoints than an internal estimate of the "useful" API surface, and full specs for the same API commonly vary by a factor of two or more depending on what generated them and how complete they are. Both numbers are real measurements of the same underlying problem; they just measured different artifacts.

At over 2.5 million tokens, this is far beyond what the large majority of production models in common use can hold in context. You couldn't load the basic tool definitions for most hosted frontier models today, let alone do any actual reasoning, on top of them — a handful of long-context outliers (open-weight models with very large advertised windows) could technically fit the raw token count, but reasoning over millions of tokens of unused tool schema is a different problem than fitting it, and one this architecture avoids needing to solve at all.

This isn't a theoretical concern — Cloudflare's own engineering team measured a similar problem and found that a naive full-spec approach to exposing their roughly 2,500-endpoint API would require on the order of 1.17 million tokens just for the tool definitions.

## Layer 1: Code Mode — The Foundation

This layer is always on and can't be turned off, because it's the architectural basis for everything else.

Instead of giving the model thousands of JSON tool schemas to choose from, ClawQL exposes exactly two tools: `search()` and `execute()`. The agent searches for the operations it needs, then writes code against a generated SDK to call them. The full API specifications stay on the server — the model never sees them directly.

The reasoning behind this is straightforward: large language models have seen enormous amounts of real TypeScript and JavaScript during training, but comparatively little of the deeply nested, bespoke JSON schemas that tool-calling APIs typically use. Letting the model write code plays to a strength it actually has, instead of asking it to navigate a format it rarely encountered.

This keeps the base tool-definition footprint at roughly 1,800 tokens, regardless of how large the underlying API surface is — whether that's 300 operations or 7,000.

| Provider     | Full Spec    | Via Code Mode | Reduction  |
| ------------ | ------------ | ------------- | ---------- |
| Google Cloud | ~84,400      | ~2,200        | ~97%       |
| Jira         | ~266,600     | ~900          | ~99.7%     |
| Cloudflare   | ~2,206,000   | ~2,400        | ~99.9%     |
| **Average**  | **~852,000** | **~1,800**    | **~99.8%** |

A typical task ends up using maybe 60 operations out of 7,000+ available — under 1% of the total surface. The other 99% never enters context at all.

A real caveat: this approach asks the model to write working code, not just fill in a JSON template. Frontier models (the largest, most capable models from major labs) handle this reliably. Smaller or less capable models may produce code with syntax errors or type mistakes that wouldn't happen with a simpler JSON-based tool call. If you're running this against a smaller model, test it on your actual workflows before relying on it — and know that falling back to traditional JSON tool-calling is always an option.

## Layer 2: Trimming What Comes Back

Code Mode reduces what goes into the model. This layer reduces what comes back — which matters because on every major model provider, output tokens cost more than input tokens, and a tool's response becomes part of the conversation history that gets reprocessed on every subsequent turn.

When an agent calls an API, the raw response is often a large, deeply nested JSON object full of fields the agent will never use — metadata, pagination info, internal IDs, nested objects three levels deep. ClawQL analyzes the code the agent just wrote to figure out which fields it actually depends on, and trims the response down to just those fields (plus anything needed as an intermediate value, even if not directly returned).

A concrete example — listing GKE clusters on Google Cloud:

Raw response (~421 tokens) includes the full cluster object: name, self-link, location, endpoint, version info, status, subnet, complete node pool configuration, and more.

Trimmed response (~76 tokens) includes just the name, status, endpoint, and self-link — an 82% reduction.

Across representative examples from Google Cloud, Jira, and Cloudflare, trimming typically cuts response size by somewhere around 80% on average, with the exact number depending heavily on how bloated the underlying API's response format is to begin with (Jira's response format, in particular, tends to be extremely verbose).

## Layer 3: Cutting Prose Filler

Layers 1 and 2 deal with structured data — code and API responses. This layer deals with the natural-language text the model wraps around that data.

Language models, especially when prompted conversationally, tend toward verbose, hedging language: "I'd be happy to help with that! Based on my analysis, it looks like the issue might possibly be related to…" None of that adds information. The actual content — what's wrong and what to do about it — is often a fraction of the response.

A terse-output mode strips this filler while leaving code blocks, file paths, identifiers, and configuration untouched. Compare:

"I would be absolutely happy to assist with that configuration issue! Based on my structural analysis of your active deployment codebase, it appears that the authentication middleware may be incorrectly handling the token object during handshakes. You should consider modifying the configuration block shown below…"

versus:

"Auth middleware mishandling token. Update config:"

The reduction varies a lot depending on how verbose the response would otherwise be — heavily-hedged responses can shrink by 80% or more, while already-terse responses might only shrink slightly. On average across typical developer-facing responses, this tends to cut prose volume by roughly half to two-thirds.

This is on by default and requires no configuration.

## Layer 4: Prompt Caching — Making Repetition Cheap

Most model providers offer prompt caching: if the beginning of your prompt (the "prefix") is identical to a previous request, the provider can reuse cached internal computation instead of reprocessing it from scratch. On Anthropic's API, for example, reading from a warm cache costs roughly 10% of the normal input token price.

The catch is that this only works if the prefix stays exactly the same between requests. In a typical unmanaged conversation, this rarely holds — tool outputs of varying size, prose that varies slightly each time, and growing conversation history all shift where the "stable part" ends, which breaks the cache before it can build up any benefit.

Layers 1 through 3 are what make this layer actually work in practice:

- Layer 1 keeps tool definitions at a fixed ~1,800 tokens — they never change size based on which APIs are available.
- Layer 2 means tool outputs entering history are small and consistently shaped, not multi-kilobyte blobs that vary wildly in size.
- Layer 3 keeps response text terse and consistent, rather than having prose length wander based on the model's mood.

Combined, these keep the early part of the conversation stable enough for caching to actually take hold. Once it does, an increasing fraction of the cost of each subsequent call comes from cheap cache reads rather than full-price input processing — and the longer a session runs, the bigger that fraction gets.

Setup for this layer is a one-time initialization step that installs the configuration needed to maintain a stable prefix and apply cache controls correctly.

## Layer 5: Skipping Repeated Work Entirely

Layer 4 makes repeated calls cheaper. This layer skips some calls entirely — for tasks the agent has, in effect, already done.

In any extended agent session, certain sub-tasks recur constantly: checking a deployment's status before making a change, looking up a ticket before updating it, listing records before modifying one. The surrounding conversation is different each time, so an exact-match cache won't catch this — but the intent of the request is often functionally identical.

The approach here is semantic caching: incoming requests are converted into a numerical representation (an embedding) and compared against previously cached requests. If a new request is similar enough to a previous one — above a similarity threshold — the cached result is returned without calling the model again at all.

```
Incoming Request → Extract Task Signature → Compute Embedding
                              ↓
                  Check Cache (similarity ≥ threshold?)
                  ↓                              ↓
              Cache Hit                     Cache Miss
            Return Result                Call Model, Cache Result
```

An honest note on this layer: how much this actually saves depends entirely on how repetitive your workload is. A pipeline that checks the same handful of statuses over and over will see a lot of cache hits. A workload where every request is genuinely novel will see very few, and the overhead of computing embeddings for every request might not be worth it in that case. There isn't a universal number to quote here — measure it on your own workload before assuming it's saving you anything significant, and turn it off if it isn't.

There's also an important safety rule: only read operations are cached. Anything that writes, updates, or deletes data always executes live — never from cache. And any write operation automatically invalidates cached reads that touch the same resource (updating a record invalidates cached "list records" results for that resource), so the agent doesn't act on stale information after making a change. For custom integrations where this invalidation logic isn't configured, the safe default is to exclude that integration from caching entirely — an agent making decisions based on outdated state is a correctness problem, not just a performance one.

## Layer 6: Compressing History in Long Sessions

Even with Layers 1–5 working well, a session that runs for hours will accumulate a long transcript — and at some point, the transcript itself becomes the dominant cost, separate from any individual exchange.

The fix is to periodically distill the message history into a compact structured summary — the key facts, decisions, and current state — and discard the raw transcript, keeping a full copy in cold storage in case it's needed later.

This works differently depending on where the agent is running:

In an environment ClawQL fully controls (a backend pipeline, for instance), this can happen automatically: when the conversation history crosses a size threshold, the older messages get distilled into a structured snapshot and replaced in the active context.

Inside a third-party client (like an IDE's built-in AI assistant), ClawQL doesn't have control over that client's context window management. In this case, the approach is preventive rather than corrective: the agent is instructed to offload working state (IDs, intermediate values, etc.) to external storage rather than letting it accumulate in the visible conversation. This slows down history growth but can't compress history that's already there — the client's own context management ultimately decides what happens to it.

This layer is off by default and needs to be explicitly enabled.

## Layer 7: Trimming the Final Prompt

This layer looks at the complete assembled prompt — system instructions, tool definitions, memory snapshot, and the current request — right before it's sent to the model, and removes lower-value tokens while trying to preserve meaning.

There's an important framing issue here. General-purpose prompt compression tools report compression ratios (often 3–8x) measured against raw, unoptimized prompts. But a prompt that's already been through Layers 1–6 is already much leaner than the kind of prompt those benchmarks start from. Applying this layer on top of an already-compressed prompt gets you a real but more modest additional reduction — realistically somewhere in the 20–40% range, not another 3–8x. If you've seen big compression numbers quoted for tools like this, that's the context they apply to, and it's not directly comparable to what you'd see applied here.

This layer requires direct control over the final prompt before it's sent, so it only works in environments ClawQL fully controls — not inside third-party clients. It's off by default.

## Layer 8: Routing Tasks to the Right Model

Not every step in a multi-step task needs the most capable (and most expensive) model. Checking a status, validating a schema, filtering a list, or writing a well-scoped piece of code don't need the same model as complex multi-step planning or synthesis.

This layer routes sub-tasks to the cheapest model capable of handling them, escalating to a more capable model only when the task actually warrants it. In a multi-agent setup, this naturally produces a tiered structure: fast, cheap models do broad exploration; larger models do careful validation; specialized models handle specific domains.

This is off by default and requires explicit configuration of routing rules.

## Beyond These Eight Layers

A few additional techniques are worth knowing about, separate from the layered architecture above, because they attack token waste from a different angle — at the point where the model generates its response, rather than before or after.

**Structured output constraints.** Instead of asking the model to respond in natural language and then cleaning up the prose afterward (Layer 3), you can constrain the model to produce output in a fixed schema from the start — JSON mode, or a defined tool-call format. This eliminates hedging and filler at the source rather than trimming it after generation, and for tasks with a well-defined output shape (extracting structured data, returning a decision plus a reason, etc.) this is usually a better first move than relying on terse-mode cleanup.

**Token budget signaling.** Telling the model explicitly how much space it has — "respond in under 100 words," "keep this under 500 tokens" — measurably reduces verbosity on most current models, particularly for open-ended explanatory tasks. This costs nothing to try and is worth using anywhere response length matters.

**Prefill.** For chat-style APIs, you can pre-populate the start of the model's response (for example, starting it with `{` to signal a JSON object is coming, or with a fixed greeting-free opener). This skips the few tokens a model often spends on preamble before getting to the actual content — a small saving per call, but one that adds up across a high-volume system.

None of these require the infrastructure the eight layers above do — they're prompt-level techniques you can apply today, and they compose well with everything else described here.

## Putting It Together

Each layer targets a different point in the request/response lifecycle:

- Layer 1 — tool definitions entering context
- Layer 2 — API response data entering context
- Layer 3 — natural-language filler wrapping responses
- Layer 4 — cost of repeated calls via provider-side caching
- Layer 5 — whether a call happens at all
- Layer 6 — growth of conversation history over time
- Layer 7 — final prompt size right before sending
- Layer 8 — which model handles which sub-task

Layers 1–3 are on by default and require no setup — most of the easy wins come from these alone. Layer 4 requires a one-time setup step. Layer 5 is on by default but its benefit depends heavily on your workload's repetitiveness. Layers 6–8 are off by default, require explicit configuration, and Layers 6–7 only reach their full potential in environments where the whole prompt-assembly pipeline is under your control — not inside third-party IDE integrations.

If you're only running the defaults, you're getting Layers 1–3 (and partial Layer 5) — which on their own represent the large majority of the total possible savings, since Layer 1 alone accounts for roughly 99% input reduction. The remaining layers are real, additive improvements for long-running or high-volume deployments, but they're opt-in for a reason: they require either setup work or specific deployment environments to pay off.

## Known Trade-offs

**Code Mode needs a capable model.** The savings are real, but the model is now writing code rather than picking from a list. Test this on your actual model before depending on it in production — and remember that traditional tool-calling remains available as a fallback.

**Semantic caching isn't free, and isn't universally beneficial.** It adds a small amount of latency on every request (computing the embedding) in exchange for sometimes skipping a model call entirely. Whether that trade is worth it depends entirely on how repetitive your workload is — measure before assuming.

**High-throughput deployments may need to offload the embedding computation.** If semantic caching's embedding step runs in the same process handling requests, it can become a bottleneck under heavy parallel load. An external embedding service solves this but adds operational complexity.

**Layers 6 and 7 can't do much inside third-party clients.** If you're building inside an IDE's AI integration rather than a backend you control, these layers shift from "compress what's there" to "slow down how fast it accumulates" — a real but smaller benefit.

**Layer 7's numbers depend on what you compare them to.** 20–40% additional reduction on an already-compressed prompt sounds less impressive than "8x compression," but it's the honest number for what this layer adds on top of Layers 1–6 — not a replacement for them.

**Model diversity matters more than model count in routing setups.** If Layer 8 just means "more small models doing the same kind of work," that's not the same as routing genuinely different kinds of sub-tasks to models suited for them.

## How This Compares to Published Benchmarks

Cloudflare's own measurements of a similar approach found roughly 99.9% input token reduction for their ~2,500-endpoint API, using the same basic methodology — comparing the full specification size against what actually enters context via a search-and-execute pattern. As noted earlier, that 1.17 million token figure reflects Cloudflare's own internal estimate of their API surface, while the figure used in this document's tables comes from a full downloaded OpenAPI specification, which tends to run larger; the two numbers measure related but not identical artifacts.

The input-side reduction percentages here (97–99.9% per provider, ~99.8% average across a larger and more varied set of providers) are directionally consistent with Cloudflare's published result and were measured the same way: full specification size against what survives a search-and-execute pattern. The difference is scope — that kind of measurement covers the input side only. Layers 2 through 8 here address everything else in the cost equation — output size, prose, cache reuse, repeated calls, history growth, final prompt size, and per-task model selection.

Token estimates throughout use a roughly 4-characters-per-token approximation, consistent with common tokenizer behavior for English text and code. Exact figures will vary by tokenizer and by the specific content involved.

---

_For the search/execute workflow, see [`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md). For platform context, see the [Vision & Roadmap document](../vision/clawql-vision-roadmap.md)._
