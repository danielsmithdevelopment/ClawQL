import type { Request, Response } from "express";

export type HitlMemoryIngestParams = {
  title: string;
  insights: string;
  sessionId?: string;
  append?: boolean;
  toolOutputs?: string[];
};

export type HitlMemoryIngestResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type HitlAuditAppendParams = {
  operation: "append";
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
};

export type HitlWebhookDeps = {
  enforceWebhookRateLimit: (req: Request, res: Response) => boolean;
  getObsidianVaultPath: () => string | undefined;
  handleMemoryIngest: (params: HitlMemoryIngestParams) => Promise<HitlMemoryIngestResult>;
  handleAudit: (params: HitlAuditAppendParams) => Promise<void>;
};

let hitlWebhookDeps: HitlWebhookDeps | undefined;

export function configureHitlWebhookDeps(deps: HitlWebhookDeps): void {
  hitlWebhookDeps = deps;
}

export function getHitlWebhookDeps(): HitlWebhookDeps {
  if (!hitlWebhookDeps) {
    throw new Error(
      "HITL webhook deps not configured — call configureHitlWebhookDeps from clawql-mcp transport startup"
    );
  }
  return hitlWebhookDeps;
}

/** @internal Test helper */
export function resetHitlWebhookDepsForTests(): void {
  hitlWebhookDeps = undefined;
}
