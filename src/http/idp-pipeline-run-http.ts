/**
 * Internal HTTP entry for NATS workers to run {@link runIdpPipeline} when documents
 * deps are not configured in the worker process.
 *
 * **`POST /idp/pipeline/run`** — gated by optional **`CLAWQL_IDP_PIPELINE_RUN_TOKEN`**.
 */

import type { Request, Response } from "express";
import { runIdpPipeline, type RunIdpPipelineInput } from "clawql-documents";
import { getDocumentsPluginDeps } from "clawql-documents/plugin";
import { publishDocumentPipelineHopEvent } from "clawql-automation/nats/publish-hooks";

function runTokenExpected(): string | undefined {
  const t = process.env.CLAWQL_IDP_PIPELINE_RUN_TOKEN?.trim();
  return t && t.length > 0 ? t : undefined;
}

function authOk(req: Request): boolean {
  const expected = runTokenExpected();
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = req
    .header("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  return header === expected;
}

export async function handleIdpPipelineRunRequest(req: Request, res: Response): Promise<void> {
  if (!runTokenExpected() && process.env.NODE_ENV === "production") {
    res.status(503).json({
      ok: false,
      error: "Set CLAWQL_IDP_PIPELINE_RUN_TOKEN for /idp/pipeline/run in production.",
    });
    return;
  }
  if (!authOk(req)) {
    res.status(401).json({ ok: false, error: "invalid or missing pipeline run token" });
    return;
  }

  const body = (req.body ?? {}) as RunIdpPipelineInput;
  if (!body.document_path?.trim()) {
    res.status(400).json({ ok: false, error: "document_path is required" });
    return;
  }

  try {
    const deps = getDocumentsPluginDeps();
    const result = await runIdpPipeline(
      {
        ...body,
        dry_run: body.dry_run === true,
      },
      {
        execute: deps.execute,
        onHop: async (event) => {
          void publishDocumentPipelineHopEvent({
            correlation_id: event.correlation_id,
            hop: {
              index: event.hop.index,
              stage: event.hop.stage,
              operationId: event.hop.operationId,
              ok: event.hop.ok,
              skipped: event.hop.skipped,
              error: event.hop.error,
            },
          });
        },
      }
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
