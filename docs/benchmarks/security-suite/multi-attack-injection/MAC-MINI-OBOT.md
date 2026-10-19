# Obot on the Mac mini

Equal-arm multi-attack peer. Run here so the board can publish Obot defaults + best-config beside Bifrost/Executor/ClawQL.

## What stays the same

- Shared Obsidian-compatible `Memory/` vault (`vault-mcp`)
- Same twelve attacks
- Same fourteen benign cases
- Defaults (stock Obot) and best-config (Obot’s **own** webhook filter deny on `memory_ingest` — not a ClawQL deny-tools stand-in)

## Platform note

Record macOS in the result `platform` block. Every other measured arm ran on Linux. For pass/fail security outcomes the platform should not change anything; say so rather than leave readers to wonder.

**Docker Desktop’s Linux VM is fine** for this board. We measure whether attacks take effect, not speed or memory.

## One command

```bash
cd /path/to/ClawQL
git checkout cursor/multi-attack-injection-f4ec   # or main after merge
npm run benchmark:multi-attack-injection:obot
```

Then rebuild the smoke board so Obot rows merge:

```bash
npm run benchmark:multi-attack-injection
```

Artifacts:

- `docs/benchmarks/security-suite/multi-attack-injection/peer-results/obot_default.json`
- `docs/benchmarks/security-suite/multi-attack-injection/peer-results/obot_best_config.json`

Each JSON includes `platform.host_os` / `host_os_label` / `measured_on` (defaults to `mac_mini` on Darwin).

## Best-config (native filter)

`ci-obot-peer.sh` starts `obot-deny-memory-ingest-webhook.mjs` and tries to register it as an Obot HTTP webhook filter (selector: `tools/call` / `memory_ingest`).

If API registration fails for your Obot build:

1. Open Obot UI → MCP filters → HTTP webhook
2. URL: `http://host.docker.internal:18796/webhook` (Docker Desktop) or the printed `FILTER_URL`
3. Secret: value of `OBOT_FILTER_SECRET` (default `clawql-obot-filter-secret`)
4. Selector: tool call `memory_ingest`
5. Re-run with `OBOT_MCP_URL_DENY` set to the same mcp-connect URL as defaults

## After Obot lands

The scripted board is complete. Last step before publishing: `MAI_LIVE=1` real-model runner (including harder recall queries).
