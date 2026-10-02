---
title: Toolkits
description: Named presets that expand to provider packs, ATR tool allowlists, and optional API key scopes — packaging over existing composition, not a new runtime.
slug: toolkits
status: default-available
package: packages/clawql-api/src/toolkits/
order: 6
prev: bundled-providers
next: automation
---

# Toolkits

Toolkits are **named packaging** over ClawQL’s existing provider packs and ATR tool allowlists. They do not add providers or MCP tools by themselves — they expand to `providers.pack` / `providers.enabled` plus metadata (`atrToolsInScope`, optional `apiKeyScopes`).

## Seeded ids

| Toolkit            | Expands to                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `default-saas`     | Curated pack `default` + SaaS ATR tools                                |
| `read-only`        | Pack `default` + read-only ATR (`search`, `memory_recall`, `skills_*`) |
| `ops-github-slack` | `enabled: ["github","slack"]`                                          |

## Opt-in

```bash
# Env (ignored if CLAWQL_PROVIDER is set — prefer one or the other)
export CLAWQL_TOOLKIT=default-saas

# Or instance JSON when providers is unset
export CLAWQL_INSTANCE_SPEC='{"toolkit":"default-saas"}'
```

Inspect:

```bash
clawql toolkit list
clawql toolkit show default-saas
```

## Precedence

Same multi-spec order as [bundled providers](./bundled-providers.md), with toolkit filling only when higher-priority provider selection is absent. See [toolkits-v0.1](../specs/toolkits/toolkits-v0.1.md).

## See also

- [Bundled providers](./bundled-providers.md)
- Spec: [`docs/specs/toolkits/toolkits-v0.1.md`](../specs/toolkits/toolkits-v0.1.md)
