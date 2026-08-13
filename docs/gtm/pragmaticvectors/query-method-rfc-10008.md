---
canonical: https://pragmaticvectors.com/posts/query-method-rfc-10008/
slug: query-method-rfc-10008
meta-description: RFC 10008 formalizes the QUERY HTTP method — safe, idempotent, cacheable, with a request body. ClawQL’s DAOS transport and mcp-api-adapter have been working around its absence. Here’s where it fits.
meta-og:title: The HTTP method that should have existed years ago · PragmaticVectors
meta-og:url: https://pragmaticvectors.com/posts/query-method-rfc-10008/
---

Infrastructure · August 2026 · ~6 min read

# The HTTP method that should have existed years ago

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

- [Infrastructure](https://pragmaticvectors.com/tags/infrastructure)
- [HTTP](https://pragmaticvectors.com/tags/http)
- [Agents](https://pragmaticvectors.com/tags/agents)
- [Protocol Fabric](https://pragmaticvectors.com/tags/protocol-fabric)

---

[RFC 10008](https://www.rfc-editor.org/rfc/rfc10008) was published in June 2026. It defines the QUERY HTTP method — safe and idempotent like GET, cacheable like a read, and unlike GET it carries a request body.

Server ecosystems are already picking it up. Browser support is still landing through late 2026.

This is not a minor convenience. It closes a gap that has forced real architectural workarounds for complex read operations over HTTP. ClawQL’s [DAOS transport layer](https://docs.clawql.com/ouroboros/specification) (Protocol v2.1) and [`mcp-api-adapter`](https://docs.clawql.com/mcp/mcp-api-adapter) are concrete examples of that pain — and of where QUERY belongs once we adopt it deliberately.

A naming note up front: the docs live under `/ouroboros/specification`, but that page is the **DAOS coordination / transport specification**. [`clawql-ouroboros`](https://docs.clawql.com/ouroboros) is the evolutionary Seed → Wonder → Execute → Evaluate loop. The GET-safe / POST-confirm story is transport, not the evolutionary package.

---

## The problem QUERY solves

HTTP has always had a mismatch at the intersection of complex reads and request semantics.

GET is the right method for safe, idempotent, cacheable operations. Proxies can cache it. Clients can retry it. Prefetchers and link scanners can hit it without consequences — and they will, whether you want them to or not.

But GET cannot carry a structured body. The moment a query needs nested filters, multi-field predicates, or a typed schema, the workarounds are all bad:

**Stuff parameters into the URL.** Works until you hit length limits. Nesting JSON into query strings is ugly, and the URL becomes opaque to caching infrastructure that expected readable keys.

**Use POST.** Solves the body problem and throws away the safety semantics. POST is not idempotent. POST is not normally cacheable the way a read is. Security tooling, retries, and intermediaries treat it as a write. A read expressed as POST is a lie to the HTTP layer.

**Base64URL-encode the body into a query parameter.** This is what the DAOS transport **advanced tier** does for structured arguments that do not fit flat named fields. It works. It is not pretty.

---

## What DAOS transport has been working around

ClawQL’s [DAOS coordination layer specification](https://docs.clawql.com/ouroboros/specification) (Part I — transport) puts almost everything non-consequential on GET on purpose.

Link scanners, email security filters, browser prefetchers, and chat link-preview bots all assume GET is safe to dereference without a human deciding to. The protocol depends on that property: an agent or operator should be able to copy any link out of a conversation and paste it into a browser, with nothing irreversible happening as a result.

So the design splits methods hard:

- **Safe tools** execute immediately on GET.
- **High-impact tools** (`external_write`, `destructive`, `financial`) stage over GET — writing an inert `PENDING_ACTIONS` record and returning an `approval_url` — then execute only on POST.
- **Cancel** stays on GET: cancelling can only reduce risk.

That two-phase pattern is not “Ouroboros memory.” It is gateway transport design. The shipped cousin today is the payments HATEOAS flow (`*_stage` / `*_confirm` with `approval_url`). Full gateway PEP with ActionType two-phase commit is still on the DAOS build plan (P0-B).

The awkwardness shows up on the **advanced tier**, when tool arguments are too structured for semicolon-delimited query fields:

```text
GET /tool/read_session
  ?session=…
  &payload=eyJhZ2VudCI6InJlc2VhcmNoZXIiLCJzdW1tYXJ5IjoiLi4uIn0
  &sig=…
```

That Base64URL blob is ordinary JSON. A perfectly reasonable structured payload expressed as opaque URL text because HTTP had no safe method that expected a body.

QUERY is the missing primitive for that class of request: still safe and idempotent, still a read from the infrastructure’s point of view, with the filter or argument document in the body where it belongs.

---

## Where the same gap shows up in Protocol Fabric

Separately, [`mcp-api-adapter`](https://docs.clawql.com/mcp/mcp-api-adapter) wraps any MCP server and exposes OpenAPI, GraphQL, Streamable HTTP, gRPC, gen-cli, WebSocket, and the planned QR and `/mcp-ui` surfaces.

On the OpenAPI surface today, **every tool is `POST /{toolName}`** with a JSON body — including read-only tools. That matches how many MCP HTTP transports already behave. It is also exactly the “read lying as POST” problem.

`memory_recall` with structured ontology filters is the clearest example. Over MCP it is already a JSON tool call — not a GET with query parameters:

```json
{
  "query": "matters with escrow and non-compete",
  "schema": "legal.Matter",
  "filters": {
    "escrowPct": { "gte": 10 },
    "nonCompeteMonths": { "gt": 18 }
  },
  "confidenceMinimum": "EXTRACTED"
}
```

Via the adapter’s REST on-ramp that becomes `POST /memory_recall` today, because the adapter has no safer body-carrying method to offer. The semantics are a read. The HTTP method says write. QUERY is the method those surfaces should grow when we map safe tools honestly.

---

## What adoption should look like (not what we claim today)

ClawQL does **not** ship HTTP QUERY yet. Treating the RFC as already wired into production would blur the same line we refuse to blur on benchmarks. The useful move is to name the insertion points before the browsers finish catching up.

**1. DAOS advanced-tier safe reads**  
Retire Base64URL-in-`payload=` for complex safe GETs where a body is the natural document. Prefer:

```http
QUERY /tool/read_session
Content-Type: application/json

{
  "session": "…",
  "agent": "researcher",
  "summary": "Completed lit review."
}
```

Keep simple standard-tier named query parameters on GET — they remain the zero-crypto path for agents that should not encode JSON.

**2. High-impact staging args**  
Staging stays non-executing. POST confirm stays the only irreversible step. QUERY can carry structured stage arguments without stuffing them into the URL; it does not replace confirmation. (RFC 10008 allows a safe method to create additional resources through which later steps proceed — the `approval_url` view is exactly that shape.)

**3. mcp-api-adapter OpenAPI / `/mcp-ui`**  
Classify tools: safe reads (`memory_recall`, `search`, `knowledge_search_onyx`, audit list/query, …) may advertise QUERY (and optionally GET for trivial cases); high-impact tools stay POST or stage→POST. When browsers support QUERY, `/mcp-ui` can prefer it for read-only forms and fall back to POST. Until then, server-to-server OpenAPI clients can lead.

**4. Do not confuse layers**  
`memory_recall` structured filters are an MCP tool contract. QUERY is an HTTP transport choice for exposing that contract. Ontology recall does not become “the QUERY protocol.” Transport honesty and retrieval correctness are separate wins that compose.

---

## The timing

Browser support arrives later in 2026. Server-side stacks are moving first — the usual pattern for new HTTP methods. ClawQL’s server-facing surfaces (adapter OpenAPI, gateway PEP when P0-B lands, agent-to-agent HATEOAS) can adopt QUERY before the HTMX playground does. `/mcp-ui` follows when the browser implementation is real.

Within a year, “safe method with a body” should stop being a design essay topic and start being an ordinary OpenAPI `query` operation.

---

When a production architecture has worked around a missing primitive long enough that the workaround is written into the specification, and then the RFC that names the primitive lands, it feels less like a new feature and more like the infrastructure catching up to what the design always needed.

DAOS transport’s GET-everywhere-safe / POST-only-when-irreversible split exists because HTTP did not have QUERY. mcp-api-adapter’s `POST /memory_recall` exists for the same reason on a different surface. Now the method exists. The workarounds can retire cleanly — when we choose to retire them — and the semantics that were always intended become the semantics the wire actually expresses.

---

_Related: [DAOS coordination / transport specification](https://docs.clawql.com/ouroboros/specification) · [Protocol reference (v2.1)](https://docs.clawql.com/reference/protocol) · [mcp-api-adapter](https://docs.clawql.com/mcp/mcp-api-adapter) · [memory_recall structured filters](https://docs.clawql.com/specs/memory/memory-recall-structured-filter) · [RFC 10008](https://www.rfc-editor.org/rfc/rfc10008)_
