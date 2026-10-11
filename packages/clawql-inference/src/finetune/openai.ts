import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { readHttpErrorEffect } from "../providers/http.js";
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

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

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

export function uploadOpenAiTrainingFileEffect(
  datasetPath: string,
  apiKey: string
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const bytes = yield* Effect.tryPromise({
      try: () => readFile(datasetPath),
      catch: asError,
    });
    const form = new FormData();
    form.append("purpose", "fine-tune");
    form.append("file", new Blob([bytes]), datasetPath.split("/").pop() ?? "training.jsonl");
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        }),
      catch: asError,
    });
    if (!res.ok) {
      const err = yield* readHttpErrorEffect(res);
      return yield* Effect.fail(new Error(err));
    }
    const body = yield* Effect.tryPromise({
      try: () => res.json() as Promise<{ id: string }>,
      catch: asError,
    });
    return body.id;
  });
}

/** Promise façade. */
export async function uploadOpenAiTrainingFile(
  datasetPath: string,
  apiKey: string
): Promise<string> {
  return Effect.runPromise(uploadOpenAiTrainingFileEffect(datasetPath, apiKey));
}

export function submitOpenAiFinetuneJobEffect(input: {
  datasetPath: string;
  baseModel: string;
  suffix?: string;
  apiKey: string;
}): Effect.Effect<FinetuneJob, Error> {
  return Effect.gen(function* () {
    const fileId = yield* uploadOpenAiTrainingFileEffect(input.datasetPath, input.apiKey);
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.openai.com/v1/fine_tuning/jobs", {
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
        }),
      catch: asError,
    });
    if (!res.ok) {
      const err = yield* readHttpErrorEffect(res);
      return yield* Effect.fail(new Error(err));
    }
    const body = yield* Effect.tryPromise({
      try: () => res.json() as Promise<OpenAiJobResponse>,
      catch: asError,
    });
    return toFinetuneJob(body);
  });
}

/** Promise façade. */
export async function submitOpenAiFinetuneJob(input: {
  datasetPath: string;
  baseModel: string;
  suffix?: string;
  apiKey: string;
}): Promise<FinetuneJob> {
  return Effect.runPromise(submitOpenAiFinetuneJobEffect(input));
}

export function getOpenAiFinetuneJobEffect(
  jobId: string,
  apiKey: string
): Effect.Effect<FinetuneJob, Error> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch(`https://api.openai.com/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      catch: asError,
    });
    if (!res.ok) {
      const err = yield* readHttpErrorEffect(res);
      return yield* Effect.fail(new Error(err));
    }
    const body = yield* Effect.tryPromise({
      try: () => res.json() as Promise<OpenAiJobResponse>,
      catch: asError,
    });
    return toFinetuneJob(body);
  });
}

/** Promise façade. */
export async function getOpenAiFinetuneJob(jobId: string, apiKey: string): Promise<FinetuneJob> {
  return Effect.runPromise(getOpenAiFinetuneJobEffect(jobId, apiKey));
}
