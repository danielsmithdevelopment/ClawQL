# Dashboard Agent Chat — shadcn/ui conversation primitives integration

**Status:** Shipped (June 2026)  
**Canonical operator reference:** **[`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)** — API, SSE, vault schema, agent JSON contract, deployment, troubleshooting.

**Scope:** Agent Chat panel in `dashboard/` using shadcn/ui **MessageScroller**, **Message**, **Bubble**, **Attachment**, and **Marker** ([June 2026 chat components](https://ui.shadcn.com/docs/changelog/2026-06-chat-components)).

**Related:** [IDP Platform](../vision/clawql-idp-platform.md) · [Dashboard README](../../dashboard/README.md) · [OpenClaw IDP profile](../openclaw/openclaw-idp-skill-profile.md)

---

## Summary (what shipped)

| Area                  | Delivered                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------- |
| **UI**                | `AgentConversation` (MessageScroller), `ChatMessageRow`, `IdpAttachmentCards`, `ChatComposer` |
| **Streaming**         | `POST /api/agent/chat/stream` (SSE); bridge `POST /v1/chat/stream`                            |
| **Schema**            | `attachments`, `citations`, `toolCalls`, `pipelineStatus` on agent messages                   |
| **Persistence**       | Backward-compatible `messages.jsonl` in vault                                                 |
| **Deploy**            | `CLAWQL_DASHBOARD_CHAT_STREAM`, Helm `dashboard.chatStream`                                   |
| **Bridge enrichment** | `openclaw-chat-enrich.mjs` — session audit → `steps` / `attachments` / `citations`            |
| **Tests**             | `dashboard/e2e/agent-chat.spec.ts`, `npm run test:chat-enrich`                                |

---

## Implementation checklist

- [x] `npx shadcn@latest init` in `dashboard/`
- [x] Add message-scroller, message, bubble, attachment, marker
- [x] Create `src/components/agent-chat/` module
- [x] Refactor `AgentChatPanel` to use `AgentConversation`
- [x] Extend `types.ts` + `parseMessageLine` for optional attachment fields
- [x] Document agent JSON contract — [`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md), [OpenClaw IDP profile](../openclaw/openclaw-idp-skill-profile.md)
- [x] SSE route + bridge streaming (`/v1/chat/stream`)
- [x] `CLAWQL_DASHBOARD_CHAT_STREAM` env + Helm `dashboard.chatStream`
- [x] Playwright tests (`e2e/agent-chat.spec.ts`)
- [x] Bridge session audit enrichment (`openclaw-chat-enrich.mjs`, `CLAWQL_DASHBOARD_CHAT_ENRICH`)
- [x] Dashboard README vault path (`threads/<storageKey>/`)

---

## Architecture (reference)

See mermaid diagram and file index in **[`docs/dashboard/agent-chat.md` §2](../dashboard/agent-chat.md#2-architecture)**.

---

## Historical planning notes

The sections below preserved the original integration plan; behavior may differ slightly from early sketches. Prefer **`docs/dashboard/agent-chat.md`** for accurate API and schema details.

### Original gaps addressed

- Scroll engineering → **MessageScroller** with auto-follow and jump-to-latest
- Streaming UX → **SSE** + simulated fallback
- Rich IDP attachments → **IdpAttachmentCards** + typed `ChatAttachment` union
- shadcn registry → **`components.json`** + `@shadcn/react`

### Deferred

- Bridge auto-mapping MCP audit logs → `steps` / `attachments` without agent-authored JSON
- Dedicated IDP Workspace route (Option B)
- Coneshare bundled provider (cards accept manual JSON today)

---

## References

- shadcn/ui chat changelog: https://ui.shadcn.com/docs/changelog/2026-06-chat-components
- Canonical guide: [`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)
- IDP Platform: [`clawql-idp-platform.md`](../vision/clawql-idp-platform.md)
