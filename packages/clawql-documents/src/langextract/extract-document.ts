import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { z } from "zod";
import {
  langextractBaseUrl,
  langextractBackend,
  langextractDefaultModelId,
  langextractToolEnabled,
} from "./env.js";

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
    .enum(["w2", "title_commitment", "purchase_agreement", "buyer_offer"])
    .optional()
    .describe(
      "Built-in few-shot preset when examples are omitted (w2, title_commitment, purchase_agreement, buyer_offer)."
    ),
  examples: z
    .array(exampleSchema)
    .max(20)
    .optional()
    .describe("Few-shot LangExtract examples (text + grounded extractions)."),
  model_id: z
    .string()
    .optional()
    .describe(
      "LLM model id for live sidecar (default LANGEXTRACT_MODEL_ID). OpenRouter: e.g. deepseek/deepseek-chat; Ollama: e.g. gemma2:2b."
    ),
  backend: z
    .enum(["openrouter", "ollama", "openai_compatible"])
    .optional()
    .describe(
      "Live sidecar backend override (default LANGEXTRACT_BACKEND or openrouter). Use ollama for local models."
    ),
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
  schema_preset?: "w2" | "title_commitment" | "purchase_agreement" | "buyer_offer";
  examples?: Array<{
    text: string;
    extractions: Array<{
      extraction_class: string;
      extraction_text: string;
      attributes?: Record<string, unknown>;
    }>;
  }>;
  model_id?: string;
  backend?: "openrouter" | "ollama" | "openai_compatible";
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
  backend?: string;
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

const TITLE_COMMITMENT_PROMPT =
  "Extract title commitment Schedule A and Schedule B fields with character-level grounding.";

const TITLE_COMMITMENT_EXAMPLES = [
  {
    text: "Property Address: 123 Main Street\nPolicy Amount: $485,000.00\nSCHEDULE B — EXCEPTIONS\n3. Easement for utilities recorded in Instrument No. 2015-002211",
    extractions: [
      {
        extraction_class: "property_address",
        extraction_text: "123 Main Street",
        attributes: {},
      },
      {
        extraction_class: "policy_amount",
        extraction_text: "485,000.00",
        attributes: { schedule: "A" },
      },
      {
        extraction_class: "schedule_b_exception",
        extraction_text: "Easement for utilities recorded in Instrument No. 2015-002211",
        attributes: { item: "3" },
      },
    ],
  },
];

const PURCHASE_AGREEMENT_PROMPT =
  "Extract purchase and sale agreement fields with character-level grounding.";

const PURCHASE_AGREEMENT_EXAMPLES = [
  {
    text: "Buyer: ALEX M SAMPLE\nSeller: JORDAN T DEMO\nPurchase Price: $485,000.00\nEarnest Money Deposit: $10,000.00\nClosing Date: July 15, 2026",
    extractions: [
      {
        extraction_class: "buyer_name",
        extraction_text: "ALEX M SAMPLE",
        attributes: {},
      },
      {
        extraction_class: "seller_name",
        extraction_text: "JORDAN T DEMO",
        attributes: {},
      },
      {
        extraction_class: "purchase_price",
        extraction_text: "485,000.00",
        attributes: {},
      },
      {
        extraction_class: "earnest_money",
        extraction_text: "10,000.00",
        attributes: {},
      },
      {
        extraction_class: "closing_date",
        extraction_text: "July 15, 2026",
        attributes: {},
      },
    ],
  },
];

const BUYER_OFFER_PROMPT =
  "Extract buyer offer / purchase agreement fields including contingencies with character-level grounding.";

const BUYER_OFFER_EXAMPLES = [
  {
    text: "Purchase Price: $478,000.00\nEarnest Money: $8,000.00\nClosing Date: August 1, 2026\nFinancing Contingency: Conventional loan, 21 days to secure commitment\nInspection Contingency: 10 days from acceptance\nAppraisal Contingency: Property must appraise at or above purchase price",
    extractions: [
      {
        extraction_class: "purchase_price",
        extraction_text: "478,000.00",
        attributes: {},
      },
      {
        extraction_class: "earnest_money",
        extraction_text: "8,000.00",
        attributes: {},
      },
      {
        extraction_class: "closing_date",
        extraction_text: "August 1, 2026",
        attributes: {},
      },
      {
        extraction_class: "financing_contingency",
        extraction_text: "Conventional loan, 21 days to secure commitment",
        attributes: {},
      },
      {
        extraction_class: "inspection_contingency",
        extraction_text: "10 days from acceptance",
        attributes: {},
      },
      {
        extraction_class: "appraisal_contingency",
        extraction_text: "Property must appraise at or above purchase price",
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

function appendPurchaseAgreementFields(text: string, extractions: GroundedExtraction[]): void {
  const priceMatch = text.match(/Purchase Price:\s*\$?([\d,]+\.\d{2})/i);
  if (priceMatch?.[1]) {
    extractions.push({
      extraction_class: "purchase_price",
      extraction_text: priceMatch[1],
      attributes: {},
      char_interval: findSpan(text, priceMatch[1]),
    });
  }
  const earnestMatch = text.match(/Earnest Money(?: Deposit)?:\s*\$?([\d,]+\.\d{2})/i);
  if (earnestMatch?.[1]) {
    extractions.push({
      extraction_class: "earnest_money",
      extraction_text: earnestMatch[1],
      attributes: {},
      char_interval: findSpan(text, earnestMatch[1]),
    });
  }
  const closingMatch = text.match(/Closing Date:\s*([^\n]+)/i);
  if (closingMatch?.[1]) {
    const val = closingMatch[1].trim();
    extractions.push({
      extraction_class: "closing_date",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
  const buyerMatch = text.match(/Buyer:\s*([A-Z][A-Z .'-]+)/i);
  if (buyerMatch?.[1]) {
    const val = buyerMatch[1].trim();
    extractions.push({
      extraction_class: "buyer_name",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
  const sellerMatch = text.match(/Seller:\s*([A-Z][A-Z .'-]+)/i);
  if (sellerMatch?.[1]) {
    const val = sellerMatch[1].trim();
    extractions.push({
      extraction_class: "seller_name",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
}

function appendBuyerOfferContingencies(text: string, extractions: GroundedExtraction[]): void {
  const financingMatch = text.match(/Financing Contingency:\s*([^\n]+)/i);
  if (financingMatch?.[1]) {
    const val = financingMatch[1].trim();
    extractions.push({
      extraction_class: "financing_contingency",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
  const inspectionMatch = text.match(/Inspection Contingency:\s*([^\n]+)/i);
  if (inspectionMatch?.[1]) {
    const val = inspectionMatch[1].trim();
    extractions.push({
      extraction_class: "inspection_contingency",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
  const appraisalMatch = text.match(/Appraisal Contingency:\s*([^\n]+)/i);
  if (appraisalMatch?.[1]) {
    const val = appraisalMatch[1].trim();
    extractions.push({
      extraction_class: "appraisal_contingency",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
  const saleMatch = text.match(/Sale of Buyer'?s?(?: Current)? Property:\s*([^\n]+)/i);
  if (saleMatch?.[1]) {
    const val = saleMatch[1].trim();
    extractions.push({
      extraction_class: "sale_of_home_contingency",
      extraction_text: val,
      attributes: {},
      char_interval: findSpan(text, val),
    });
  }
}

function heuristicExtract(input: ExtractDocumentInput): ExtractDocumentResult {
  const text = input.text;
  const extractions: GroundedExtraction[] = [];

  if (input.schema_preset === "title_commitment") {
    const addressMatch = text.match(/Property Address:\s*([^\n]+)/i);
    if (addressMatch?.[1]) {
      const val = addressMatch[1].trim();
      extractions.push({
        extraction_class: "property_address",
        extraction_text: val,
        attributes: {},
        char_interval: findSpan(text, val),
      });
    }
    const policyMatch = text.match(/Policy Amount:\s*\$?([\d,]+\.\d{2})/i);
    if (policyMatch?.[1]) {
      extractions.push({
        extraction_class: "policy_amount",
        extraction_text: policyMatch[1],
        attributes: { schedule: "A" },
        char_interval: findSpan(text, policyMatch[1]),
      });
    }
    const exceptionsBlock = text.split(/SCHEDULE B — EXCEPTIONS/i)[1];
    if (exceptionsBlock) {
      const exceptionRe = /^\s*(\d+)\.\s+(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = exceptionRe.exec(exceptionsBlock)) !== null && extractions.length < 12) {
        const val = match[2].trim();
        const offset = text.indexOf(val, text.indexOf(exceptionsBlock));
        extractions.push({
          extraction_class: "schedule_b_exception",
          extraction_text: val,
          attributes: { item: match[1] },
          char_interval:
            offset >= 0 ? { start: offset, end: offset + val.length } : findSpan(text, val),
        });
      }
    }
  } else if (
    input.schema_preset === "purchase_agreement" ||
    input.schema_preset === "buyer_offer"
  ) {
    appendPurchaseAgreementFields(text, extractions);
    if (input.schema_preset === "buyer_offer") {
      appendBuyerOfferContingencies(text, extractions);
    }
  } else {
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
  if (input.schema_preset === "title_commitment") {
    return {
      prompt_description: input.prompt_description ?? TITLE_COMMITMENT_PROMPT,
      examples: input.examples ?? TITLE_COMMITMENT_EXAMPLES,
    };
  }
  if (input.schema_preset === "purchase_agreement") {
    return {
      prompt_description: input.prompt_description ?? PURCHASE_AGREEMENT_PROMPT,
      examples: input.examples ?? PURCHASE_AGREEMENT_EXAMPLES,
    };
  }
  if (input.schema_preset === "buyer_offer") {
    return {
      prompt_description: input.prompt_description ?? BUYER_OFFER_PROMPT,
      examples: input.examples ?? BUYER_OFFER_EXAMPLES,
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
    backend: input.backend ?? langextractBackend(),
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
      backend: parsed.backend,
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
