/**
 * Runtime-agnostic IDP agent bridge ([#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)).
 * Subscribes to document JetStream events and calls ClawQL MCP (memory_ingest / notify / audit).
 * Pair with Hermes, Pi, Goose, or OpenClaw — they use MCP for tools; this closes the async NATS loop.
 */

import type { DocumentEventEnvelope } from "./envelope.js";
import {
  natsAgentBridgeConfigured,
  natsAgentBridgeDurable,
  natsAgentBridgeNotifyChannel,
  natsDocumentSubjectRoot,
} from "./env.js";
import { ensureDurableConsumer, startConsumerLoop, type DocumentConsumerHandler } from "./client.js";

export type AgentBridgeMcpCaller = {
  callTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string; text?: string }>;
};

export type AgentBridgeHandleResult = {
  ok: boolean;
  actions: string[];
  error?: string;
};

/** Pure handler — unit-testable without NATS/MCP sockets. */
export async function handleDocumentEventForAgentBridge(
  envelope: DocumentEventEnvelope,
  mcp: AgentBridgeMcpCaller
): Promise<AgentBridgeHandleResult> {
  const actions: string[] = [];
  const corr = envelope.correlation_id ?? "(none)";
  const path =
    typeof envelope.payload?.document_path === "string"
      ? envelope.payload.document_path
      : undefined;

  if (envelope.event_type === "pipeline.completed" || envelope.event_type === "pipeline.failed") {
    const ok = envelope.event_type === "pipeline.completed";
    const err =
      typeof envelope.payload?.error === "string" ? envelope.payload.error : undefined;
    const insights = [
      "## Summary",
      "",
      `IDP agent bridge observed **${envelope.event_type}**.`,
      "",
      `- **correlation_id:** ${corr}`,
      `- **document_path:** ${path ?? "(none)"}`,
      `- **ok:** ${ok}`,
      err ? `- **error:** ${err}` : "",
      "",
      "Continue via ClawQL MCP (Hermes / Pi / Goose / OpenClaw) — do not re-run Stirling in the agent.",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const mem = await mcp.callTool("memory_ingest", {
      title: `IDP pipeline ${ok ? "completed" : "failed"}`,
      insights,
      append: true,
      sessionId: envelope.correlation_id,
    });
    actions.push(mem.ok ? "memory_ingest" : `memory_ingest_failed:${mem.error ?? "?"}`);

    if (!mem.ok) {
      const audit = await mcp.callTool("audit", {
        operation: "append",
        category: "idp",
        action: "agent_bridge_pipeline_terminal",
        summary: `${envelope.event_type} corr=${corr} path=${path ?? ""}`,
      });
      actions.push(audit.ok ? "audit" : `audit_failed:${audit.error ?? "?"}`);
    }

    const channel = natsAgentBridgeNotifyChannel();
    if (channel && !ok) {
      const notify = await mcp.callTool("notify", {
        channel,
        text: `IDP pipeline failed corr=${corr} path=${path ?? "(none)"} error=${err ?? "?"}`,
      });
      actions.push(notify.ok ? "notify" : `notify_failed:${notify.error ?? "?"}`);
    }

    return { ok: true, actions };
  }

  if (envelope.event_type === "coneshare.viewer") {
    const eventType =
      typeof envelope.payload?.event_type === "string"
        ? envelope.payload.event_type
        : "viewer";
    const share =
      typeof envelope.payload?.share_link_id === "string"
        ? envelope.payload.share_link_id
        : "(none)";
    const viewer =
      typeof envelope.payload?.viewer_email === "string"
        ? envelope.payload.viewer_email
        : "anonymous";

    const insights = [
      "## Summary",
      "",
      "IDP agent bridge observed ConeShare viewer activity.",
      "",
      `- **event:** ${eventType}`,
      `- **share:** ${share}`,
      `- **viewer:** ${viewer}`,
      `- **correlation_id:** ${corr}`,
      "",
    ].join("\n");

    const mem = await mcp.callTool("memory_ingest", {
      title: "ConeShare viewer (agent bridge)",
      insights,
      append: true,
      sessionId: envelope.correlation_id,
    });
    actions.push(mem.ok ? "memory_ingest" : `memory_ingest_failed:${mem.error ?? "?"}`);
    return { ok: true, actions };
  }

  actions.push("ignored");
  return { ok: true, actions };
}

export async function startIdpAgentBridgeConsumer(mcp: AgentBridgeMcpCaller): Promise<void> {
  if (!natsAgentBridgeConfigured()) return;

  const durable = natsAgentBridgeDurable();
  await ensureDurableConsumer({
    durable,
    filterSubject: `${natsDocumentSubjectRoot()}.>`,
  });

  const handler: DocumentConsumerHandler = async (envelope) => {
    const result = await handleDocumentEventForAgentBridge(envelope, mcp);
    if (!result.ok) {
      console.error(
        JSON.stringify({
          ok: false,
          event_type: envelope.event_type,
          error: result.error,
          actions: result.actions,
        })
      );
      return { ok: false, error: result.error };
    }
    console.log(
      JSON.stringify({
        ok: true,
        event_type: envelope.event_type,
        correlation_id: envelope.correlation_id,
        actions: result.actions,
      })
    );
    return { ok: true };
  };

  await startConsumerLoop({
    durable,
    onMessage: async (data) => {
      const envelope = JSON.parse(new TextDecoder().decode(data)) as DocumentEventEnvelope;
      // Skip noisy hop/inbox — bridge cares about terminal + viewer.
      if (
        envelope.event_type !== "pipeline.completed" &&
        envelope.event_type !== "pipeline.failed" &&
        envelope.event_type !== "coneshare.viewer"
      ) {
        return { ok: true };
      }
      return handler(envelope);
    },
  });
}
