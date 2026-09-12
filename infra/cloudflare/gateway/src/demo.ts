import { generateApiToken } from "./auth.js";
import type { GatewayEnv } from "./env.js";
import { ensureSchema, upsertTenant } from "./tenants.js";

/** Demo session TTL — GTM playbook: 5 minutes. */
export const DEMO_TTL_MS = 5 * 60 * 1000;

export type DemoSession = {
  sessionId: string;
  tenantId: string;
  apiToken: string;
  expiresAt: string;
  gatewayTools: string[];
};

export async function createDemoSession(env: GatewayEnv): Promise<DemoSession> {
  if (!env.CLAWQL_TENANTS) {
    throw new Error("D1 tenants binding required for demo sessions");
  }
  await ensureSchema(env.CLAWQL_TENANTS);
  const sessionId = crypto.randomUUID();
  const tenantId = `demo_${sessionId.replace(/-/g, "").slice(0, 12)}`;
  const apiToken = generateApiToken();
  const now = Date.now();
  const expiresAt = new Date(now + DEMO_TTL_MS).toISOString();

  await upsertTenant(env.CLAWQL_TENANTS, {
    tenantId,
    tier: "demo",
    apiToken,
    expiresAt,
    featureFlags: { demo: true, unlimited_mcp_executions: true, ttl_minutes: 5 },
  });

  await env.CLAWQL_TENANTS.prepare(
    `INSERT INTO demo_sessions (session_id, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(sessionId, tenantId, new Date(now).toISOString(), expiresAt)
    .run();

  return {
    sessionId,
    tenantId,
    apiToken,
    expiresAt,
    gatewayTools: ["search", "execute", "memory_ingest", "memory_recall", "cache"],
  };
}

export type DemoPipelineStage = {
  id: string;
  name: string;
  status: "ok" | "skipped";
  detail: string;
};

/**
 * Sandboxed gateway demo — simulates document pipeline stages for top-of-funnel.
 * Full IDP (Docling/Stirling/Onyx/Coneshare) runs on Shared+; this is honest edge preview.
 */
export function simulateDemoPipeline(filename: string, content: string): {
  stages: DemoPipelineStage[];
  markdownPreview: string;
  note: string;
} {
  const bytes = new TextEncoder().encode(content).byteLength;
  const stages: DemoPipelineStage[] = [
    {
      id: "ingest",
      name: "Ingest",
      status: "ok",
      detail: `Accepted ${filename || "document"} (${bytes} bytes) into demo sandbox`,
    },
    {
      id: "pdf-inspector",
      name: "pdf-inspector",
      status: "ok",
      detail: "Metadata + page estimate (edge sandbox)",
    },
    {
      id: "convert",
      name: "Convert → Markdown",
      status: "ok",
      detail: "Text extraction preview (full Docling on Shared+)",
    },
    {
      id: "redact",
      name: "Stirling redaction",
      status: "skipped",
      detail: "Available on IDP tiers (Shared+)",
    },
    {
      id: "onyx",
      name: "Onyx semantic index",
      status: "skipped",
      detail: "Teams+ / Shared+ — edge demo uses vault keyword recall",
    },
    {
      id: "coneshare",
      name: "Coneshare VDR link",
      status: "skipped",
      detail: "Available on Shared+",
    },
  ];

  const markdownPreview = [
    `# ${filename || "Document"}`,
    "",
    "> Edge sandbox preview — documents deleted when the 5-minute demo session expires.",
    "",
    content.trim().slice(0, 4000),
    "",
  ].join("\n");

  return {
    stages,
    markdownPreview,
    note: "Demo runs in a sandboxed tenant with a 5-minute TTL. Start a free trial for a persistent vault.",
  };
}
