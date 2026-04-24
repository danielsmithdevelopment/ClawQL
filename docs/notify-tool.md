# Slack `notify` MCP tool

The optional **`notify`** tool sends messages to Slack using **`chat.postMessage`**. It exists so agents and workflows can emit **high-signal completion signals** (batch done, deploy finished, policy check failed) without hand-authoring **`execute("chat_postMessage", …)`** every time.

**Tracking:** [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77) · Implementation: [`src/tools.ts`](../src/tools.ts) (`handleNotifyToolInput`, `SLACK_NOTIFY_OPERATION_ID`) · Full MCP matrix: **[mcp-tools.md](mcp-tools.md)**.

---

## `notify` vs `execute`

|                       | **`notify`**                                                 | **`execute("chat_postMessage", …)`**                                                                                                                                |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registration**      | Only when **`CLAWQL_ENABLE_NOTIFY=1`**                       | Always (core tool)                                                                                                                                                  |
| **Token check**       | Fails fast if no Slack auth headers                          | Upstream returns Slack error                                                                                                                                        |
| **Slack `ok: false`** | Returned as tool JSON **`{ "error": "…", "slack": { … } }`** | Default **`execute`** fields for **`chat_postMessage`** include **`error`** so codes survive projection; you still parse **`ok`** yourself if you omit **`notify`** |
| **Schema**            | Small, opinionated (`channel`, `text`, common optionals)     | Full OpenAPI parameters for **`chat_postMessage`**                                                                                                                  |

Use **`notify`** when the agent should **post a human-readable update** to a channel. Use **`execute`** when you need **other Slack methods** or **full control** over every field.

---

## Enabling the tool

1. Set **`CLAWQL_ENABLE_NOTIFY=1`** (or `true` / `yes`). Parsed with other flags in [`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts) ([#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)).
2. Ensure the **loaded spec** includes Slack’s **`chat_postMessage`** (OpenAPI operation id **`chat_postMessage`**). Typical setups:
   - **`CLAWQL_PROVIDER=slack`** (Slack only), or
   - **`CLAWQL_BUNDLED_PROVIDERS=…`** containing **`slack`**, or
   - Default **merged** preset that already includes **`slack`** (e.g. **`all-providers`** when you rely on the repo default merge).
3. Provide a **bot token** the same way **`execute`** authenticates the **`slack`** label — see [`src/auth-headers.ts`](../src/auth-headers.ts):
   - **`CLAWQL_SLACK_TOKEN`**, or **`SLACK_BOT_TOKEN`**, **`SLACK_TOKEN`**, **`CLAWQL_SLACK_BOT_TOKEN`**, or
   - **`CLAWQL_PROVIDER_AUTH_JSON`** with a **`slack`** key (string Bearer or header object).

**Minimum OAuth scope:** **`chat:write`**. Add scopes only if you also call other Slack methods via **`execute`**.

---

## Slack app quick setup

1. [Create a Slack app](https://api.slack.com/apps) (from scratch or from a manifest).
2. **OAuth & Permissions** → **Bot Token Scopes** → add **`chat:write`**.
3. **Install to Workspace** → copy **Bot User OAuth Token** (`xoxb-…`).
4. **Invite the bot** to the target channel (`/invite @YourBot`) _or_ use a **DM channel id** for direct messages.
5. Prefer **channel IDs** (`C…`, `G…`, `D…`) in automation — they are stable if the channel is renamed. You can copy them from Slack → channel details → bottom of the About tab, or from **`conversations.list`** via **`execute`**.

---

## Tool parameters (reference)

Required: **`channel`**, **`text`**.

Optional (passed through to Slack when set): **`thread_ts`**, **`blocks`**, **`attachments`**, **`username`**, **`icon_emoji`**, **`icon_url`**, **`mrkdwn`**, **`unfurl_links`**, **`unfurl_media`**, **`reply_broadcast`**, **`parse`**, **`link_names`**, **`as_user`**, **`fields`**.

- **`blocks`** and **`attachments`** must be **JSON strings** (the Slack Web OpenAPI models them as form fields, not nested objects in the MCP schema).
- **`fields`**: same meaning as **`execute`** — restrict top-level keys in the JSON response. Defaults for this operation are **`ok`**, **`channel`**, **`ts`**, **`message`** when omitted on the internal **`execute`** path.

---

## Examples

### 1. Minimal “job done” message

MCP tool input:

```json
{
  "channel": "C0123456789",
  "text": "✅ Q1 invoice import finished — 14 files archived."
}
```

Typical trimmed success body:

```json
{
  "ok": true,
  "channel": "C0123456789",
  "ts": "1713898123.000200",
  "message": { "…": "…" }
}
```

### 2. Channel name + mrkdwn links

Slack accepts **`#channel-name`** for public channels the bot can see:

```json
{
  "channel": "#releases",
  "text": "*Deploy* succeeded for `v4.0.0`.\n• Image: `ghcr.io/org/clawql-mcp:4.0.0`\n• Runbook: <https://wiki.example/clawql-release|Confluence>"
}
```

### 3. Thread reply (use parent message `ts`)

```json
{
  "channel": "C0123456789",
  "thread_ts": "1713898000.000100",
  "text": "Step 3/3: Paperless import complete — doc id `5102`."
}
```

### 4. Workflow summary with placeholders for Onyx / Paperless

```json
{
  "channel": "#finance",
  "text": "Batch *Q1-2026-invoices* complete.\n• Paperless: <https://paperless.example/documents/5102/detail|document 5102>\n• Policy chunks: see Onyx citations in the agent trace.\n• Open questions: 3 GitHub issues filed under `finance-review`."
}
```

Replace URLs with your real Paperless base URL and issue tracker links.

### 5. Narrow response with `fields`

```json
{
  "channel": "C0123456789",
  "text": "Ping from ClawQL smoke test.",
  "fields": ["ok", "ts"]
}
```

### 6. Block Kit (`blocks` as a JSON string)

```json
{
  "channel": "#alerts",
  "text": "Synthetic check failed",
  "blocks": "[{\"type\":\"header\",\"text\":{\"type\":\"plain_text\",\"text\":\"Check failed\"}},{\"type\":\"section\",\"text\":{\"type\":\"mrkdwn\",\"text\":\"*Endpoint* `https://api.example/health` returned *500*.\"}}]"
}
```

Validate JSON in a linter before sending; a parse error on Slack’s side will surface as **`ok: false`** (see below).

---

## Errors you will see before HTTP

| JSON `error` (conceptual)                    | Cause                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Slack bot token missing…`                   | No token resolved for **`slack`** — set env vars or **`CLAWQL_PROVIDER_AUTH_JSON`**.                          |
| `channel and text are required…`             | Empty **`channel`** or **`text`**.                                                                            |
| `Loaded spec has no Slack chat_postMessage…` | Current **`CLAWQL_SPEC_PATH`**, **`CLAWQL_PROVIDER`**, or merge list does not include the bundled Slack spec. |

---

## Slack `ok: false` (HTTP 200)

Slack often returns **HTTP 200** with **`{"ok":false,"error":"channel_not_found"}`**. The **`notify`** tool detects **`ok: false`** and returns:

```json
{
  "error": "channel_not_found",
  "slack": {
    "ok": false,
    "error": "channel_not_found"
  }
}
```

Common **`error`** codes: **`not_in_channel`** (invite the bot), **`invalid_auth`**, **`token_revoked`**, **`is_archived`**, **`msg_too_long`**. See [Slack Web API errors](https://api.slack.com/methods/chat.postMessage#errors).

---

## Cursor / Claude Desktop (stdio)

Add the flag next to your other ClawQL env vars. Example fragment:

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-y", "clawql-mcp"],
      "env": {
        "CLAWQL_ENABLE_NOTIFY": "1",
        "CLAWQL_SLACK_TOKEN": "xoxb-your-bot-token",
        "CLAWQL_OBSIDIAN_VAULT_PATH": "/path/to/vault"
      }
    }
  }
}
```

If you use a **minimal spec** without Slack, either add **`CLAWQL_PROVIDER=slack`** for Slack-only, or use a merge that includes **`slack`**.

---

## Kubernetes (Helm)

The chart exposes **`enableNotify`** → **`CLAWQL_ENABLE_NOTIFY=1`**. Set the token via **`extraEnv`** or **`envFromSecret`** (do not commit tokens to git). See **[helm.md](helm.md)** and **`charts/clawql-mcp/values.yaml`**.

---

## Testing

**Node 25 + full Slack OpenAPI:** building GraphQL from the **bundled** **`providers/slack/openapi.json`** can throw inside **`@omnigraph/json-schema`** (`Cannot set property input … only a getter`); **`execute` / `notify`** then use **REST** fallback. **`src/notify-graphql-path.test.ts`** uses a **minimal** Slack fixture so the GraphQL path stays testable on all supported Node versions. Upstream report template: **[`graphql-mesh-node-compatibility.md`](graphql-mesh-node-compatibility.md)**.

- **Automated:** **`src/clawql-notify.test.ts`** (handler guards, multi-spec REST path with mocked **`node-fetch`**, Slack **`ok:true` / `ok:false`**, **`thread_ts`** in form body) and **`src/server.test.ts`** (**`notify`** appears in **`listTools`** when **`CLAWQL_ENABLE_NOTIFY=1`**).
- **Follow-ups (GitHub):** [#136](https://github.com/danielsmithdevelopment/ClawQL/issues/136)–[#140](https://github.com/danielsmithdevelopment/ClawQL/issues/140) — see **[notify-tool-test-backlog.md](notify-tool-test-backlog.md)** for titles and bodies.

---

## Related

- **[graphql-mesh-node-compatibility.md](graphql-mesh-node-compatibility.md)** — Node **25** vs full Slack OpenAPI / **`@omnigraph/json-schema`**, upstream issue template (**ardatan/graphql-mesh**).
- **[mcp-tools.md](mcp-tools.md)** — all MCP tools and the **`CLAWQL_ENABLE_*`** matrix.
- **[schedule-synthetic-checks.md](schedule-synthetic-checks.md)** — planned **`schedule`** actions pairing with **`notify`** on failures ([#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76)).
- **[deploy-k8s.md](deploy-k8s.md)** — multi-replica notes; **`notify`** calls Slack from whichever pod handles the tool call.
- **[README.md](../README.md)** — install and environment variable tables.
