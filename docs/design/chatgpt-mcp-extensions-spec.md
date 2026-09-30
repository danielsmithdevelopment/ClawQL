# ChatGPT MCP Extensions in ClawQL 8.0.0 (Spec v0.1)

Sep 29, 2026 · @Daniel

## Goal and scope

ClawQL 8.0.0 ships seven ChatGPT extensions, each attached to a capability ClawQL already has; none ships without a clear purpose. Together they make ClawQL feel native in ChatGPT: memory and ontology in the composer, mandate approvals as native forms, an Evidence tab per thread, and a ClawQL console in the sidebar.

- **In scope:** the onboarding skill, composer @-mentions, mandate approval forms, structured settings, the Evidence thread tab, the console global entrypoint, and file handlers for `.cqe` and `.cqk`.
- **Out of scope:** file handlers for common formats such as `.pdf`, `.docx` or images. A handler replaces ChatGPT's default viewer for that type, so claiming one would take over every user's documents.
- **ChatGPT-only, never ChatGPT-required:** every extension sits behind capability detection. Claude, Cursor and other MCP clients see plain MCP, unchanged.

Based on the OpenAI MCP Extensions spec and the [`mcp-extensions`](https://github.com/openai/mcp-extensions) repo.

## Prerequisites and packaging

The protocol base is already in place: ClawQL speaks MCP 2026-07-28 with `server/discover`. Multi-round-trip requests (MRTR) are advertised (`mrtr: true`) for form elicitation from OpenAI-registered servers.

- **Package:** `clawql-chatgpt-extensions` wraps `@openai/mcp-extensions` (TypeScript, Apache 2.0) in an Effect Tag and Layer.
- **Flag:** `CLAWQL_ENABLE_CHATGPT_EXTENSIONS`, default **on**, `=0` disables everything here. Capability detection still decides per client.
- **Capabilities:** `server/discover` advertises `capabilities.extensions["openai/settings"]` with its read and update tools, plus server icons in `_meta`.
- **MCP Apps:** each UI is a `ui://clawql/...` resource served through `resources/read` with MIME type `text/html;profile=mcp-app`.
- **Plugin manifest:** ships the skills folder and sets `extensions["com.openai"].onboardingSkill` to the setup skill's path.
- **Icons:** every entrypoint tool carries an SVG icon (monochrome, `currentColor`, 20×20 viewport).

## The seven features

| Feature                | What it does                   | Platforms                       | Tool / resource                            |
| ---------------------- | ------------------------------ | ------------------------------- | ------------------------------------------ |
| Onboarding skill       | Guided setup                   | Desktop, web, iOS, Android      | `skills/setup/SKILL.md`                    |
| Composer @-mentions    | Search vault / ontology / docs | Desktop                         | `clawql_mentions_search` (app-only)        |
| Mandate approval forms | Approve MEDIUM-risk writes     | Desktop, web                    | `openai/elicitation/create` (MRTR)         |
| Structured settings    | Per-user preferences + actions | All                             | `clawql_settings_read` / `_update`         |
| Evidence tab           | Thread tool calls, gates, WORM | All                             | `clawql_evidence` → `ui://clawql/evidence` |
| Console                | Six-section dashboard          | All (deep links not on Android) | `clawql_console` → `ui://clawql/console`   |
| File handlers          | Open/edit `.cqe` / `.cqk`      | Desktop                         | `clawql_open_file`                         |

## Security

Same defense in depth as tool calls: identity checks, gate, redaction, WORM. UI-only tools set `_meta.ui.visibility` to `["app"]`. Non-ChatGPT clients omit UI tools from `tools/list`.

## Open questions

- [ ] Thread identity: what ChatGPT sends for the current thread (else scope Evidence to MCP session).
- [ ] Console sections: confirm six sections and per-user vs admin-only.
- [ ] Distribution: plugin ID and deep-link format.
- [ ] Approval timeout: admin min / max / default.
- [ ] Mention ranking: recency + keyword vs reranker.
