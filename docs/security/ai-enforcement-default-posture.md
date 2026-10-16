# AI enforcement default posture (managed)

**Status:** Policy — 2026-10-15

## Decision

Managed / production gateways **must** run with a blocking tool-scope enforcement provider (Panguard proxy or equivalent). Bare installs that leave enforcement off emit a SECURITY WARNING at boot (`packages/clawql-api/src/plugins/enforcement-boot-warning.ts`).

## Required env (production)

```bash
CLAWQL_PANGUARD_PROXY_PLUGIN=1
CLAWQL_PANGUARD_IN_PROCESS=1
# Do NOT set CLAWQL_ALLOW_NO_ENFORCEMENT=1
```

Optional Cloud console banner opt-in (shows green “on” state in Settings → Advanced):

```bash
NEXT_PUBLIC_CLAWQL_PANGUARD_ENFORCEMENT=1
```

## Residual risk UI

When the public flag is unset, Settings → Advanced shows an amber residual-risk notice so operators cannot miss the gap during console review.

## Related

- `docs/plugins/panguard-proxy.md`
- CHANGELOG 8.0 enforcement defaults
