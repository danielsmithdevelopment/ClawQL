# clawql-automation

Scheduling and notifications extracted from `clawql-mcp` (modularization phase 9, [#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)): persisted synthetic checks (`schedule` MCP tool) and Slack `notify` via the loaded spec's `chat_postMessage` operation.

Prefer subpath imports (`clawql-automation/schedule/schedule`, `clawql-automation/notify/notify`) at server startup. Call `configureNotifyDeps` from the MCP transport layer before the schedule worker invokes `runNotifySlack`.

NATS / HITL orchestration is planned; not in this package yet. See [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).
