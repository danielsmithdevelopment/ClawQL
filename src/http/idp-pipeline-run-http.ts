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

import { bearerFromRequest, checkWebhookToken } from "./webhooks/webhook-token-auth.js";

export async function handleIdpPipelineRunRequest(req: Request, res: Response): Promise<void> {
  const auth = checkWebhookToken({
    expectedEnvName: "CLAWQL_IDP_PIPELINE_RUN_TOKEN",
    presented: bearerFromRequest(req),
  });
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
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
