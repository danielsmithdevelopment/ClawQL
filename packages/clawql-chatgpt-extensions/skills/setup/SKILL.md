---
name: clawql-chatgpt-setup
description: >-
  Guided ClawQL onboarding for ChatGPT: confirm identity and scope, connect a
  first API source, pick or create a vault, run a sample recall, offer a
  document.processed subscription, and show where the console and Evidence tab live.
---

# ClawQL setup (ChatGPT onboarding)

ChatGPT runs this skill once after the ClawQL plugin is installed (new conversation, or the current thread if installed mid-conversation).

## Steps

1. **Identity** — Confirm who the user is connected as and their scope (ATR / vault permissions).
2. **First API source** — Help connect one provider (GitHub, Slack, Linear, Notion, Onyx, or Cloudflare). Prefer vault secrets over pasting tokens into chat.
3. **Vault** — Pick or create `CLAWQL_HOME` / Obsidian vault path for memory notes.
4. **Sample recall** — Run `memory_recall` with a concrete query so the user sees vault search working.
5. **Events (optional)** — Offer a `document.processed` subscription if automation is available.
6. **Surfaces** — Point to:
   - **Console** (sidebar global entrypoint) — six-section ClawQL dashboard
   - **Evidence** (thread tab) — this conversation's tool calls, gates, and WORM entries
   - **@-mentions** (desktop composer) — vault notes, ontology entities, processed documents

## Rules

- Never put API tokens in MCP JSON or chat history. Use `~/.ClawQL/vault/providers.json` or Cursor/ChatGPT secrets.
- Deployment config (flags, allowlists, redaction policy) stays server-side — not in ChatGPT settings.
- After setup, summarize: home path, secrets vault path, MCP transport, vendor tested, memory vault status.
