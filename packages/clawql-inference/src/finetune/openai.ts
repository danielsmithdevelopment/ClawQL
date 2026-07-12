import { readFile } from "node:fs/promises";
import { readHttpError } from "../providers/http.js";
import type { FinetuneJob, FinetuneJobStatus } from "./types.js";

type OpenAiJobResponse = {
  id: string;
  status: string;
  model: string;
  fine_tuned_model?: string | null;
  created_at: number;
  finished_at?: number | null;
  error?: { message?: string } | null;
};

function mapOpenAiStatus(status: string): FinetuneJobStatus {
  switch (status) {
    case "validating_files":
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

function toFinetuneJob(body: OpenAiJobResponse): FinetuneJob {
  return {
    id: body.id,
    provider: "openai",
    status: mapOpenAiStatus(body.status),
    baseModel: body.model,
    fineTunedModel: body.fine_tuned_model ?? undefined,
    createdAt: new Date(body.created_at * 1000).toISOString(),
    finishedAt: body.finished_at ? new Date(body.finished_at * 1000).toISOString() : undefined,
    error: body.error?.message,
  };
}

export async function uploadOpenAiTrainingFile(
  datasetPath: string,
  apiKey: string
): Promise<string> {
  const bytes = await readFile(datasetPath);
  const form = new FormData();
  form.append("purpose", "fine-tune");
  form.append("file", new Blob([bytes]), datasetPath.split("/").pop() ?? "training.jsonl");
  const res = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(await readHttpError(res));
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function submitOpenAiFinetuneJob(input: {
  datasetPath: string;
  baseModel: string;
  suffix?: string;
  apiKey: string;
}): Promise<FinetuneJob> {
  const fileId = await uploadOpenAiTrainingFile(input.datasetPath, input.apiKey);
  const res = await fetch("https://api.openai.com/v1/fine_tuning/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      training_file: fileId,
      model: input.baseModel,
      suffix: input.suffix,
    }),
  });
  if (!res.ok) throw new Error(await readHttpError(res));
  return toFinetuneJob((await res.json()) as OpenAiJobResponse);
}

export async function getOpenAiFinetuneJob(jobId: string, apiKey: string): Promise<FinetuneJob> {
  const res = await fetch(
    `https://api.openai.com/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!res.ok) throw new Error(await readHttpError(res));
  return toFinetuneJob((await res.json()) as OpenAiJobResponse);
}
