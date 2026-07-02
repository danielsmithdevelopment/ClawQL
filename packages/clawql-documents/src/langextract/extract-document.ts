import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { z } from "zod";
import { langextractBaseUrl, langextractDefaultModelId, langextractToolEnabled } from "./env.js";

const extractionExampleSchema = z.object({
  extraction_class: z.string().min(1),
  extraction_text: z.string().min(1),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const exampleSchema = z.object({
  text: z.string().min(1),
  extractions: z.array(extractionExampleSchema).min(1),
});

export const extractDocumentToolSchema = {
  text: z
    .string()
    .min(1)
    .max(2_097_152)
    .describe(
      "Unstructured source text (typically Docling markdown or Tika output). LangExtract runs after layout/text parse."
    ),
  prompt_description: z
    .string()
    .min(1)
    .max(8192)
    .optional()
    .describe("Natural-language extraction instructions for LangExtract."),
  schema_preset: z
    .enum(["w2"])
    .optional()
    .describe("Built-in few-shot preset when examples are omitted (demo: w2)."),
  examples: z
    .array(exampleSchema)
    .max(20)
    .optional()
    .describe("Few-shot LangExtract examples (text + grounded extractions)."),
  model_id: z
    .string()
    .optional()
    .describe("LLM model id (default LANGEXTRACT_MODEL_ID or gemini-2.5-flash)."),
  write_html: z
    .boolean()
    .optional()
    .describe(
      "When true, sidecar writes interactive HTML viz to disk and returns path references only."
    ),
  doc_id: z.string().optional().describe("Stable id for artifact file names and audit."),
};

export type ExtractDocumentInput = {
  text: string;
  prompt_description?: string;
  schema_preset?: "w2";
  examples?: Array<{
    text: string;
    extractions: Array<{
      extraction_class: string;
      extraction_text: string;
      attributes?: Record<string, unknown>;
    }>;
  }>;
  model_id?: string;
  write_html?: boolean;
  doc_id?: string;
};

export type GroundedExtraction = {
  extraction_class: string;
  extraction_text: string;
  attributes?: Record<string, unknown>;
  char_interval?: { start: number; end: number } | null;
};

export type ExtractDocumentResult = {
  ok: boolean;
  provider?: "langextract-sidecar" | "heuristic-local";
  model_id?: string;
  extractions?: GroundedExtraction[];
  artifact_paths?: {
    jsonl_path?: string;
    html_path?: string;
  };
  error?: string;
};

const W2_PROMPT =
  "Extract W-2 wage and tax form fields with character-level grounding. Drop extractions without char_interval.";

const W2_EXAMPLES = [
  {
    text: "Box 1  Wages, tips, other compensation:     85000.00\nEmployee:\n  Name: JANE Q PUBLIC",
    extractions: [
      {
        extraction_class: "wages",
        extraction_text: "85000.00",
        attributes: { box: "1" },
      },
      {
        extraction_class: "employee_name",
        extraction_text: "JANE Q PUBLIC",
        attributes: {},
      },
    ],
  },
];

function findSpan(text: string, needle: string): { start: number; end: number } | null {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return { start: idx, end: idx + needle.length };
}

function heuristicExtract(input: ExtractDocumentInput): ExtractDocumentResult {
  const text = input.text;
  const extractions: GroundedExtraction[] = [];

  const wagesMatch = text.match(/Box\s*1[^\d]*(\d[\d,]*\.\d{2})/i);
  if (wagesMatch?.[1]) {
    const span = findSpan(text, wagesMatch[1]);
    extractions.push({
      extraction_class: "wages",
      extraction_text: wagesMatch[1],
      attributes: { box: "1" },
      char_interval: span,
    });
  }

  const nameMatch = text.match(/Employee:\s*\n\s*Name:\s*([A-Z][A-Z .'-]+)/i);
  if (nameMatch?.[1]) {
    const span = findSpan(text, nameMatch[1].trim());
    extractions.push({
      extraction_class: "employee_name",
      extraction_text: nameMatch[1].trim(),
      attributes: {},
      char_interval: span,
    });
  }

  const grounded = extractions.filter((e) => e.char_interval != null);

  return {
    ok: true,
    provider: "heuristic-local",
    model_id: "heuristic-local",
    extractions: grounded,
  };
}

function resolvePromptAndExamples(input: ExtractDocumentInput): {
  prompt_description: string;
  examples: ExtractDocumentInput["examples"];
} {
  if (input.schema_preset === "w2") {
    return {
      prompt_description: input.prompt_description ?? W2_PROMPT,
      examples: input.examples ?? W2_EXAMPLES,
    };
  }
  return {
    prompt_description: input.prompt_description ?? "Extract structured entities with grounding.",
    examples: input.examples,
  };
}

export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  const baseUrl = langextractBaseUrl();
  if (!baseUrl) {
    return heuristicExtract(input);
  }

  const { prompt_description, examples } = resolvePromptAndExamples(input);
  const body = {
    text: input.text,
    prompt_description,
    examples,
    model_id: input.model_id ?? langextractDefaultModelId(),
    write_html: input.write_html ?? false,
    doc_id: input.doc_id,
  };

  const url = `${baseUrl.replace(/\/$/, "")}/extract`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `langextract HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as ExtractDocumentResult;
    if (!parsed.ok) {
      return { ok: false, error: parsed.error ?? "langextract sidecar returned ok=false" };
    }
    return {
      ok: true,
      provider: "langextract-sidecar",
      model_id: parsed.model_id,
      extractions: parsed.extractions,
      artifact_paths: parsed.artifact_paths,
    };
  } catch {
    return { ok: false, error: `langextract returned non-JSON: ${text.slice(0, 200)}` };
  }
}

export async function handleExtractDocumentToolInput(
  params: ExtractDocumentInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("extract_document", {
    textChars: params.text.length,
    schemaPreset: params.schema_preset,
    exampleCount: params.examples?.length,
    writeHtml: params.write_html === true,
    docIdLen: params.doc_id?.length,
  });

  if (!langextractToolEnabled()) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            error:
              "extract_document is disabled. Set CLAWQL_ENABLE_LANGEXTRACT=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
          }),
        },
      ],
    };
  }

  const result = await extractDocument(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
