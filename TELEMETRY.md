# Telemetry (self-hosted)

**Status:** Operator-facing policy for self-hosted ClawQL. Marketing pages (`/data-handling`, privacy policy) cite this file.

## Default: no phone-home

A self-hosted ClawQL install (for example `npx clawql-mcp`, Helm, or GHCR images you run) **does not send usage telemetry, tool-call content, documents, memory, or credentials to ClawQL by default.**

There is no built-in anonymous usage reporter that phones home to clawql.com or ClawQL-operated collectors unless you deliberately configure one.

## What operators may enable

Operators may configure their own observability backends (OpenTelemetry exporters, Loki/Tempo/Mimir, Langfuse, and similar). That traffic goes where **you** point it — not to ClawQL — unless you choose a ClawQL-operated endpoint.

Debug or elevated logging on edge/provider-network nodes is a **governed, time-limited, audited** action when those paths are enabled; see `docs/gtm/clawql-cloud-platform-plan.md` (edge telemetry).

## What never leaves in default telemetry

Default product behavior does **not** transmit:

- Content of tool calls (requests or responses)
- Document bodies processed by IDP plugins
- Vault memory notes or recall payloads
- API keys, OAuth tokens, or other credentials

## Managed hosting

Managed ClawQL Cloud is a separate product. Operational metrics, audit trails, and tenant storage on managed tiers are described on [`/data-handling`](https://clawql.com/data-handling) and the privacy policy — not by this self-host default.

## Changes

If ClawQL ever adds optional product telemetry that phones home from self-hosted installs, it will be **opt-in**, documented here first, and will still exclude tool-call content, documents, memory, and credentials unless a future program obtains explicit customer consent for a different purpose.
