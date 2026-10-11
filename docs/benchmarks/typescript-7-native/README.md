# TypeScript 7 (Go native) spike

**Status:** exploratory — repo still pins `typescript@^6.0.3` (JS `tsc`). Latest stable is **7.0.2** (native Go `tsc`).

## What TS7 is (and is not)

| Layer | Effect of TS7 |
| --- | --- |
| `tsc --noEmit` / CI typecheck | **8–12× faster** (measured ~8× on `clawql-core`) |
| Emitted JS / `dist/server.js` runtime | **No material change** — same language semantics as 6.0 |
| Bun vs Node equal-arm latency/RSS board | **Unaffected** — runtime binary, not compiler |

Do not expect TS7 to move gateway p50/p999. Use Bun (or native rewrite) for that.

## Measured (this VM, 2026-10-11)

Tooling: workspace `typescript@6.0.3` vs temp install `typescript@7.0.2` (`@typescript/typescript-linux-x64` ELF Go binary).

| Project | tsc 6.0.3 | tsc 7.0.2 | Speedup |
| --- | ---: | ---: | ---: |
| `packages/clawql-core` `--noEmit` (median of 3) | ~2269 ms | ~294 ms | **~7.7×** |
| `packages/clawql-api` `--noEmit` (median of 2; same 15 pre-existing errors) | ~3974 ms | ~651 ms | **~6.1×** |

`clawql-core` exited 0 on both. `clawql-api` error set matched (pre-existing test fixture strictness — not a TS7 regression).

## Upgrade path (recommended)

1. Keep **`typescript` → `@typescript/typescript6`** (JS API for `typescript-eslint` / tooling) until 7.1 stable API, **or** wait until the ecosystem follows 7.x peers.
2. Add **`@typescript/native`: `npm:typescript@^7.0.2`** and point CI `tsc --noEmit` at that binary.
3. Packages already emit via **tsup** — runtime builds need not switch on day one; CI typecheck is the payoff.

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

## Reproduce

```bash
npm install -D typescript@7.0.2   # or use /tmp side install
npx tsc --version                 # expect 7.0.2
npx tsc -p packages/clawql-core/tsconfig.json --noEmit
```
