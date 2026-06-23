# clawql-automation

Scheduling and notifications extracted from `clawql-mcp` (modularization order 6): persisted synthetic checks (`schedule` MCP tool) and Slack `notify` via the loaded spec's `chat_postMessage` operation.

Prefer subpath imports (`clawql-automation/schedule/schedule`, `clawql-automation/notify/notify`) at server startup. Call `configureNotifyDeps` from the MCP transport layer before the schedule worker invokes `runNotifySlack`.
