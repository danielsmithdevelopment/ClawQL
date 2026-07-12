import { readHttpError } from "../providers/http.js";
import type { FinetuneJob, FinetuneJobStatus } from "./types.js";

type AnthropicJobResponse = {
  id: string;
  status: string;
  base_model: string;
  fine_tuned_model?: string | null;
  created_at: string;
  finished_at?: string | null;
  error?: { message?: string } | null;
};

function mapAnthropicStatus(status: string): FinetuneJobStatus {
  switch (status) {
    case "queued":
    case "running":
    case "succeeded":
    case "failed":
    case "cancelled":
      return status;
    default:
      return "queued";
  }
}

function toFinetuneJob(body: AnthropicJobResponse): FinetuneJob {
  return {
    id: body.id,
    provider: "anthropic",
    status: mapAnthropicStatus(body.status),
    baseModel: body.base_model,
    fineTunedModel: body.fine_tuned_model ?? undefined,
    createdAt: body.created_at,
    finishedAt: body.finished_at ?? undefined,
    error: body.error?.message,
  };
}

const ANTHROPIC_FINETUNE_BASE = "https://api.anthropic.com/v1/fine_tuning";

export async function submitAnthropicFinetuneJob(input: {
  datasetPath: string;
  baseModel: string;
  apiKey: string;
}): Promise<FinetuneJob> {
  const res = await fetch(`${ANTHROPIC_FINETUNE_BASE}/jobs`, {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base_model: input.baseModel,
      training_file: input.datasetPath,
    }),
  });
  if (!res.ok) throw new Error(await readHttpError(res));
  return toFinetuneJob((await res.json()) as AnthropicJobResponse);
}

export async function getAnthropicFinetuneJob(jobId: string, apiKey: string): Promise<FinetuneJob> {
  const res = await fetch(`${ANTHROPIC_FINETUNE_BASE}/jobs/${encodeURIComponent(jobId)}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(await readHttpError(res));
  return toFinetuneJob((await res.json()) as AnthropicJobResponse);
}
