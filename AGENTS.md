# Agent guide (coding in this repository)

Instructions for Cursor, Codex, and other coding agents working **in the ClawQL monorepo**. MCP clients talking to a live gateway **through** an enterprise JWT / ATR proxy should use [`docs/mcp/agent-behavior-behind-proxy.md`](docs/mcp/agent-behavior-behind-proxy.md) instead.

Also see [`.cursor/rules/`](.cursor/rules/) for Cursor-specific always-on rules (vault memory, no direct main push, wait for CI before merge).

## Build and test

- From a git checkout: `npm install`, then `npm run build` once (published `clawql-mcp` ships `dist/`).
- Before submitting: `npm run lint`, `npm run format:check` (or `npm run format`), and `npm test` (Vitest).
- Package-scoped: `npm run test -w clawql-audit` (and similarly for other workspaces).
- This environment may not allow fresh package installs; prefer existing `node_modules` and mark “confirm by running” when a fix needs a full matrix.

## Effect-TS (hard rule)

Production code that **can** be Effect-based **must** be — there is no "pure sync is fine" carve-out. Never ship domain IO, orchestration, policy, or even sync helpers (URL/HTML builders, sync crypto, env flag readers) as bare `async`/`Promise`/plain-value APIs when an Effect `Context.Service` + `Layer` or `Effect.sync` is possible. Forced Promise edges (Express / MCP SDK) stay thin façades over `run*Effect`; run `Effect.runSync` only at those absolute host boundaries. Only types-only modules are exempt. Every `packages/*` workspace must declare `effect@4` and ship a `Context.Service` + Layer (see `npm run check:effect-every-package`). Details: [`.cursor/rules/effect-ts-everywhere.mdc`](.cursor/rules/effect-ts-everywhere.mdc).

## Generated files

- Canonical long-form prose lives under **`docs/`**.
- `apps/docs` sync scripts generate `apps/docs/src/generated/**` and related mirrors. **Edit `docs/` sources**, run the docs app sync/prebuild, then commit regenerated outputs when the deploy path requires them. Do not hand-edit generated bodies as the source of truth.
- Published agent skills under `apps/docs/public/.well-known/agent-skills/` mirror [`.cursor/skills/`](.cursor/skills/); keep the `.cursor/skills` copy authoritative when both exist.

## Claim and product rules

When changing marketing copy, docs, READMEs, UI strings, or comments that readers treat as product claims:

- **IDP** means **intelligent document processing** only. Platform-engineering features get another name. In public prose, spell out **identity provider** instead of **IdP** next to IDP.
- Never name the ontology product publicly; say **ClawQL's ontology layer** or **ClawQL's graph**.
- Approved writes are **at most once**, never **exactly once**; interrupted writes are **outcome unknown**.
- celld fleet mode acknowledges on a **disk quorum** before the bucket upload finishes — do not claim **RPO=0** for that path.
- Claims only from **measured or shipped** evidence; no competitor jabs; quarantined benchmark numbers are never cited as current.
- Hash-chained **local WORM is on by default** (sqlite under `$CLAWQL_HOME/worm`); remote Object Lock defaults on Cloud paid tiers and the **regulated** profile; **Panguard fail-closed** remains opt-in — say so accurately.
- The MCP **`audit`** tool is the agent's **view** over WORM; **`clear`** empties only that view.
- **No telemetry** when self-hosted; pseudonymous data is never called anonymous; never read another application's credential files.
- No **FedRAMP-ready**, **HIPAA certified**, or **production deployments** without evidence.

## Related docs

- Proxy / ATR behavior: [`docs/mcp/agent-behavior-behind-proxy.md`](docs/mcp/agent-behavior-behind-proxy.md)
- Security overview: [`docs/security/README.md`](docs/security/README.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)
