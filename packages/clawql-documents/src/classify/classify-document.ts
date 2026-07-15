import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { classifierBaseUrl, classifierMinConfidence, idpClassifierToolEnabled } from "./env.js";
import { classifyDocumentToolZodShape, decodeClassifyDocumentInput } from "../schema/index.js";

/** @deprecated Prefer {@link classifyDocumentToolZodShape}. */
export const classifyDocumentToolSchema = classifyDocumentToolZodShape;

export type ClassifyDocumentInput = {
  doc_id?: string;
  docling_md?: string;
  docling_json?: Record<string, unknown>;
  text?: string;
  min_confidence?: number;
};

export type ClassifyDocumentResult = {
  ok: boolean;
  label?: string;
  confidence?: number;
  model_version?: string;
  needs_hitl?: boolean;
  min_confidence?: number;
  error?: string;
};

/** Local keyword heuristic when `CLASSIFIER_BASE_URL` is unset. */
export function heuristicClassify(input: ClassifyDocumentInput): ClassifyDocumentResult {
  const corpus = [input.docling_md, input.text, JSON.stringify(input.docling_json ?? {})]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  let label = "unknown";
  let confidence = 0.5;
  if (/form\s*w-?2|w-?2\s*wage|wages,\s*tips/i.test(corpus)) {
    label = "w2";
    confidence = 0.92;
  } else if (/1099|miscellaneous income/i.test(corpus)) {
    label = "1099";
    confidence = 0.88;
  } else if (/pay\s*stub|earnings statement/i.test(corpus)) {
    label = "pay_stub";
    confidence = 0.86;
  } else if (
    /title\s*commitment|schedule\s*b|alta\s*commitment|commitment\s*for\s*title/i.test(corpus)
  ) {
    label = "title_commitment";
    confidence = 0.91;
  } else if (
    /buyer\s*offer|offer\s*to\s*purchase|fsbo\s*offer|counter\s*offer\s*to\s*purchase/i.test(corpus)
  ) {
    label = "buyer_offer";
    confidence = 0.89;
  } else if (
    /purchase\s*(and\s*)?sale|purchase\s*price|earnest\s*money|residential\s*contract/i.test(corpus)
  ) {
    label = "purchase_agreement";
    confidence = 0.9;
  } else if (/appraisal\s*report|uniform\s*residential|urar/i.test(corpus)) {
    label = "appraisal";
    confidence = 0.87;
  } else if (/hoa|homeowners\s*association|condo\s*disclosure/i.test(corpus)) {
    label = "hoa_disclosure";
    confidence = 0.86;
  }
  const minConf = input.min_confidence ?? classifierMinConfidence();
  return {
    ok: true,
    label,
    confidence,
    model_version: "heuristic-local",
    min_confidence: minConf,
    needs_hitl: confidence < minConf,
  };
}

export type ClassifierHttpResponse = {
  status: number;
  text: string;
};

/** POST to remote classifier; pure HTTP IO (no result shaping). */
export async function postClassifierHttp(
  input: ClassifyDocumentInput,
  baseUrl: string
): Promise<ClassifierHttpResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/classify`;
  const body = {
    doc_id: input.doc_id,
    docling_md: input.docling_md,
    docling_json: input.docling_json,
    text: input.text,
    min_confidence: input.min_confidence ?? classifierMinConfidence(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  return { status: res.status, text: await res.text() };
}

/** Map HTTP body → classify result (sync). */
export function parseClassifierHttpResponse(
  input: ClassifyDocumentInput,
  response: ClassifierHttpResponse
): ClassifyDocumentResult {
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: `classifier HTTP ${response.status}: ${response.text.slice(0, 500)}`,
    };
  }

  try {
    const parsed = JSON.parse(response.text) as Record<string, unknown>;
    const label = typeof parsed.label === "string" ? parsed.label : "unknown";
    const confidence =
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : Number.parseFloat(String(parsed.confidence ?? "0"));
    const minConf = input.min_confidence ?? classifierMinConfidence();
    const needsHitl =
      typeof parsed.needs_hitl === "boolean"
        ? parsed.needs_hitl
        : Number.isFinite(confidence) && confidence < minConf;
    return {
      ok: true,
      label,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      model_version: typeof parsed.model_version === "string" ? parsed.model_version : undefined,
      min_confidence: minConf,
      needs_hitl: needsHitl,
    };
  } catch {
    return { ok: false, error: `classifier returned non-JSON: ${response.text.slice(0, 200)}` };
  }
}

/** Promise façade — prefer {@link executeClassifyDocumentEffect} for Effect callers. */
export async function classifyDocument(
  input: ClassifyDocumentInput
): Promise<ClassifyDocumentResult> {
  const baseUrl = classifierBaseUrl();
  if (!baseUrl) {
    return heuristicClassify(input);
  }
  const response = await postClassifierHttp(input, baseUrl);
  return parseClassifierHttpResponse(input, response);
}

export async function handleClassifyDocumentToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeClassifyDocumentInput(params));
  logMcpToolShape("classify_document", {
    docIdLen: parsed.doc_id?.length,
    doclingMdChars: parsed.docling_md?.length,
    hasDoclingJson: Boolean(parsed.docling_json),
    textChars: parsed.text?.length,
  });

  if (!idpClassifierToolEnabled()) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            error:
              "classify_document is disabled. Set CLAWQL_ENABLE_IDP_CLASSIFIER=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
          }),
        },
      ],
    };
  }

  const { runDocumentsEffect, documentsClassifyProgram } =
    await import("../effect/documents-effect-runtime.js");
  const result = await runDocumentsEffect(documentsClassifyProgram(parsed));
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
