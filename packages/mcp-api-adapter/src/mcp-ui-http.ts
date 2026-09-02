import express, { type Express, type Request, type Response } from "express";
import { httpBodyFromCollapsed } from "./call.js";
import type { VerifiedMcpAdapterAtr } from "./edge-auth.js";
import {
  FormValidationError,
  escapeMcpUiHtml,
  fieldErrorFromMessage,
  parseFormArgs,
  renderToolFormFields,
} from "./mcp-ui-form.js";
import { canProcessDocuments, filterToolsForAtr } from "./mcp-ui-atr.js";
import {
  createGeneratedUi,
  deleteGeneratedUiBySlug,
  getGeneratedUiBySlug,
  type GeneratedUiDefinition,
} from "./mcp-ui-generate.js";
import {
  AGENT_LAB_PRESET_SLUG,
  McpUiPresetError,
  runResolveAgentLabPreset,
} from "./mcp-ui-presets.js";
import { runRenderAgentLabLandingPage } from "./mcp-ui-agent-lab-html.js";
import {
  renderMcpUiCatalogPage,
  renderMcpUiCustomFormPage,
  renderMcpUiErrorResult,
  renderMcpUiProgressShell,
  renderMcpUiSuccessResult,
} from "./mcp-ui-html.js";
import {
  isMultipartRequest,
  mergeFilesIntoArgs,
  parseMultipartRequest,
} from "./mcp-ui-multipart.js";
import {
  createProgressJob,
  getProgressJob,
  isLongRunningTool,
  pushProgressEvent,
  subscribeProgress,
} from "./mcp-ui-progress.js";
import { formHintsForTool } from "./mcp-ui-templates.js";
import {
  buildContextFlamegraph,
  DEMO_TRACE_SESSION_COMPRESSED,
  DEMO_TRACE_SESSION_FAT,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR,
  demoCompressedVsFatRecords,
  demoExecutorCmpRecords,
  demoTraceTokenizationMeta,
  executorCmpTraceTokenizationMeta,
  buildExecutorCmpComparePageOpts,
  executorCmpJsonEnvelope,
  resolveTraceRecords,
  type TraceCallRecord,
} from "./mcp-ui-trace.js";
import { liveTraceTokenizationMeta } from "./inference-trace-bridge.js";
import {
  renderContextFlamegraphPage,
  renderTraceComparePage,
  renderTraceNotFoundPage,
} from "./mcp-ui-trace-html.js";
import { isSafeToolPathName } from "./schema-convert.js";
import type { CallToolFn, ListedMcpTool, ToolCatalog } from "./types.js";

export const DEFAULT_MCP_UI_PATH = "/mcp-ui";

function pickCompareQueryParam(
  query: Request["query"],
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const raw = query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function isValidTraceSessionId(id: string): boolean {
  return id.length > 0 && id.length <= 200 && !/[^\w.:@+-]/.test(id);
}

async function buildLiveCompareGraph(
  sessionId: string,
  listTraceCalls: NonNullable<AttachMcpUiOptions["listTraceCalls"]>
): Promise<ReturnType<typeof buildContextFlamegraph> | null> {
  const records = await resolveTraceRecords(sessionId, listTraceCalls);
  if (!records) return null;
  return buildContextFlamegraph(sessionId, records, {
    tokenization: traceTokenizationMeta(sessionId, records),
  });
}

function traceTokenizationMeta(
  sessionId: string,
  records: TraceCallRecord[]
): { label: string; encoding?: string; method?: string } {
  if (sessionId === DEMO_TRACE_SESSION_COMPRESSED || sessionId === DEMO_TRACE_SESSION_FAT) {
    return demoTraceTokenizationMeta() ?? { label: "cl100k_base (OpenAI tiktoken)" };
  }
  if (records.some((r) => r.messages.some((m) => m.tokens != null))) {
    return liveTraceTokenizationMeta();
  }
  if (records.some((r) => r.usage?.inputTokens != null)) {
    return {
      ...liveTraceTokenizationMeta(),
      label:
        "Live inference — provider usage totals; per-message estimated (chars ÷ 4) where not tokenized",
    };
  }
  return { label: "Estimated (chars ÷ 4)" };
}

export type AttachMcpUiOptions = {
  getCatalog: () => ToolCatalog;
  callTool: CallToolFn;
  title?: string;
  path?: string;
  /** Filter catalog/execute by `req.mcpAtr` (default true). */
  atrScoped?: boolean;
  /** Max uploaded file size in bytes (default 25 MiB). */
  maxUploadBytes?: number;
  /**
   * Optional host hook: return inference-shaped call records for a session /
   * correlation id (e.g. from clawql-inference). Built-in demos
   * `demo-compressed` / `demo-fat` work without this.
   */
  listTraceCalls?: (
    sessionId: string
  ) => TraceCallRecord[] | Promise<TraceCallRecord[]>;
};

type RequestWithAtr = Request & { mcpAtr?: VerifiedMcpAdapterAtr };

function asFormBody(req: Request): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function atrFromRequest(req: Request): VerifiedMcpAdapterAtr | undefined {
  return (req as RequestWithAtr).mcpAtr;
}

function documentsProcessingAllowed(
  atr: VerifiedMcpAdapterAtr | undefined,
  atrScoped: boolean
): boolean {
  if (!atrScoped || !atr) return true;
  return canProcessDocuments(atr);
}

function preferredBase64Field(inputSchema: Record<string, unknown>): string | undefined {
  const props = inputSchema.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return undefined;
  if ("pdf_base64" in props) return "pdf_base64";
  if ("base64" in props) return "base64";
  if ("file" in props) return "file";
  return undefined;
}

function stripUploadMeta(args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  delete out.__upload_filename;
  delete out.__upload_mime;
  delete out.__sse;
  return out;
}

async function resolveExecuteArgs(
  req: Request,
  tool: ListedMcpTool,
  options: {
    atr: VerifiedMcpAdapterAtr | undefined;
    atrScoped: boolean;
    maxUploadBytes: number;
  }
): Promise<Record<string, unknown>> {
  const inputSchema = (tool.inputSchema ?? {
    type: "object",
    properties: {},
  }) as Record<string, unknown>;

  let rawBody: Record<string, unknown>;
  let hadFiles = false;

  if (isMultipartRequest(req)) {
    const parsed = await parseMultipartRequest(req, { maxFileBytes: options.maxUploadBytes });
    hadFiles = Object.keys(parsed.files).length > 0;
    if (hadFiles && !documentsProcessingAllowed(options.atr, options.atrScoped)) {
      throw new FormValidationError(
        "Forbidden — document/file processing is outside your ATR scope",
        [{ message: "Forbidden — document/file processing is outside your ATR scope" }]
      );
    }
    const merged = mergeFilesIntoArgs(
      parsed.fields,
      parsed.files,
      preferredBase64Field(inputSchema)
    );
    rawBody = merged;
  } else {
    rawBody = asFormBody(req);
  }

  const args = parseFormArgs(rawBody, inputSchema);
  return stripUploadMeta(args);
}

function renderExecuteError(
  res: Response,
  toolName: string,
  err: unknown,
  status: number
): void {
  if (err instanceof FormValidationError) {
    res.status(status).type("html").send(
      renderMcpUiErrorResult({
        toolName,
        message: err.message,
        fieldErrors: err.fields,
      })
    );
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).type("html").send(renderMcpUiErrorResult({ toolName, message }));
}

async function runToolAndRender(
  options: AttachMcpUiOptions,
  tool: ListedMcpTool,
  args: Record<string, unknown>
): Promise<{ html: string; ok: boolean }> {
  const started = Date.now();
  try {
    const result = await options.callTool(tool, args);
    const body = httpBodyFromCollapsed(result);
    return {
      ok: true,
      html: renderMcpUiSuccessResult({
        toolName: tool.name,
        executionMs: Date.now() - started,
        body,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const withResult = err as Error & { result?: unknown };
    const details =
      withResult.result !== undefined
        ? JSON.stringify(withResult.result, null, 2)
        : undefined;
    const fieldErr = fieldErrorFromMessage(message);
    return {
      ok: false,
      html: renderMcpUiErrorResult({
        toolName: tool.name,
        message,
        details,
        fieldErrors: fieldErr.field ? [fieldErr] : undefined,
      }),
    };
  }
}

function startBackgroundJob(
  options: AttachMcpUiOptions,
  tool: ListedMcpTool,
  args: Record<string, unknown>,
  basePath: string
): string {
  const job = createProgressJob(tool.name);
  pushProgressEvent(job, { type: "progress", message: "Queued…", percent: 0 });

  void (async () => {
    pushProgressEvent(job, {
      type: "progress",
      message: `Calling ${tool.name}…`,
      percent: 15,
    });
    const { html, ok } = await runToolAndRender(options, tool, args);
    if (ok) {
      pushProgressEvent(job, {
        type: "complete",
        message: "Done",
        percent: 100,
        resultHtml: html,
      });
    } else {
      pushProgressEvent(job, {
        type: "error",
        message: "Tool failed",
        percent: 100,
        resultHtml: html,
      });
    }
  })();

  return renderMcpUiProgressShell({
    jobId: job.id,
    toolName: tool.name,
    basePath,
  });
}

export function attachMcpUiRoutes(app: Express, options: AttachMcpUiOptions): string {
  const basePath =
    (options.path?.trim() || DEFAULT_MCP_UI_PATH).replace(/\/$/, "") || DEFAULT_MCP_UI_PATH;
  const atrScoped = options.atrScoped !== false;
  const maxUploadBytes = options.maxUploadBytes ?? 25 * 1024 * 1024;
  const router = express.Router();

  router.use(express.urlencoded({ extended: false, limit: "2mb" }));
  router.use(express.json({ limit: "1mb" }));

  router.get("/", (req, res) => {
    const catalog = options.getCatalog();
    const atr = atrFromRequest(req);
    const tools = filterToolsForAtr(catalog.tools, atr, atrScoped);
    res.type("html").send(
      renderMcpUiCatalogPage({
        title: options.title ?? "MCP API Adapter",
        tools,
        fetchedAt: catalog.fetchedAt,
        upstream: catalog.upstream,
        basePath,
      })
    );
  });

  router.get("/trace/compare", async (req, res) => {
    const leftId = pickCompareQueryParam(req.query, "left", "compressed");
    const rightId = pickCompareQueryParam(req.query, "right", "fat");
    const wantJson = String(req.query.format ?? "").toLowerCase() === "json";

    if (leftId && rightId && options.listTraceCalls) {
      if (!isValidTraceSessionId(leftId) || !isValidTraceSessionId(rightId)) {
        res.status(400).type("html").send(
          renderTraceNotFoundPage(leftId || rightId, {
            basePath,
            hint: "Compare session ids must be short alphanumeric tokens.",
          })
        );
        return;
      }
      try {
        const [cGraph, fGraph] = await Promise.all([
          buildLiveCompareGraph(leftId, options.listTraceCalls),
          buildLiveCompareGraph(rightId, options.listTraceCalls),
        ]);
        if (!cGraph || !fGraph) {
          res.status(404).type("html").send(
            renderTraceNotFoundPage(leftId, {
              basePath,
              hint: `Missing live trace for ${!cGraph ? leftId : rightId}. Run both sessions first.`,
            })
          );
          return;
        }
        if (wantJson) {
          res.status(200).json({ compressed: cGraph, fat: fGraph, live: true, left: leftId, right: rightId });
          return;
        }
        res.status(200).type("html").send(
          renderTraceComparePage(cGraph, fGraph, {
            basePath,
            focus: String(req.query.focus ?? "input").toLowerCase() === "all" ? "all" : "input",
            heading: "Both-sides compression — live inference sessions",
            subheading:
              "Shared scale on input context · real model calls · cl100k_base tokenization · model output omitted from ratio",
            leftPanel: {
              title: `${leftId} (compressed)`,
              subtitle: "Projected search/execute tool results",
            },
            rightPanel: {
              title: `${rightId} (fat)`,
              subtitle: "Untrimmed tool dumps — same task",
              emphasis: true,
            },
            footerNote: `JSON: <a href="${escapeMcpUiHtml(basePath)}/trace/compare?left=${encodeURIComponent(leftId)}&amp;right=${encodeURIComponent(rightId)}&amp;format=json">compare</a>
              · <a href="${escapeMcpUiHtml(basePath)}/trace/${encodeURIComponent(leftId)}?format=json">${escapeMcpUiHtml(leftId)}</a>
              · <a href="${escapeMcpUiHtml(basePath)}/trace/${encodeURIComponent(rightId)}?format=json">${escapeMcpUiHtml(rightId)}</a>
              · <a href="${escapeMcpUiHtml(basePath)}/trace/compare?left=${encodeURIComponent(leftId)}&amp;right=${encodeURIComponent(rightId)}&amp;focus=all">include outputs</a>`,
          })
        );
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(502).type("html").send(
          renderTraceNotFoundPage(leftId, {
            basePath,
            hint: `Failed to load live compare: ${message}`,
          })
        );
        return;
      }
    }

    const { compressed, fat } = demoCompressedVsFatRecords("compare");
    const tok = demoTraceTokenizationMeta();
    const cGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_COMPRESSED, compressed, {
      tokenization: tok,
    });
    const fGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_FAT, fat, { tokenization: tok });
    if (wantJson) {
      res.status(200).json({ compressed: cGraph, fat: fGraph });
      return;
    }
    res.status(200).type("html").send(
      renderTraceComparePage(cGraph, fGraph, {
        basePath,
        focus: String(req.query.focus ?? "input").toLowerCase() === "all" ? "all" : "input",
      })
    );
  });

  router.get("/trace/compare/executor", async (req, res) => {
    const wantJson = String(req.query.format ?? "").toLowerCase() === "json";
    const { clawql, executor } = demoExecutorCmpRecords("executor-cmp-compare");
    const tok = executorCmpTraceTokenizationMeta();
    const cGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL, clawql, {
      tokenization: tok,
    });
    const eGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR, executor, {
      tokenization: tok,
    });
    const focus =
      String(req.query.focus ?? "input").toLowerCase() === "all" ? "all" : "input";
    if (wantJson) {
      res.status(200).json(executorCmpJsonEnvelope(focus, cGraph, eGraph));
      return;
    }
    res.status(200).type("html").send(
      renderTraceComparePage(cGraph, eGraph, buildExecutorCmpComparePageOpts(basePath, focus))
    );
  });

  router.get("/trace/:sessionId", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId || sessionId.length > 200 || /[^\w.:@+-]/.test(sessionId)) {
      res
        .status(400)
        .type("html")
        .send(
          renderTraceNotFoundPage(sessionId || "(empty)", {
            basePath,
            hint: "Session id must be a short alphanumeric token (or a built-in demo id).",
          })
        );
      return;
    }

    let records: TraceCallRecord[] | null;
    try {
      records = await resolveTraceRecords(sessionId, options.listTraceCalls);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res
        .status(502)
        .type("html")
        .send(
          renderTraceNotFoundPage(sessionId, {
            basePath,
            hint: `Failed to load trace: ${message}`,
          })
        );
      return;
    }

    if (!records) {
      res.status(404).type("html").send(
        renderTraceNotFoundPage(sessionId, {
          basePath,
          hint: options.listTraceCalls
            ? "No inference calls for this session id."
            : "Provide listTraceCalls on AttachMcpUiOptions, or open demo-compressed / demo-fat.",
        })
      );
      return;
    }

    const graph = buildContextFlamegraph(sessionId, records, {
      tokenization: traceTokenizationMeta(sessionId, records),
    });
    const wantJson =
      String(req.query.format ?? "").toLowerCase() === "json" ||
      (req.accepts(["html", "json"]) === "json" &&
        String(req.query.format ?? "").toLowerCase() !== "html");

    if (wantJson) {
      res.status(200).json(graph);
      return;
    }
    res.status(200).type("html").send(renderContextFlamegraphPage(graph, { basePath }));
  });

  router.get("/progress/:jobId/result", (req, res) => {
    const jobId = String(req.params.jobId ?? "");
    const job = getProgressJob(jobId);
    if (!job?.resultHtml) {
      res.status(404).type("text").send("Result not ready");
      return;
    }
    res.status(200).type("html").send(job.resultHtml);
  });

  router.get("/progress/:jobId", (req, res) => {
    const jobId = String(req.params.jobId ?? "");
    const job = getProgressJob(jobId);
    if (!job) {
      res.status(404).type("text").send("Unknown progress job");
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: {
      type: string;
      message: string;
      percent?: number;
      at: string;
    }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "complete" || event.type === "error") {
        res.end();
      }
    };

    const unsub = subscribeProgress(job, send);
    req.on("close", () => {
      unsub();
    });
  });

  router.get("/presets/agent-lab", (req, res) => {
    const atr = atrFromRequest(req);
    const catalog = options.getCatalog();
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    try {
      const definition = runResolveAgentLabPreset(authorized);
      res.type("html").send(
        runRenderAgentLabLandingPage({
          basePath,
          title: options.title ?? "MCP API Adapter",
          definition,
        })
      );
    } catch (err) {
      const reason =
        err instanceof McpUiPresetError
          ? err.reason
          : err instanceof Error
            ? err.message
            : String(err);
      res.status(400).type("html").send(
        runRenderAgentLabLandingPage({
          basePath,
          title: options.title ?? "MCP API Adapter",
          definition: {
            title: "Docs Agent Lab",
            description:
              "HTMX-scaffolded multi-step view that does not exist as a static page on the docs site.",
            slug: AGENT_LAB_PRESET_SLUG,
            steps: [],
          },
          error: reason,
        })
      );
    }
  });

  router.post("/presets/agent-lab/start", (req, res) => {
    const atr = atrFromRequest(req);
    const catalog = options.getCatalog();
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    try {
      const definition = runResolveAgentLabPreset(authorized);
      deleteGeneratedUiBySlug(AGENT_LAB_PRESET_SLUG);
      const form = createGeneratedUi(definition, authorized);
      res.redirect(303, `${basePath}/custom/${encodeURIComponent(form.slug)}`);
    } catch (err) {
      const reason =
        err instanceof McpUiPresetError
          ? err.reason
          : err instanceof Error
            ? err.message
            : String(err);
      res.status(400).type("html").send(
        runRenderAgentLabLandingPage({
          basePath,
          title: options.title ?? "MCP API Adapter",
          definition: {
            title: "Docs Agent Lab",
            description:
              "HTMX-scaffolded multi-step view that does not exist as a static page on the docs site.",
            slug: AGENT_LAB_PRESET_SLUG,
            steps: [],
          },
          error: reason,
        })
      );
    }
  });

  router.post("/generate", (req, res) => {
    const atr = atrFromRequest(req);
    const catalog = options.getCatalog();
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    const body = (req.body ?? {}) as GeneratedUiDefinition & { preset?: string };
    try {
      let definition: GeneratedUiDefinition = body;
      if (body.preset === "agent-lab" || body.preset === AGENT_LAB_PRESET_SLUG) {
        definition = runResolveAgentLabPreset(authorized);
        deleteGeneratedUiBySlug(AGENT_LAB_PRESET_SLUG);
      }
      const form = createGeneratedUi(definition, authorized);
      res.status(201).json({
        id: form.id,
        slug: form.slug,
        title: form.title,
        description: form.description,
        steps: form.steps,
        url: `${basePath}/custom/${form.slug}`,
      });
    } catch (err) {
      const message =
        err instanceof McpUiPresetError
          ? err.reason
          : err instanceof Error
            ? err.message
            : String(err);
      res.status(400).json({ error: message });
    }
  });

  router.get("/custom/:slug", (req, res) => {
    const slug = String(req.params.slug ?? "");
    const form = getGeneratedUiBySlug(slug);
    if (!form) {
      res.status(404).type("html").send("<p>Unknown custom form</p>");
      return;
    }
    const atr = atrFromRequest(req);
    const catalog = options.getCatalog();
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    const step = form.steps[form.currentStepIndex];
    if (!step) {
      res.type("html").send(
        renderMcpUiCustomFormPage({
          form,
          tool: undefined,
          fieldsHtml: "",
          hasFileFields: false,
          basePath,
          title: options.title ?? "MCP API Adapter",
          done: true,
        })
      );
      return;
    }
    const tool = authorized.find((t) => t.name === step.tool);
    if (!tool) {
      res
        .status(403)
        .type("html")
        .send(
          renderMcpUiErrorResult({
            toolName: step.tool,
            message: "Forbidden — this step tool is outside your ATR scope",
          })
        );
      return;
    }
    const hints = formHintsForTool(tool);
    const { html: fieldsHtml, hasFileFields } = renderToolFormFields(tool, hints);
    res.type("html").send(
      renderMcpUiCustomFormPage({
        form,
        tool,
        fieldsHtml,
        hasFileFields,
        basePath,
        title: options.title ?? "MCP API Adapter",
        done: false,
      })
    );
  });

  router.post("/custom/:slug/step", async (req, res) => {
    const slug = String(req.params.slug ?? "");
    const form = getGeneratedUiBySlug(slug);
    if (!form) {
      res.status(404).type("html").send(renderMcpUiErrorResult({ toolName: slug, message: "Unknown custom form" }));
      return;
    }
    const step = form.steps[form.currentStepIndex];
    if (!step) {
      res.status(400).type("html").send(renderMcpUiErrorResult({ toolName: slug, message: "Workflow already complete" }));
      return;
    }

    const atr = atrFromRequest(req);
    const catalog = options.getCatalog();
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    const tool = authorized.find((t) => t.name === step.tool);
    if (!tool) {
      res
        .status(403)
        .type("html")
        .send(
          renderMcpUiErrorResult({
            toolName: step.tool,
            message: "Forbidden — this step tool is outside your ATR scope",
          })
        );
      return;
    }

    let args: Record<string, unknown>;
    try {
      args = await resolveExecuteArgs(req, tool, { atr, atrScoped, maxUploadBytes });
    } catch (err) {
      const status =
        err instanceof FormValidationError && /Forbidden/.test(err.message) ? 403 : 400;
      renderExecuteError(res, tool.name, err, status);
      return;
    }

    const started = Date.now();
    try {
      const result = await options.callTool(tool, args);
      const body = httpBodyFromCollapsed(result);
      form.stepOutputs[tool.name] = body;
      form.currentStepIndex += 1;
      const next = form.steps[form.currentStepIndex];
      const nextHint = next
        ? `<p class="field-help">Next: <a href="${escapeMcpUiHtml(`${basePath}/custom/${encodeURIComponent(form.slug)}`)}">${escapeMcpUiHtml(next.label ?? next.tool)}</a></p>`
        : `<p class="field-help">Workflow complete.</p>`;
      res.status(200).type("html").send(
        `${renderMcpUiSuccessResult({
          toolName: tool.name,
          executionMs: Date.now() - started,
          body,
        })}${nextHint}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).type("html").send(renderMcpUiErrorResult({ toolName: tool.name, message }));
    }
  });

  router.post("/execute/:toolName", async (req, res) => {
    const toolName = String(req.params.toolName ?? "");
    if (!isSafeToolPathName(toolName)) {
      res
        .status(400)
        .type("html")
        .send(renderMcpUiErrorResult({ toolName, message: "Invalid tool name" }));
      return;
    }

    const catalog = options.getCatalog();
    const atr = atrFromRequest(req);
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    const tool = authorized.find((t) => t.name === toolName);
    if (!tool) {
      const exists = catalog.tools.some((t) => t.name === toolName);
      res
        .status(exists ? 403 : 404)
        .type("html")
        .send(
          renderMcpUiErrorResult({
            toolName,
            message: exists
              ? "Forbidden — this tool is outside your ATR scope"
              : "Unknown tool",
          })
        );
      return;
    }

    let args: Record<string, unknown>;
    try {
      args = await resolveExecuteArgs(req, tool, { atr, atrScoped, maxUploadBytes });
    } catch (err) {
      const status =
        err instanceof FormValidationError && /Forbidden/.test(err.message) ? 403 : 400;
      renderExecuteError(res, toolName, err, status);
      return;
    }

    if (isLongRunningTool(toolName)) {
      res.status(200).type("html").send(startBackgroundJob(options, tool, args, basePath));
      return;
    }

    const { html, ok } = await runToolAndRender(options, tool, args);
    res.status(ok ? 200 : 502).type("html").send(html);
  });

  app.use(basePath, router);
  return basePath;
}
