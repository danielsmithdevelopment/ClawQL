# Host memory plateau — JSON `_streamMapping` + lean RSS

Gates and honesty notes for Streamable HTTP memory under sessionful load.

## Two separate problems

| #                 | Symptom                                                              | Cause class                                                                                                                                                | Status                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Climb**      | Anonymous ~200→~3444 MB over ~30k same-session JSON executes         | MCP SDK JSON mode orphans `_streamMapping` after `resolveJson` ([typescript-sdk#2559](https://github.com/modelcontextprotocol/typescript-sdk/issues/2559)) | **Fixed in host** via `pruneOrphanJsonStreamMappings` after each POST; PR gate + nightly + unit bound test                                          |
| **2. Lean floor** | Lean listen probe ~130 MB (Oct 15) → ~170–313 MB without lazy listen | Eager `clawql-payments` / memory-ONNX at Ready                                                                                                             | **Fixed on tip** — lazy listen + SQLite catalog OOP + `clawql-inference/keys`; Bun `--smol` lean ~**136 MB** anon (N=2k) |

Climb (#1) and lean (#2) are both on tip after `#1390` + lazy-listen restore. Peer gap (~99–102 MB MCPJungle/agentgateway) remains a further Bun density climb, not a Rust dataplane path (ADR 0016 Rejected).

## How the Oct 12 prune was lost

Not an SDK upgrade and not a silent refactor on `main`.

1. **First fix** landed as `c1dd488c7` (_fix(http): prune orphan JSON `_streamMapping`…_, 2026-10-12) on the **transport-matrix / HTTP perf side-branch lineage** (`cursor/clawql-transport-matrix-a621` → `http-p999` → …).
2. That commit (and the prune module) was **never merged to `main`**. `git merge-base --is-ancestor c1dd488c7 origin/main` fails; `main` never contained `src/http/prune-json-stream-mappings.ts`.
3. Published `@modelcontextprotocol/sdk` **1.32.1** (what the lockfile resolved under `^1.31.0`) still has the JSON-mode leak: `send()` calls `resolveJson` but only runs `stream.cleanup()` on the SSE branch (`webStandardStreamableHttp.js`). Upstream **main** cleaned completed requests; **v1.x** fix is open as [PR #2747](https://github.com/modelcontextprotocol/typescript-sdk/pull/2747).
4. Restoring the host prune on `main` (this branch) is therefore a **merge miss**, not a dependency bump that deleted ClawQL code.

Watch for: (a) future SDK upgrades that change private field names (`_streamMapping`, `_webStandardTransport`) and break the duck-typed prune; (b) refactors that drop the `finally` prune in `mcp-http-server.ts`. The bound unit test fails immediately for (b); upgrade checklists must re-run it for (a).

## Upstream (MCP TypeScript SDK)

| Item              | Link                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bug               | [typescript-sdk#2559](https://github.com/modelcontextprotocol/typescript-sdk/issues/2559) — _JSON-response-mode stream mappings never complete their lifecycle_ (open; labels `bug`, `v1`, `v2`) |
| v1.x fix PR       | [typescript-sdk#2747](https://github.com/modelcontextprotocol/typescript-sdk/pull/2747) — call `stream.cleanup()` after `resolveJson` + settle in-flight on close                                |
| ClawQL workaround | `src/http/prune-json-stream-mappings.ts` (private-field reach-in)                                                                                                                                |

Until a **published** SDK release includes the v1.x fix:

- Keep **`@modelcontextprotocol/sdk` pinned to `1.32.1`** (exact) in the host `package.json`.
- On any SDK bump: run `vitest run src/http/json-stream-mapping-bound.test.ts` and the memory plateau gate before merging.
- Prefer dropping the host prune only after confirming `_streamMapping.size === 0` after completed JSON POSTs on the new release (SDK’s own regression in #2747).

### Upstream note to post (when write access is available)

Comment on #2559 with production evidence:

> ClawQL (Bun `--smol` Streamable HTTP, `enableJsonResponse: true`, one reused session) saw Anonymous climb ~200→~3444 MB over ~30k `tools/call` executes on sdk@1.32.1. Host-side orphan prune of `_streamMapping` entries not referenced by `_requestToStreamMapping` plateaus the board. Please land #2747 on a published v1.x tag so integrators can drop private-field workarounds. Bound regression: after N completed sessionful JSON POSTs, `_streamMapping.size` must stay ≪ N (ideally 0).

## Gates

| Gate                | When                                            | Load                             | Rule                                                                    |
| ------------------- | ----------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **Unit bound**      | Every PR / `vitest`                             | ~300 `tools/list` on one session | `stream_mapping_entries` ≤ 4 via `CLAWQL_BENCH_STATS=1` `/healthz`      |
| **PR plateau**      | `memory-plateau.yml` on PR/push (path-filtered) | 2 000 JSON executes              | slope `(last−first)/first` ≤ 0.35 and anon ≤ 450 MB                     |
| **Nightly plateau** | `memory-plateau.yml` schedule                   | **30 000** JSON executes         | same slope/ceiling rule — catches slow leaks the short PR gate can hide |

```bash
# Local PR-shaped gate
npm run build && MEM_GATE_ITERS=2000 npm run gate:memory-plateau

# Local nightly-shaped
npm run build && MEM_GATE_ITERS=30000 MEM_GATE_MAX_MB=450 npm run gate:memory-plateau

# Bound unit only
npx vitest run src/http/json-stream-mapping-bound.test.ts
```

Bench stats on `/healthz` (opt-in): `CLAWQL_BENCH_STATS=1` → `stream_mapping_entries`, `request_to_stream_entries`.

## Lean floor (restored)

Separate from `_streamMapping` climb:

- **Oct 15 board / heap A/B:** Bun `--smol` ~**130 MB**, Node 256 ~**132 MB** ([measured-defaults](./measured-defaults.md)).
- **Tip without lazy listen:** ~**170–313 MB** (eager payments + pgvector/ONNX at Ready).
- **Tip after lazy listen + catalog OOP (#1398):** Bun `--smol` equal-arm ~**138 MB** anon ([catalog-on N=2k](./heap-vs-anon-bun-smol-catalog-on-n2k.json) on remasure branch; ~145 MB catalog-off).
- **Tip after `clawql-inference/keys` (Ready skips full inference barrel):** Bun `--smol` equal-arm ~**136.2 MB** anon median ([keys + catalog-on](./heap-vs-anon-bun-smol-keys-catalog-on-n2k.json); [catalog-off](./heap-vs-anon-bun-smol-keys-catalog-off-n2k.json) ~134 MB — N=2k noise band). ESM `keys` entry is an 8 KB chunk (no payments/openai/routing).
- **Remasure:** `BUN_RUNTIME=1 BUN_SMOL=1 N=2000 npm run benchmark:heap-vs-anon-plateau`
- **Next density:** Deeper `clawql-api` lazy graph (grpc/graphql/swagger off Ready) + thin tools barrel to close ~34–37 MB toward peers (~99–102 MB).

See also vault notes: [[Bun JSON streamMapping memory climb fixed]], [[Bun smol lean board 130MB anon plateau config]], [[Density baseline post-prune stalls and lean floor]], [[Bun density peer climb tip levers after 1390]].
