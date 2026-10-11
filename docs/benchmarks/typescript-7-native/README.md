# TypeScript 7 (Go native) — adopted

**Compiler:** `tsc` **7.0.2** via `@typescript/native` (`npm:typescript@^7.0.2`) — native Go ELF.  
**API (eslint / tsup dts):** `typescript` → `npm:@typescript/typescript6@^6.0.2` (classic `createProgram` API; TS7 has no stable programmatic API until 7.1).

```bash
npx tsc --version          # 7.0.2
node -e "console.log(require('typescript').version)"  # 6.0.x API package
```

## Spike timings (pre-adoption)

| Project | tsc 6.0.3 | tsc 7.0.2 | Speedup |
| --- | ---: | ---: | ---: |
| `clawql-core` `--noEmit` | ~2.3 s | ~0.29 s | ~7.7× |
| `clawql-api` `--noEmit` | ~4.0 s | ~0.65 s | ~6.1× |

Runtime latency/RSS is unchanged by the compiler — measure Node vs Bun separately after rebuild.
