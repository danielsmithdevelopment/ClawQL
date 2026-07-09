import { maybePresidioRedactText, presidioEnabled } from "clawql-api";

import type { MemoryIngestInput } from "./ingest.js";

async function redactOptional(text: string | undefined): Promise<string | undefined> {
  if (!text?.trim() || !presidioEnabled()) return text;
  return maybePresidioRedactText(text);
}

async function redactToolOutputs(
  toolOutputs: string | string[] | undefined
): Promise<string | string[] | undefined> {
  if (!presidioEnabled() || toolOutputs === undefined) return toolOutputs;
  if (Array.isArray(toolOutputs)) {
    return Promise.all(toolOutputs.map((s) => maybePresidioRedactText(s)));
  }
  return maybePresidioRedactText(toolOutputs);
}

/** Redact ingest text fields when Presidio gateway hooks are enabled. */
export async function presidioRedactMemoryIngestInput(
  input: MemoryIngestInput
): Promise<MemoryIngestInput> {
  if (!presidioEnabled()) return input;
  return {
    ...input,
    insights: await redactOptional(input.insights),
    conversation: await redactOptional(input.conversation),
    toolOutputs: await redactToolOutputs(input.toolOutputs),
  };
}
