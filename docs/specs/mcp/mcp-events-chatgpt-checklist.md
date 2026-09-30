# MCP Events — ChatGPT live checklist (**blocking** for v8.0.0)

This pass is a **hard release gate**. Do **not** tag or publish `clawql-mcp@8.0.0` until every box below is checked against a ChatGPT plugin-connected ClawQL MCP server.

**Rules:**

1. **Release candidate only.** Run this pass on the **exact signed OCI image** that will be tagged / promoted as `v8.0.0` (digest-pinned). A pass on a local/dev build, `latest`, or any other digest does **not** prove what ships. Record the digest in §0 and on the sign-off; after tag day, the published `v8.0.0` image digest must match.
2. **Every advertised event** must get a **real producer trigger** and a **real ChatGPT webhook delivery**. CI producer tests are not a substitute. Protocol smoke (bottom) only proves wire format.
3. **Evidence with every tick.** For each delivery (and each required negative), record **`eventId`** and the matching **WORM** entry so sign-off can be verified later — *verify us, don't trust us*. Do not tick Delivery without filling the evidence columns.

**Prerequisite:** MCP protocol `2026-07-28`, `CLAWQL_ENABLE_MCP_EVENTS` not disabled, schedule + notify (+ IDP / inference as needed) enabled, WORM sink wired for MCP Events (`wormAppend` / host dual-write so `mcp_events.delivery` / `mcp_events.subscribe` land in the trail), and (for enterprise) `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` including ChatGPT receiver hosts. Production-like runs must set `CLAWQL_SCHEDULE_PROJECTION_KEY` (or `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY`).

## 0. Release candidate under test (required before §A)

Deploy / point ChatGPT at the **RC image by digest**, not by a moving tag.

| Field | Value (operator fills) |
| ----- | ---------------------- |
| Image reference (digest-pinned) | `ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:…` |
| Image digest (`sha256:…`) | |
| Cosign / signature verified (`cosign verify` or cluster Kyverno) | [ ] PASS |
| Git commit SHA baked into / serving this image | |
| Build / workflow run URL (that produced + signed this digest) | |
| Confirmed: this digest is the artifact that will be tagged `v8.0.0` | [ ] |

How to capture (example):

```bash
# After pulling the RC (or inspecting the build that will become v8.0.0):
crane digest ghcr.io/danielsmithdevelopment/clawql-mcp:<rc-tag-or-sha>
# or: docker buildx imagetools inspect … | grep Digest
cosign verify ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:<digest> …
```

19. [ ] Live pass environment is running **only** the digest recorded above (pod/spec shows `@sha256:…`, not a floating tag alone).

## A. Discover & catalog

1. [ ] Plugin page shows ClawQL **events** alongside tools after rescan.
2. [ ] `server/discover` returns `capabilities.events: {}`.
3. [ ] `events/list` returns **all seven** live events (and only these): `stream.changed`, `document.processed`, `hook.blocked`, `budget.exhausted`, `schedule.completed`, `schedule.paused`, `notification.sent` — **no** `mandate.completed` / `clawql.notification`.

## B. Per-event subscribe → trigger → delivery (+ evidence)

For **each** row: subscribe → real trigger → ChatGPT delivery → fill **Event ID** and **WORM**.

**Where to find evidence**

- **Event ID** — MCP Events `eventId` (also Standard Webhooks `webhook-id` header on the delivery request). Same id is preserved across retries.
- **WORM** — host trail entry for type `mcp_events.delivery` (and subscribe as `mcp_events.subscribe`) whose payload includes that `eventId`. Record `worm_ref` / entry hash / Merkle leaf id as your store exposes it. If WORM is missing for a delivery, the tick is incomplete — fix the sink and re-run that event.

| Event | Subscribe args | Real trigger | Expect in `data` | Trigger | Delivery | Event ID | WORM (`mcp_events.delivery` / ref) |
| ----- | -------------- | ------------ | ---------------- | ------- | -------- | -------- | ---------------------------------- |
| `notification.sent` | optional `channel` | Slack `notify` success | `text`, `channel?` | [ ] | [ ] | | |
| `schedule.completed` | optional `schedule_id` | `schedule` create + `trigger` (or tick) completes a run | `schedule_id`, `status` | [ ] | [ ] | | |
| `document.processed` | optional `document_id` | IDP / documents pipeline completes | `document_id`, `status` | [ ] | [ ] | | |
| `hook.blocked` | optional `tool` | Policy / ATR / hook blocks a tool call | `tool`, `reason` | [ ] | [ ] | | |
| `budget.exhausted` | optional `budget_id` | Exhaust inference virtual-key budget | `budget_id`, `exhausted_at` | [ ] | [ ] | | |
| `stream.changed` (positive) | **required** `topic` = job id | §C watched-field change | `topic`, capped `diff`, … | [ ] | [ ] | | |
| `stream.changed` (volatile-only) | same `topic` | §C volatile-only change | **no** delivery | [ ] | n/a | `none (expected)` | window / query proving **no** `mcp_events.delivery` for this topic |
| `schedule.paused` | optional `schedule_id` / `reason` | §D auth pause | `schedule_id`, `reason`, `paused_at`, `reconnect_operation` | [ ] | [ ] | | |

Shared subscribe mechanics (once is enough if verified on the first subscription; re-check if a later event fails challenge):

4. [ ] Server receives `events/subscribe`; challenge verification succeeds (`2xx` + echoed challenge). Record subscribe WORM: type `mcp_events.subscribe`, id = _______________
5. [ ] Webhook delivery gets `2xx`; ChatGPT follows the subscribed instructions for that event.

## C. `stream.changed` (required — precision + negative)

Use one schedule synthetic job as `topic`. Prefer a controllable HTTPS fixture (or a real public API you can change) with JSON that includes both a **watched** field and a **volatile** field (e.g. `updated_at` / request id).

6. [ ] Create a `schedule` synthetic job with `change_detection.watch_fields` naming only the meaningful field(s) (e.g. `["state"]`). Note the job id → this is the subscription `topic`.
7. [ ] ChatGPT subscribes to `stream.changed` with `arguments: { topic: "<job_id>" }` and an action (e.g. summarize the `diff`).
8. [ ] Baseline: `schedule` `trigger` (or wait for a tick) so a projection snapshot exists. No delivery required on first establish if there was no prior hash.
9. [ ] **Positive — real API change:** change only a watched field on the upstream; trigger/poll again. ChatGPT receives `stream.changed` with a capped `diff` for that `topic`. Fill Event ID + WORM in the §B table. Optional: `schedule` `get` → `change_detection_state.last_projection` matches full screened projection.
10. [ ] **Negative — volatile-only:** restore watched fields; change only a volatile / non-watched field (or `exclude_paths`); trigger/poll again. **No** `stream.changed` delivery. In §B record Event ID = `none (expected)` and a WORM query / time window showing **no** new `mcp_events.delivery` for this subscription/`topic`.

## D. `schedule.paused` (required — auth pause + Reconnect sources)

ChatGPT has no `terminated` notices; this event is how subscribers learn the poll stopped.

11. [ ] ChatGPT subscribes to `schedule.paused` (filter by `schedule_id` and/or `reason: "upstream_auth"`) with an action that prompts re-auth / reconnect.
12. [ ] Point a synthetic schedule job at an HTTPS endpoint that returns **401/403** (expired / revoked credential). Set `CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD` if needed (default **3**).
13. [ ] Trigger or let the worker poll until consecutive auth failures pause the job (`poll_pause_reason=upstream_auth`). ChatGPT receives `schedule.paused` with `reason`, `summary`, `paused_at`, and `reconnect_operation: "reconnect"`. Fill Event ID + WORM in §B.
14. [ ] Confirm pause is visible: ClawQL console / `schedule` `list` with `paused_only: true` shows the job with `reconnect_available` (Evidence / audit ring may also show the pause).
15. [ ] Fix credentials (or switch the fixture to 200). Use **Reconnect sources** → `schedule` operation `reconnect` for that `job_id`. Confirm poll resumes (`poll_pause_reason` null). The pause event in step 13 must already be evidenced before reconnect.

## E. Filters, unsubscribe, allowlist

16. [ ] Filtered subscription: trigger a non-matching event — **not** delivered. Evidence: Event ID = `none (expected)`; WORM window with no matching `mcp_events.delivery` for that filter.
17. [ ] Stop monitoring in ChatGPT → `events/unsubscribe` → further producers do not deliver. Record unsubscribe audit/WORM if present: _______________
18. [ ] With allowlist set, a non-allowlisted callback URL is rejected (`-32015` / `allowlist_blocked`).

## Protocol smoke (CI — not a substitute for this gate)

```bash
npm run test -w clawql-mcp-events
npm run test -w clawql-automation -- src/schedule/schedule-change-detect.test.ts src/schedule/change-detect.test.ts src/schedule/schedule.test.ts src/schedule/projection-store.test.ts
```

Producer → signed delivery coverage: `packages/clawql-mcp-events/src/producers.test.ts` (all seven names).

## Sign-off

Sign-off is invalid unless §0 digest is filled, Cosign verified, and every Delivery / required-negative row in §B has Event ID + WORM evidence.

| Field | Value |
| ----- | ----- |
| Operator | |
| Date (UTC) | |
| ChatGPT plugin / workspace | |
| RC image digest (`sha256:…`) | *(must match §0)* |
| Git commit SHA (image / server) | |
| Build / workflow run URL | |
| Result | PASS / FAIL |
| Post-tag verification | [ ] Published `v8.0.0` image digest equals RC digest above |
| Notes | |

### Evidence index (optional paste / link)

Attach or link a sheet with one row per delivery: `event name`, `eventId`, `worm_ref` / WORM query, UTC timestamp, ChatGPT chat id. Keep this with the release record so an auditor can re-verify without trusting the checkboxes alone.
