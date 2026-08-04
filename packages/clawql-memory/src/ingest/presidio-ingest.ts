import { gatewayRedactionEnabled, maybeGatewayRedactText } from "clawql-api";

import type { MemoryIngestInput } from "./ingest.js";

async function redactOptional(text: string | undefined): Promise<string | undefined> {
  if (!text?.trim() || !gatewayRedactionEnabled()) return text;
  return maybeGatewayRedactText(text);
}

async function redactToolOutputs(
  toolOutputs: string | string[] | undefined
): Promise<string | string[] | undefined> {
  if (!gatewayRedactionEnabled() || toolOutputs === undefined) return toolOutputs;
  if (Array.isArray(toolOutputs)) {
    return Promise.all(toolOutputs.map((s) => maybeGatewayRedactText(s)));
  }
  return maybeGatewayRedactText(toolOutputs);
}

/**
 * Redact ingest text fields when gateway redaction is enabled
 * (Presidio and/or local Privacy Filter).
 */
export async function presidioRedactMemoryIngestInput(
  input: MemoryIngestInput
): Promise<MemoryIngestInput> {
  if (!gatewayRedactionEnabled()) return input;
  return {
    ...input,
    insights: await redactOptional(input.insights),
    conversation: await redactOptional(input.conversation),
    toolOutputs: await redactToolOutputs(input.toolOutputs),
  };
}
