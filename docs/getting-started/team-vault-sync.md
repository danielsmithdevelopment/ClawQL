# Team vault sync (R2 / S3 / GCS)

How ClawQL keeps `CLAWQL_HOME/Memory/` durable across Cloud Agent VMs and laptops via object storage.

**Related:** [For teams](./getting-started-for-teams.md#team-vault-sync) · [Cloud Agent e2e + R2](./cloud-agent-e2e-r2-memory.md) · [Agent setup — iOS](./agent-setup.md#cursor-ios--cloud-agent) · MCP tool `memory_sync` in [mcp-tools.md](../mcp/mcp-tools.md)

---

## Defaults

| Setting | Default | Notes |
| ------- | ------- | ----- |
| Bucket | `clawql-team-vault` | Override with `CLAWQL_SYNC_BUCKET` / `sync.json` |
| Prefix | `teams/shared/` | Override with `CLAWQL_SYNC_PREFIX` |
| Include | `Memory/` | Relative paths under `CLAWQL_HOME` |
| Manifest key | `{prefix}.clawql/sync/manifest.v1.json` | Authoritative file index for pull/status |
| `CLAWQL_SYNC_AUTO` | **off** | Set `1` for debounced push after `memory_ingest` |
| `CLAWQL_SYNC_AUTO_PULL` | **off**, or **on when `CLAWQL_SYNC_AUTO=1`** | Explicit `0` always wins |
| `CLAWQL_SYNC_AUTO_PULL_ON_START` | **off**, or **on when `CLAWQL_SYNC_AUTO=1`** | Explicit `0` always wins |

Cloud Agent install (`.cursor/scripts/cloud-agent-install.sh`) writes all three auto flags to `1` in a new `clawql.env`, then runs `sync ensure` + `sync pull` when credentials exist.

---

## Manifest model (read this)

Sync does **not** treat “every object under the prefix” as the vault. It uses a single JSON **manifest**:

```text
r2://clawql-team-vault/teams/shared/.clawql/sync/manifest.v1.json
```

| Operation | Uses |
| --------- | ---- |
| `clawql sync pull` / `memory_sync` `pull` | Manifest entries → download |
| `clawql sync status` / `memory_sync` `statusBefore` | Local files vs manifest |
| `clawql sync push` / auto-push after ingest | Upload local changes, then rewrite manifest |

**`remoteCount` / “remote files” = manifest entries**, not the raw object count in the bucket. Orphan objects can remain in R2 if they were never (re)indexed.

### Push merges remote-only paths

After uploading local changes, push builds the new manifest with **`mergeManifestFiles`**:

1. Start from the **previous remote** manifest (keep remote-only paths).
2. Overlay **local** entries (local wins on the same path).

That prevents a **sparse** Cloud Agent vault (empty or nearly empty `Memory/`) from rewriting the team index down to a handful of notes while hundreds of Markdown objects remain in the bucket.

Prefer `memory_sync` `{ "direction": "auto" }` (pull then push) over push-only on ephemeral VMs.

---

## Recommended Cloud Agent secrets

| Secret | Purpose |
| ------ | ------- |
| `CLAWQL_HOME` | e.g. `/home/ubuntu/.ClawQL` |
| `CLAWQL_R2_ACCOUNT_ID` | Cloudflare account id |
| `CLAWQL_SYNC_ACCESS_KEY_ID` / `CLAWQL_SYNC_SECRET_ACCESS_KEY` | R2 S3 API keys |
| `CLAWQL_SYNC_BUCKET` | Optional; default `clawql-team-vault` |
| `CLAWQL_SYNC_PREFIX` | Optional; default `teams/shared/` |
| `CLAWQL_SYNC_AUTO=1` | Debounced push after ingest |
| `CLAWQL_SYNC_AUTO_PULL=1` | Pull before recall (also implied by `AUTO=1`) |
| `CLAWQL_SYNC_AUTO_PULL_ON_START=1` | Pull at MCP start (also implied by `AUTO=1`) |

If you enable **`CLAWQL_SYNC_AUTO=1`**, leave startup pull enabled (default when unset). Only set `CLAWQL_SYNC_AUTO_PULL_ON_START=0` when you intentionally skip hydration.

---

## Session workflow

1. **Start** — startup pull (auto or `memory_sync` `{ "direction": "pull" }`). Confirm `memory_recall` `scannedFiles` is in the expected hundreds for a full team vault, not ~10.
2. **Work** — `memory_recall` → tools → `memory_ingest`.
3. **End** — `memory_sync` `{ "direction": "auto" }` so the next VM sees new notes.

---

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `sync status` / `memory_sync` show ~12 remote files but the bucket has ~400 objects | Manifest truncated (historical sparse push before merge) or never rebuilt | Rebuild manifest from object listing (below); upgrade to a build with `mergeManifestFiles` |
| `memory_recall` `scannedFiles` tiny on a new VM | Pull never ran or credentials missing | Set sync secrets; `memory_sync` `{ "direction": "pull" }` or enable `CLAWQL_SYNC_AUTO_PULL_ON_START` |
| Push after empty local vault | Pre-merge ClawQL rewrote manifest from local only | Upgrade; restore via rebuild; keep pull-on-start with auto-push |
| `Sync bucket not configured` | No `sync.json` | `clawql sync ensure --yes` or `sync init` |

### Rebuild a truncated manifest (operator)

When objects exist under `{prefix}Memory/` but the manifest lists far fewer files:

1. List objects under the sync prefix (S3-compatible API against R2/S3/GCS).
2. Download every `Memory/**` object into `CLAWQL_HOME`.
3. Rebuild `manifest.v1.json` from the local `Memory/` tree (sha256 + size + mtimeMs per relative path).
4. Upload the manifest to `{prefix}.clawql/sync/manifest.v1.json`.
5. Verify: `clawql sync status` → local ≈ remote ≈ expected note count; `memory_recall` → `scannedFiles` matches.

Until that rebuild, `memory_sync` pull alone cannot “discover” orphan objects — it only reads the manifest.

---

## CLI vs MCP

| Surface | Commands / tool |
| ------- | --------------- |
| CLI | `clawql sync init \| ensure \| push \| pull \| status` |
| MCP | `memory_sync` (`direction`: `auto` \| `pull` \| `push`) |

On Cloud Agents prefer **`memory_sync`**. Shell CLI needs a built `dist/` (`npm run build` / install finished).
