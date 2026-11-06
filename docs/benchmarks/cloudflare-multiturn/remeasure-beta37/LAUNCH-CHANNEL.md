# Launch channel — what we measured

**Measured binary:** `executor@beta` → **2.0.0-beta.37** (2026-11-05).

| Registry / forge                            | Finding                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| npm `dist-tag latest`                       | **1.6.11** (Executor 1 stable)                                                                                              |
| npm `dist-tag beta`                         | **2.0.0-beta.37**                                                                                                           |
| GitHub Releases (UsefulSoftwareCo/executor) | Tip releases are **prerelease** `executor@2.0.0-beta.*`; no non-prerelease `2.0.0` found in recent pages                    |
| npm version string `2.0.0`                  | Exists as an older tarball (`RhysSullivan/executor.git` metadata) — **not** the current UsefulSoftwareCo stable on `latest` |

**Conclusion for artifacts:** today’s Executor 2 “launch” tip we can install is the **beta channel (β.37)**, not a stable `2.0.0` on `latest`. If a different tag is the official launch binary, remasure that and replace these artifacts.

## Single-client profile (harness suspicion)

Idle (excl. motel): ~**2.1 GB** RSS already (serve + resident workerd).  
Warm MCP `execute` on `http://127.0.0.1:4312/mcp`: ~**57–61 ms**.  
Cold execute after app ensure: ~**450 ms**.  
Per-call RSS delta: small (~6–43 MB). Endpoint is `/mcp` (not the dashboard). Tools list includes `execute`.

So GB memory is largely **baseline residency**, and single-op latency is fine — the harsh concurrency SLO board is about **multiplex / config**, which is why the invite asks for the recommended concurrent-HTTP setup before we treat the curve as product truth.
