# MCP Events — ChatGPT live checklist (**blocking** for v8.0.0)

This pass is a **hard release gate**. Do **not** tag or publish `clawql-mcp@8.0.0` until every box below is checked against a ChatGPT plugin-connected ClawQL MCP server.

**Rule:** every advertised event must get a **real producer trigger** and a **real ChatGPT webhook delivery** in this pass. CI producer tests are not a substitute. Protocol smoke (bottom) only proves wire format.

**Prerequisite:** MCP protocol `2026-07-28`, `CLAWQL_ENABLE_MCP_EVENTS` not disabled, schedule + notify (+ IDP / inference as needed for those events) enabled on the server under test, and (for enterprise) `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` including ChatGPT receiver hosts. Production-like runs must set `CLAWQL_SCHEDULE_PROJECTION_KEY` (or `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY`).

## A. Discover & catalog

1. [ ] Plugin page shows ClawQL **events** alongside tools after rescan.
2. [ ] `server/discover` returns `capabilities.events: {}`.
3. [ ] `events/list` returns **all seven** live events (and only these): `stream.changed`, `document.processed`, `hook.blocked`, `budget.exhausted`, `schedule.completed`, `schedule.paused`, `notification.sent` — **no** `mandate.completed` / `clawql.notification`.

## B. Per-event subscribe → trigger → delivery

For **each** row: new or continuing ChatGPT chat → subscribe with the listed filter → run the real trigger → confirm webhook `2xx` and ChatGPT receives `data` and acts on it. Tick both **trigger** and **delivery**.

| Event | Subscribe args | Real trigger (operator) | Expect in ChatGPT `data` | Trigger | Delivery |
| ----- | -------------- | ----------------------- | ------------------------ | ------- | -------- |
| `notification.sent` | optional `channel` | Slack `notify` success | `text`, `channel?` | [ ] | [ ] |
| `schedule.completed` | optional `schedule_id` | `schedule` create + `trigger` (or worker tick) that finishes a run | `schedule_id`, `status` | [ ] | [ ] |
| `document.processed` | optional `document_id` | Run IDP / documents pipeline to completion for a real document | `document_id`, `status` | [ ] | [ ] |
| `hook.blocked` | optional `tool` | Force a policy / ATR / hook block on a tool call | `tool`, `reason` | [ ] | [ ] |
| `budget.exhausted` | optional `budget_id` | Exhaust an inference virtual-key budget (`validateVirtualKey`) | `budget_id`, `exhausted_at` | [ ] | [ ] |
| `stream.changed` | **required** `topic` = schedule job id | See **§C** (watched-field change + volatile-only negative) | `topic`, capped `diff`, `cursor?`, `watch_fields?` | [ ] | [ ] |
| `schedule.paused` | optional `schedule_id` / `reason` | See **§D** (auth pause → Reconnect sources) | `schedule_id`, `reason`, `summary`, `paused_at`, `reconnect_operation` | [ ] | [ ] |

Shared subscribe mechanics (once is enough if verified on the first subscription; re-check if a later event fails challenge):

4. [ ] Server receives `events/subscribe`; challenge verification succeeds (`2xx` + echoed challenge).
5. [ ] Webhook delivery gets `2xx`; ChatGPT follows the subscribed instructions for that event.

## C. `stream.changed` (required — precision + negative)

Use one schedule synthetic job as `topic`. Prefer a controllable HTTPS fixture (or a real public API you can change) with JSON that includes both a **watched** field and a **volatile** field (e.g. `updated_at` / request id).

6. [ ] Create a `schedule` synthetic job with `change_detection.watch_fields` naming only the meaningful field(s) (e.g. `["state"]`). Note the job id → this is the subscription `topic`.
7. [ ] ChatGPT subscribes to `stream.changed` with `arguments: { topic: "<job_id>" }` and an action (e.g. summarize the `diff`).
8. [ ] Baseline: `schedule` `trigger` (or wait for a tick) so a projection snapshot exists. No delivery required on first establish if there was no prior hash.
9. [ ] **Positive — real API change:** change only a watched field on the upstream; trigger/poll again. ChatGPT receives `stream.changed` with a capped `diff` (`changed` / `added` / `removed`) reflecting that field for `topic` = job id. Optional: `schedule` `get` → `change_detection_state.last_projection` matches full screened projection.
10. [ ] **Negative — volatile-only:** restore watched fields; change only a volatile / non-watched field (or a field listed in `exclude_paths`); trigger/poll again. **No** `stream.changed` delivery to ChatGPT for that subscription (confirm inactivity / no new webhook for this topic).

## D. `schedule.paused` (required — auth pause + Reconnect sources)

ChatGPT has no `terminated` notices; this event is how subscribers learn the poll stopped.

11. [ ] ChatGPT subscribes to `schedule.paused` (filter by `schedule_id` and/or `reason: "upstream_auth"`) with an action that prompts re-auth / reconnect.
12. [ ] Point a synthetic schedule job at an HTTPS endpoint that returns **401/403** (expired / revoked credential). Set `CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD` if needed (default **3**).
13. [ ] Trigger or let the worker poll until consecutive auth failures pause the job (`poll_pause_reason=upstream_auth`). ChatGPT receives `schedule.paused` with `reason`, `summary`, `paused_at`, and `reconnect_operation: "reconnect"`.
14. [ ] Confirm pause is visible to the operator: ClawQL console / `schedule` `list` with `paused_only: true` shows the job with `reconnect_available` (Evidence / audit ring may also show the pause).
15. [ ] Fix credentials (or switch the fixture to 200). Use **Reconnect sources** → `schedule` operation `reconnect` for that `job_id` (clear pause + immediate re-poll). Confirm poll resumes (`poll_pause_reason` null) and auto-polls run again. ChatGPT should not stay silent after step 13 — the pause event must have fired before reconnect.

## E. Filters, unsubscribe, allowlist

16. [ ] Filtered subscription: trigger a non-matching event (wrong `topic` / `schedule_id` / `channel` / etc.) — **not** delivered to that subscription.
17. [ ] Stop monitoring in ChatGPT → `events/unsubscribe` → further producers for that identity do not deliver.
18. [ ] With allowlist set, a non-allowlisted callback URL is rejected (`-32015` / `allowlist_blocked`).

## Protocol smoke (CI — not a substitute for this gate)

```bash
npm run test -w clawql-mcp-events
npm run test -w clawql-automation -- src/schedule/schedule-change-detect.test.ts src/schedule/change-detect.test.ts src/schedule/schedule.test.ts src/schedule/projection-store.test.ts
```

Producer → signed delivery coverage: `packages/clawql-mcp-events/src/producers.test.ts` (all seven names).

## Sign-off

| Field                       | Value       |
| --------------------------- | ----------- |
| Operator                    |             |
| Date (UTC)                  |             |
| ClawQL MCP version / commit |             |
| ChatGPT plugin / workspace  |             |
| Result                      | PASS / FAIL |
| Notes                       |             |
