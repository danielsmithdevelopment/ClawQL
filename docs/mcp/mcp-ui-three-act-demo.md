# Three-act demo — Protocol Fabric → `/mcp-ui` → WebMCP → flamegraph

**Status:** script locked · smoke gate before recording · August 2026

One demo that stitches the thread: wrap a site (WebMCP) → render a view that does not exist on the site today (`/mcp-ui`) → prove token cost with the flamegraph (Act 3).

---

## Fallback policy (record after off-camera rehearsal)

| Act           | Primary                                                                 | Guaranteed fallback                                                                                                                   |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 WebMCP      | Live `clawql.site.*` tools on clawql.com (or local `landing-page/demo`) | Skip CLI `sources add --kind webmcp` — **not implemented**; show browser `registerTool` in DevTools / agent host that supports WebMCP |
| 2 Custom view | Live `/mcp-ui/presets/agent-lab` (docs_* demo server)                  | `POST /mcp-ui/generate` `{"preset":"agent-lab"}` or catalog `search` + `memory_recall`                                                 |
| 3 Flamegraph  | Live `/mcp-ui/trace/:sessionId` from Act 2 correlation id               | **`/mcp-ui/trace/compare`** (built-in compressed vs fat) — always works, no inference store                                           |

**Rule:** rehearse full sequence off-camera twice. Record with live Act 3 only after two clean runs. Otherwise close on **`/mcp-ui/trace/compare`**.

---

## Act 1 — WebMCP source registration (~60s, setup not payoff)

**Goal:** Site exposes tools to the browser agent; audience sees plumbing, not magic.

1. Open clawql.com (prod) or local marketing site:
   ```bash
   cd landing-page/demo && npm install && npm run dev
   ```
2. In a WebMCP-capable browser / agent host, confirm tools registered:
   - `clawql.site.navigate` → `/pricing`, `/industries/lending`
   - `clawql.site.page_context`
3. **Do not** claim `clawql sources add --kind webmcp` — server-side WebMCP source kind is not shipped; WebMCP is **page-local** via `WebMcpRegister.tsx`.

**Pass:** navigate + page_context return sensible JSON.

**Known gap:** CDP lifecycle for WebMCP has not been stress-tested; treat Act 1 as shortest act.

---

## Act 2 — Custom `/mcp-ui` cross-reference (~2 min, “oh that’s useful”)

**Goal:** Pick an industry → computed tier / agent / package recommendations from data spread across pricing + industries + agent catalog — a view **not** on clawql.com today.

**Shipped UX:** `/mcp-ui/presets/agent-lab` → `/mcp-ui/custom/agent-lab` (Agent Lab).

**Also planned:** `/mcp-ui/custom/industry-fit` or template `industry_fit`:

- Input: industry slug (e.g. `lending`)
- Steps: `search` (ops) or static pulls from `landing-page/demo/src/lib/{pricing,industries,competitive-pricing}.ts`
- Output card: recommended gateway tier, IDP bundle, domain tools, agent skills links

**Primary (shipped — Agent Lab preset):** a view that does **not** exist on the docs site:

```bash
npm run build -w mcp-grpc-transport -w mcp-api-adapter
node examples/mcp-api-adapter/docs-agent-lab-server.mjs
# open http://127.0.0.1:8091/mcp-ui/presets/agent-lab
# POST start → /mcp-ui/custom/agent-lab (HTMX multi-step: search → routes → reveal → claim)
```

WebMCP Act 1 unlocks the on-page Agent Lab panel; Act 2 is the adapter-scaffolded
`/mcp-ui/presets/agent-lab` workflow (same narrative tools, different surface).

**Interim fallback (Core catalog):**

```bash
npm run build -w mcp-grpc-transport -w mcp-api-adapter
node examples/mcp-api-adapter/server.mjs
# POST /mcp-ui/generate {"preset":"agent-lab"}  # uses search + memory_recall when docs_* absent
```

**Pass:** audience reaction “that’s actually useful” — Act 1 feels justified.

---

## Act 3 — Flamegraph closer (~90s)

**Goal:** Picture beats claim — “this looks like compressed, not fat.”

**Reference visual grammar (lock this):** always close on the **side-by-side compare** page with **`focus=input`** (the default — do not add `?focus=all` in recording links). Model output is omitted from the ratio so reply length cannot inflate the compression claim. Prefer the same URL shape for built-in demos and live WebMCP sessions:

```text
/mcp-ui/trace/compare                              # demos (default focus=input)
/mcp-ui/trace/compare?left=<corrA>&right=<corrB>   # live sessions (same layout)
```

Catalog nav, CLI log lines, and bare `/trace/compare` links all resolve to `focus=input` unless `?focus=all` is explicit.

### Primary (live WebMCP / Act 2 sessions)

Run the same task twice (or two correlation ids): compressed tool projection vs fat dumps. Then:

```
/mcp-ui/trace/compare?left=<compressedCorrId>&right=<fatCorrId>
```

Requires `listTraceCalls` wired to `clawql-inference` (`MCP_API_ADAPTER_INFERENCE_TRACE=1` + shared store). See [`mcp-ui.md`](./mcp-ui.md) §5b, `examples/mcp-api-adapter/clawql-with-trace.mjs`, and `scripts/live-trace-compare-demo.mjs`.

Single-session deep link (optional, not the closer): `/mcp-ui/trace/<correlationId>`.

### Fallback (guaranteed — use for recording until live is proven)

```
/mcp-ui/trace/compare
```

Side-by-side **demo-compressed** vs **demo-fat** on **shared input scale** (same page, same `focus=input` default):

- Left: balanced input stack
- Right: **tool result dominates** (orange)
- Callout: fat **input** is N× compressed; tool result % of **input**

Single-session links: `/mcp-ui/trace/demo-compressed`, `/mcp-ui/trace/demo-fat`.

**Pass (2-second test):** fresh viewer identifies orange tool-result dominance on the right without reading tables — and cannot object that the model simply “rambled more.”

---

## Harness-bench / CI hook

Flamegraph JSON is the token instrumentation `harness-bench` lacks today:

```bash
# Adapter running on 8090
npm run build -w mcp-api-adapter
node examples/mcp-api-adapter/server.mjs &

node integrations/harness-bench/scripts/fetch-trace.mjs --compare
# exits 0 when fat tool_result ≥80% and ratio ≥5×

node integrations/harness-bench/scripts/fetch-trace.mjs demo-compressed
```

Wire into CI after adapter smoke job. Next: pass `correlationId` from harness runs when inference store records real model calls (stub bench today produces no traces).

**Slide tip:** `/mcp-ui/trace/compare` defaults to `focus=input` — model output is omitted from the ratio so divergent reply lengths cannot inflate compression claims. Use `?focus=all` only when you deliberately want outputs in the bars.

---

## Smoke gate checklist (like Harvey LAB task 001)

Run in order; note PASS/FAIL:

- [ ] **Act 1:** WebMCP tools visible / callable on marketing site
- [ ] **Act 2:** Custom `/mcp-ui` workflow returns useful cross-ref (or interim generate form)
- [ ] **Act 3a:** `/mcp-ui/trace/compare` — fat orange dominates at a glance
- [ ] **Act 3b:** `fetch-trace.mjs --compare` exits 0
- [ ] **Optional 3c:** Live session id 404 vs demo (confirms fallback path)

Two consecutive full passes off-camera → schedule recording.

---

## Related

- Flamegraph feature: [`mcp-ui.md`](./mcp-ui.md) §5b
- WebMCP client: `landing-page/demo/src/components/WebMcpRegister.tsx`
- Harness compare (structural, no tokens yet): `integrations/harness-bench/scripts/compare.mjs`
