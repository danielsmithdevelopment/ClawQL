# Team vault sync (R2 / S3 / GCS)

Share **`~/.ClawQL`** memory notes across your team via a centralized object-storage bucket. **Cloudflare R2 is the default** provider because Cloudflare is in the bundled default stack.

## What syncs

| Path | Shared |
|------|--------|
| `Memory/` | Yes — team Markdown notes for `memory_recall` |
| `sources/` + `sources.json` | Yes — custom integrations |
| `Dashboard/chats/` | Yes — optional agent chat threads |
| `pageindex.db.json` | Yes — PageIndex trees |
| `vault/providers.json` | **Never** — API secrets stay local |
| `memory.db` | No — rebuilt locally after pull |

## Quick start (R2)

1. Create an R2 bucket in Cloudflare (e.g. `acme-clawql-team`).
2. Create **R2 S3 API credentials** (Manage R2 API tokens → Create API token with Object Read & Write).
3. Configure sync:

```bash
clawql sync init --interactive
# provider: r2 (default)
# bucket: acme-clawql-team
# prefix: teams/engineering/

export CLAWQL_R2_ACCOUNT_ID="<cloudflare-account-id>"
export CLAWQL_SYNC_ACCESS_KEY_ID="<r2-access-key>"
export CLAWQL_SYNC_SECRET_ACCESS_KEY="<r2-secret>"
```

Or store credentials in the local vault (loaded at MCP/CLI startup):

```bash
clawql secrets set r2AccessKeyId
clawql secrets set r2SecretAccessKey
clawql secrets set cloudflareAccountId
```

4. Push your notes:

```bash
clawql sync push
```

5. Teammates pull:

```bash
clawql sync init --bucket acme-clawql-team --prefix teams/engineering/
clawql sync pull
clawql doctor
```

## Commands

| Command | Purpose |
|---------|---------|
| `clawql sync init` | Write `~/.ClawQL/sync.json` (no secrets) |
| `clawql sync push` | Upload changed local files + update remote manifest |
| `clawql sync pull` | Download changed remote files |
| `clawql sync status` | Compare local vs remote (conflicts listed) |
| `--dry-run` | Show plan without I/O |
| `--force` | Overwrite on conflict (push → remote wins locally; pull → remote wins) |

## Providers

| Provider | `sync.json` | Endpoint | Credentials |
|----------|-------------|----------|-------------|
| **r2** (default) | `"provider": "r2"` | `https://<account>.r2.cloudflarestorage.com` | R2 S3 API keys |
| **s3** | `"provider": "s3"` | AWS default | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| **gcs** | `"provider": "gcs"` | `https://storage.googleapis.com` | GCS HMAC interop keys |

## Environment

| Variable | Purpose |
|----------|---------|
| `CLAWQL_SYNC_PROVIDER` | `r2` (default), `s3`, or `gcs` |
| `CLAWQL_SYNC_BUCKET` | Bucket name (overrides sync.json) |
| `CLAWQL_SYNC_PREFIX` | Shared team prefix, e.g. `teams/acme/` |
| `CLAWQL_SYNC_ACCESS_KEY_ID` | S3-compatible access key |
| `CLAWQL_SYNC_SECRET_ACCESS_KEY` | S3-compatible secret |
| `CLAWQL_R2_ACCOUNT_ID` | Cloudflare account id (R2 endpoint) |
| `CLAWQL_SYNC_ENDPOINT` | Override endpoint URL |
| `CLAWQL_SYNC_REGION` | Region (`auto` for R2/GCS) |

Config file: **`~/.ClawQL/sync.json`** — safe to commit bucket/prefix in team docs; never put secrets there.

## After pull

- Run **`clawql doctor`** or trigger **`memory_recall`** with `CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1` to refresh `memory.db` from new Markdown.
- Conflicts: if two teammates edit the same note, **`sync status`** lists conflicts; use **`sync push --force`** or **`sync pull --force`** deliberately.

## Related

- [Local provider vault](./local-provider-vault.md)
- [Memory / Obsidian](../memory/memory-obsidian.md)
- [Cloudflare provider](../providers/cloudflare-onboarding.md) (API `execute`, not sync)
