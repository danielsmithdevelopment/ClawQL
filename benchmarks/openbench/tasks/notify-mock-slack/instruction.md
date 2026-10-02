# Notify mock Slack milestone

Post a completion message with ClawQL **`notify`** (OpenCode: `clawql_notify`).

## Steps

1. Call **`clawql_notify`** with:
   - `channel`: `C-OPENBENCH`
   - `text`: must include the exact marker `CLAWQL_NOTIFY_MARKER=nebula-55`
2. Write relative path `notify.json` from the tool result (and marker).

## Artifact

```json
{
  "ok": true,
  "channel": "C-OPENBENCH",
  "marker": "nebula-55",
  "source": "notify"
}
```

## Rules

- Ignore `decoy/`.
- Inventing `notify.json` without a real `clawql_notify` tool_use fails.
- Stop after writing `notify.json`.
