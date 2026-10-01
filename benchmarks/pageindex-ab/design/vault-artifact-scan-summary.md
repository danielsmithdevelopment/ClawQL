# Vault artifact heading scan (2026-09-29)

## Operator vault (`CLAWQL_OBSIDIAN_VAULT_PATH` / `~/.ClawQL`)

| Metric | Value |
| ------ | ----- |
| Files scanned | 10 |
| ATX headings | 226 |
| Artifact headings | **0** |
| Rate | 0.0 |

This deployment’s vault is agent Memory notes only (team R2 in sync, 10 files). **No TOC/list ghosts** in source. Product filter still protects any future contaminated ingest; migration dry-run exercised (`vault-resection-artifact-headings.mjs` → 0 hits).

## RFC-style TXT→MD without the filter (contaminated ingest proxy)

Same flagger `--vault` mode on a naive (unfiltered) convert of the 16 hard-candidate seed RFCs:

| Metric | Value |
| ------ | ----- |
| Docs | 16 |
| ATX headings | 1262 |
| Artifact headings | **212** (16.8%) |
| Files with ghosts | 15 |

**Takeaway:** ~17% of promoted headings are TOC/list junk on RFC-style converts. The 8.0 `splitMarkdownSections` filter + optional `vault-resection-artifact-headings.mjs` remove that class of wrong-reason section IDs for real recall — worth calling out in migrate-to-8.0 notes even when a given vault is currently clean.
