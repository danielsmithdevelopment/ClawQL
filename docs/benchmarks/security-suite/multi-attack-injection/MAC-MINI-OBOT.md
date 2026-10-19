# Obot on the Mac mini

Equal-arm multi-attack peer. Defaults are measured; best-config needs a live native webhook validation adapter.

## What stays the same

- Shared Obsidian-compatible `Memory/` vault (`vault-mcp`)
- Same twelve attacks
- Same fourteen benign cases
- Defaults (stock Obot) and best-config (Obot’s **own** webhook validation deny on `memory_ingest` — not a ClawQL deny-tools stand-in)

## Platform note

Record macOS in the result `platform` block. Every other measured arm ran on Linux. For pass/fail security outcomes the platform should not change anything; say so rather than leave readers to wonder.

**Docker Desktop’s Linux VM is fine** for this board. We measure whether attacks take effect, not speed or memory.

## Status (Mac mini push)

| Column | Status | Notes |
| ------ | ------ | ----- |
| **Defaults** | **Measured** | **12 of 12** attacks; **14 of 14** benign; recall **pass (15.00)**; unlabeled poison **yes**; `host_os=darwin`, `measured_on=mac_mini` |
| **Best-config** | **Pending** | Native create path found; adapter not live — not scored |

## One command (re-run / best-config)

```bash
cd /path/to/ClawQL
git checkout cursor/multi-attack-injection-f4ec   # or main after merge
npm run benchmark:multi-attack-injection:obot
npm run benchmark:multi-attack-injection         # merge into smoke board
```

Artifacts:

- `docs/benchmarks/security-suite/multi-attack-injection/peer-results/obot_default.json`
- `docs/benchmarks/security-suite/multi-attack-injection/peer-results/obot_best_config.json`

## Best-config (native webhook validation)

Obot does **not** call the filter webhook directly from those older `/api/mcp-filters` paths (they returned HTTP 403 on this build). The correct create API is:

```http
POST /api/mcp-webhook-validations
Authorization: Bearer <OBOT_BOOTSTRAP_TOKEN>
Content-Type: application/json

{
  "name": "mai-deny-memory-ingest",
  "url": "http://host.docker.internal:18796/webhook",
  "secret": "clawql-obot-filter-secret",
  "selectors": [
    { "method": "tools/call", "identifiers": ["memory_ingest"] }
  ]
}
```

That returned **HTTP 200** with `configured=false` on the Mac mini run: Obot wraps the webhook in a **containerized system MCP adapter**. Until that adapter is configured and actually intercepts `tools/call` / `memory_ingest`, attacks still effectuate (**12/12** on an honest remeasure). Keep the row **pending ≠ not_offered**. Do **not** attribute a deny-tools proxy.

Manual checklist if the harness still leaves best-config pending:

1. Confirm `obot-deny-memory-ingest-webhook.mjs` is listening (`/health` → 200)
2. Create/verify the webhook validation via API or Obot UI (URL `http://host.docker.internal:18796/webhook`)
3. Ensure the system MCP adapter for that validation is **configured/running**
4. Re-run with `OBOT_MCP_URL_DENY` set to the same mcp-connect URL as defaults
5. Only publish best-config when `attacks_effectuated` is **0** under that native path

## After Obot best-config lands

Scripted peer board is complete. Last step before publishing: `MAI_LIVE=1` real-model runner (including harder recall queries).
