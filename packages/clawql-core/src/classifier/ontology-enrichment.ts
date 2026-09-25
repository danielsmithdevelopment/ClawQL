/**
 * Pack ontology / capability catalog into Fast Decision classify text + labels.
 * Without this, extras.ontologyContext never reaches GLiNER (§6.4 gap).
 *
 * Anti-pattern candidates often ship query-lexical bait ("grep springing lien")
 * that dominates GLiNER over structured tools. Enrichment rewrites those labels
 * from ontology whenNotToUse so the classifier can prefer SQL/recall.
 */

import type { CapabilityEntry, CapabilityOntology } from "./capability-ontology.js";
import { indexCapabilityOntology, lookupCapability } from "./capability-ontology.js";
import type { FastDecisionCandidate, FastDecisionContext } from "./types.js";

const MAX_ONTOLOGY_CHARS = 3200;
const MAX_LABEL_CHARS = 520;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatEntryLine(c: CapabilityEntry): string {
  const flags = [
    c.kind,
    c.ontologyRole,
    c.requiresStructuredCorpus ? "needs_structured_corpus" : "no_corpus_required",
  ].join(",");
  if (c.kind === "anti_pattern") {
    return `- ${c.capabilityId} [ANTI_PATTERN/${c.ontologyRole}]: DO_NOT_USE_WHEN: ${c.whenNotToUse} | only_if_no_corpus: ${c.whenToUse}`;
  }
  return `- ${c.capabilityId} [${flags}]: USE: ${c.whenToUse} | AVOID: ${c.whenNotToUse}`;
}

/** Compact ontology block for classify `text` (query prefix/suffix). */
export function formatCapabilityOntologyBlock(
  ontology: CapabilityOntology,
  opts?: { readonly onlyIds?: ReadonlySet<string>; readonly maxChars?: number }
): string {
  const max = opts?.maxChars ?? MAX_ONTOLOGY_CHARS;
  const index = indexCapabilityOntology(ontology);
  let caps = ontology.capabilities;
  if (opts?.onlyIds && opts.onlyIds.size > 0) {
    const picked: CapabilityEntry[] = [];
    for (const id of opts.onlyIds) {
      const hit = lookupCapability(index, id);
      if (hit && !picked.some((p) => p.capabilityId === hit.capabilityId)) {
        picked.push(hit);
      }
    }
    if (picked.length > 0) caps = picked;
  }
  const header = [
    `Capability ontology (${ontology.ontologyId}):`,
    ontology.description,
    "Routing rule: when the task needs exact cohort N or ontology flags, prefer structured_query / ontology_recall over anti_pattern shell/grep.",
  ].join("\n");
  let body = header;
  for (const c of caps) {
    const line = formatEntryLine(c);
    if (body.length + line.length + 1 > max) break;
    body += `\n${line}`;
  }
  return body;
}

function packFeatureBag(features: Record<string, unknown>, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const k of keys) {
    const v = features[k];
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${v}`);
    } else {
      try {
        parts.push(`${k}=${JSON.stringify(v)}`);
      } catch {
        /* skip */
      }
    }
  }
  return parts.join("; ");
}

/**
 * Enrich a candidate description with ontology whenToUse + feature context.
 * Anti-patterns: drop query-lexical bait from the original label/description
 * and lead with ANTI_PATTERN + whenNotToUse so GLiNER is not baited by
 * overlapping tokens (e.g. "springing lien" in a bash candidate).
 */
export function enrichCandidateDescription(
  candidate: FastDecisionCandidate,
  ontology?: CapabilityOntology
): string {
  if (!ontology) {
    return truncate(
      String(
        candidate.features.description ??
          candidate.features.label ??
          candidate.features.name ??
          candidate.candidateId
      ),
      MAX_LABEL_CHARS
    );
  }

  const index = indexCapabilityOntology(ontology);
  const hit = lookupCapability(index, candidate.candidateId);
  if (!hit) {
    const base = String(
      candidate.features.description ??
        candidate.features.label ??
        candidate.features.name ??
        candidate.candidateId
    );
    const packed = packFeatureBag(candidate.features, [
      "ontologyContext",
      "cacheSnapshot",
      "auditRefs",
      "vocabulary",
      "preferredVocabulary",
      "decision",
    ]);
    return truncate(packed ? `${base} | ${packed}` : base, MAX_LABEL_CHARS);
  }

  // Already enriched by enrichFastDecisionRequest — rebuild once from ontology.
  if (hit.kind === "anti_pattern") {
    // Keep wording abstract — never echo query-domain tokens (lien, HSR, …)
    // or GLiNER re-baits onto the anti-pattern via lexical overlap.
    return truncate(
      [
        `ANTI_PATTERN:${hit.label}`,
        "role=dispreferred_unstructured_hunt",
        `DO_NOT_USE_WHEN=${hit.whenNotToUse}`,
        `only_if_no_structured_corpus=${hit.whenToUse}`,
        "prefer=structured_query|ontology_recall",
        "score_hint=low_when_corpus_exists",
      ].join(" | "),
      MAX_LABEL_CHARS
    );
  }

  const parts = [
    hit.requiresStructuredCorpus ? "STRUCTURED_CORPUS_PREFERRED" : hit.label,
    `whenToUse=${hit.whenToUse}`,
    `whenNotToUse=${hit.whenNotToUse}`,
    `ontology=${hit.capabilityId}(${hit.kind}/${hit.ontologyRole})`,
  ];
  if (hit.requiresStructuredCorpus) {
    parts.push("requiresStructuredCorpus=true");
  }
  // Preserve candidate-specific wording so alias siblings (e.g. HSR filing vs
  // second-request-only) stay distinguishable under one ontology capability.
  const origLabel = String(candidate.features.label ?? candidate.features.name ?? "").trim();
  const rawDesc = String(candidate.features._rawDescription ?? "").trim();
  const featureDesc = String(candidate.features.description ?? "").trim();
  // Prefer pre-enrichment raw text; skip if description was already rewritten.
  const specific =
    rawDesc ||
    (featureDesc && !featureDesc.includes("whenToUse=") && !featureDesc.startsWith("ANTI_PATTERN")
      ? featureDesc
      : "");
  if (origLabel && !/^ANTI_PATTERN|STRUCTURED_CORPUS/i.test(origLabel)) {
    parts.push(`label=${origLabel}`);
  }
  if (specific && specific !== origLabel) {
    const safe = /(?:^|\b)(?:bash|grep)\b|\/workspace/i.test(specific)
      ? specific.slice(0, 40)
      : specific.slice(0, 160);
    parts.push(`detail=${safe}`);
  }
  if (candidate.candidateId !== hit.capabilityId) {
    parts.push(`aliasOf=${candidate.candidateId}`);
  }
  const packed = packFeatureBag(candidate.features, [
    "ontologyContext",
    "cacheSnapshot",
    "auditRefs",
    "vocabulary",
    "preferredVocabulary",
    "decision",
  ]);
  if (packed) parts.push(packed);
  return truncate(parts.join(" | "), MAX_LABEL_CHARS);
}

export type EnrichClassifyTextArgs = {
  readonly query: string;
  readonly taskFraming?: string;
  readonly ontology?: CapabilityOntology;
  readonly ctx?: FastDecisionContext;
  readonly candidateIds?: readonly string[];
};

/**
 * Build classify text: query + task framing + ontology block from ctx.extras
 * and/or the ClawQL capability catalog scoped to candidates.
 */
export function composeOntologyEnrichedClassifyText(args: EnrichClassifyTextArgs): string {
  const q = args.query.trim();
  const framing = args.taskFraming?.trim() ?? "";
  const chunks: string[] = [];
  if (q) chunks.push(q);

  const extras = args.ctx?.extras ?? {};
  const briefFromExtras =
    typeof extras.ontologyBrief === "string" && extras.ontologyBrief.trim()
      ? extras.ontologyBrief.trim()
      : undefined;

  if (briefFromExtras) {
    chunks.push(briefFromExtras);
  } else if (extras.ontologyContext && typeof extras.ontologyContext === "object") {
    chunks.push(`Task ontology: ${JSON.stringify(extras.ontologyContext)}`);
  } else if (args.ontology) {
    const only = args.candidateIds?.length ? new Set(args.candidateIds) : undefined;
    chunks.push(formatCapabilityOntologyBlock(args.ontology, { onlyIds: only }));
  }

  if (framing) chunks.push(`Task: ${framing}`);
  return truncate(chunks.filter(Boolean).join("\n\n"), MAX_ONTOLOGY_CHARS + 800);
}

/** Build the exact classify payload body the scorer would send (for A/B dumps). */
export function buildOntologyEnrichedClassifyPayload(args: {
  readonly useSiteId: string;
  readonly query: string;
  readonly candidates: readonly FastDecisionCandidate[];
  readonly ontology?: CapabilityOntology;
  readonly taskFraming?: string;
  readonly ctx?: FastDecisionContext;
  readonly model?: string;
}): {
  readonly text: string;
  readonly labels: readonly { readonly id: string; readonly description: string }[];
} {
  const ctx = args.ctx ?? { sessionId: "dump", query: args.query };
  const text = args.ontology
    ? composeOntologyEnrichedClassifyText({
        query: args.query,
        taskFraming: args.taskFraming,
        ontology: args.ontology,
        ctx,
        candidateIds: args.candidates.map((c) => c.candidateId),
      })
    : args.taskFraming?.trim()
      ? `${args.query.trim()}\n\nTask: ${args.taskFraming.trim()}`
      : args.query.trim();
  return {
    text,
    labels: args.candidates.map((c) => ({
      id: c.candidateId,
      description: enrichCandidateDescription(c, args.ontology),
    })),
  };
}

/** Attach capability ontology onto candidates + ctx.extras for held-out / runtime. */
export function enrichFastDecisionRequest(args: {
  readonly ctx: FastDecisionContext;
  readonly candidates: readonly FastDecisionCandidate[];
  readonly ontology: CapabilityOntology;
}): {
  readonly ctx: FastDecisionContext;
  readonly candidates: readonly FastDecisionCandidate[];
} {
  const index = indexCapabilityOntology(args.ontology);
  const candidates = args.candidates.map((c) => {
    const hit = lookupCapability(index, c.candidateId);
    if (!hit) return c;
    return {
      candidateId: c.candidateId,
      features: {
        ...c.features,
        ontologyCapabilityId: hit.capabilityId,
        ontologyKind: hit.kind,
        ontologyRole: hit.ontologyRole,
        ontologyWhenToUse: hit.whenToUse,
        ontologyWhenNotToUse: hit.whenNotToUse,
        requiresStructuredCorpus: hit.requiresStructuredCorpus,
        // Preserve raw bait under _rawDescription for debugging; scorer uses description.
        _rawDescription: c.features.description,
        description: enrichCandidateDescription(c, args.ontology),
      },
    };
  });
  const onlyIds = new Set(args.candidates.map((c) => c.candidateId));
  return {
    ctx: {
      ...args.ctx,
      extras: {
        ...args.ctx.extras,
        capabilityOntologyId: args.ontology.ontologyId,
        ontologyBrief: formatCapabilityOntologyBlock(args.ontology, { onlyIds }),
      },
    },
    candidates,
  };
}
