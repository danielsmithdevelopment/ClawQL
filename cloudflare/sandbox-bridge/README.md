# ClawQL sandbox bridge (Cloudflare Worker)

The [Sandbox SDK](https://developers.cloudflare.com/sandbox/) runs **inside Workers** with a container binding. The Node-based `clawql-mcp` server cannot load `@cloudflare/sandbox` directly, so this Worker exposes a small **POST `/exec`** API that the MCP tools **`code`** and **`sandbox_exec`** call using HTTP.

## Deploy

1. Install deps (Docker must be running for `wrangler deploy`):

   ```bash
   cd cloudflare/sandbox-bridge
   npm install
   ```

2. Set the shared secret (use the same value as **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** on the machine running ClawQL MCP):

   ```bash
   npx wrangler secret put BRIDGE_SECRET
   ```

3. Deploy:

   ```bash
   npm run deploy
   ```

4. Copy the **`*.workers.dev`** origin and set on the MCP host:

   - **`CLAWQL_SANDBOX_BRIDGE_URL`** — e.g. `https://clawql-sandbox-bridge.<your-subdomain>.workers.dev`
   - **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** — same string as `BRIDGE_SECRET`

Optional:

- **`CLAWQL_CLOUDFLARE_ACCOUNT_ID`** — sent as `CF-Account-ID` on bridge requests (logging / future use).
- **`CLAWQL_SANDBOX_PERSISTENCE_MODE`** — default `session` | `ephemeral` | `persistent` for MCP calls.

## Request shape

`POST /exec` with `Authorization: Bearer <BRIDGE_SECRET>` and JSON body:

```json
{
  "code": "print(2+2)",
  "language": "python",
  "sessionId": "my-thread",
  "persistenceMode": "session"
}
```

`language`: `python` | `javascript` | `shell`. Code is written under `/workspace` and executed with `python3`, `node`, or `sh`.

## Local dev

```bash
npm run dev
```

Use `wrangler` vars for `BRIDGE_SECRET` during development (do not commit secrets). First container build can take a few minutes.
