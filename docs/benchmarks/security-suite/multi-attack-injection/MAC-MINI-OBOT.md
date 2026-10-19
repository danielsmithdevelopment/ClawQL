# Obot on the Mac mini

Equal-arm multi-attack peer. Defaults are measured; best-config needs a **live** native deny, proven before the corpus runs.

## What stays the same

- Shared Obsidian-compatible `Memory/` vault (`vault-mcp`)
- Same twelve attacks
- Same fourteen benign cases
- Defaults (stock Obot) and best-config (Obot’s **own** webhook validation deny on `memory_ingest` — not a ClawQL deny-tools stand-in)

## Platform note

Record macOS in the result `platform` block. Every other measured arm ran on Linux. For pass/fail security outcomes the platform should not change anything; say so rather than leave readers to wonder.

**Docker Desktop’s Linux VM is fine** for this board. We measure whether attacks take effect, not speed or memory.

## Status (Mac mini)

| Column | Status | Notes |
| ------ | ------ | ----- |
| **Defaults** | **Measured** | **12 of 12** attacks; **14 of 14** benign; recall **pass (15.00)**; unlabeled poison **yes**; `host_os=darwin`, `measured_on=mac_mini` — matches Bifrost/Executor defaults |
| **Best-config** | **Pending** | Webhook validation API found; deny not yet proven active via precondition |

## One command

```bash
cd /path/to/ClawQL
git checkout cursor/multi-attack-injection-f4ec
npm run benchmark:multi-attack-injection:obot
npm run benchmark:multi-attack-injection
```

Artifacts:

- `peer-results/obot_default.json`
- `peer-results/obot_best_config.json` (includes `precondition` + `webhook_registration`)

## Best-config: precondition, then one run

Do **not** re-run the corpus until the effectuated count is 0. That looks like tuning toward a result. Separate setup from measurement:

1. **Precondition (outside the corpus).** Call `memory_ingest` once through Obot. If Obot allows it, the configuration is not active → leave the row `pending: configuration not active`. Record that probe in `precondition` on the results file.
2. **Once the deny is confirmed,** run the twelve attacks and fourteen benign cases **once**. Publish whatever comes out — including if some attacks still get through by another route. That is a real finding about Obot’s controls, not a setup failure.

Expect something like Bifrost/Executor best-config (**0 of 12** attacks, memory writes fail → around **9 of 14** benign). If Obot differs, publish that too. Then `MAI_LIVE=1`.

### Native API (Mac mini discovery)

Older `/api/mcp-filters` paths returned HTTP 403. Create with:

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

Obot wraps the webhook in a **containerized system MCP adapter**. HTTP 200 with `configured=false` is not enough — the precondition must see a refused `memory_ingest`.

### Checklist

1. `obot-deny-memory-ingest-webhook.mjs` healthy (`/health` → 200)
2. Webhook validation created (API or UI)
3. System MCP adapter for that validation running
4. **Precondition:** one direct `memory_ingest` refused (harness does this automatically)
5. One corpus run; commit the JSON as-is

## After Obot best-config is measured

Scripted peer board is complete. Last step before publishing: `MAI_LIVE=1` real-model runner (including harder recall queries).
