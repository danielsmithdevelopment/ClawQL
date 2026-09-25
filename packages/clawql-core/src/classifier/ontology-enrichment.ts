/**
 * Pack ontology / capability catalog into Fast Decision classify text + labels.
 *
 * Normative rules (capability-ontology-from-catalog-v0.1 §3.3):
 * - Per-candidate rows — do not collapse siblings onto one shared paragraph.
 * - Anti-bait applies to every packed string (whenToUse, whenNotToUse, distinguishFrom.reason).
 * - requiresStructuredCorpus is never packed into GLiNER text/labels.
 */

import type { CapabilityEntry, CapabilityOntology } from "./capability-ontology.js";
import { indexCapabilityOntology, lookupCapability } from "./capability-ontology.js";
import type { DistinguishFromEntry } from "../plugin/routing-hint.js";
import type { FastDecisionCandidate, FastDecisionContext } from "./types.js";

const MAX_ONTOLOGY_CHARS = 3200;
const MAX_LABEL_CHARS = 520;

/** Tokens that must not appear in packed enrichment (query-lexical bait / shared family flags). */
const FORBIDDEN_PACKED = [
  /STRUCTURED_CORPUS_PREFERRED/i,
  /requiresStructuredCorpus\s*=/i,
  /needs_structured_corpus/i,
  /springing[-\s]?lien/i,
  /\bHSR_SECOND_REQUEST\b/i,
  /\bHSR\b/i,
  /path=\/workspace/i,
  /\bgrep\b/i,
  /\bbash\b/i,
];

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Strip or blank strings that would re-bait GLiNER via lexical overlap. */
export function sanitizePackedHint(text: string): string {
  let s = text.trim();
  for (const re of FORBIDDEN_PACKED) {
    if (re.test(s)) {
      // Drop the whole string rather than emit bait; callers supply abstract replacements.
      return "";
    }
  }
  return s;
}

function formatEntryLine(c: CapabilityEntry): string {
  // Never emit requiresStructuredCorpus / family flags into classify text.
  if (c.kind === "anti_pattern") {
    const avoid = sanitizePackedHint(c.whenNotToUse) || "prefer structured catalog tools when available";
    const only = sanitizePackedHint(c.whenToUse) || "only when no structured path exists";
    return `- ${c.capabilityId} [ANTI_PATTERN]: DO_NOT_USE_WHEN: ${avoid} | only_if_no_corpus: ${only}`;
  }
  const use = sanitizePackedHint(c.whenToUse) || c.label;
  const avoid = sanitizePackedHint(c.whenNotToUse) || "not when a more specific sibling matches";
  return `- ${c.capabilityId} [${c.kind}/${c.ontologyRole}]: USE: ${use} | AVOID: ${avoid}`;
}

function formatDistinguish(entries: readonly DistinguishFromEntry[] | undefined): string {
  if (!entries?.length) return "";
  const parts: string[] = [];
  for (const d of entries) {
    const reason = sanitizePackedHint(d.reason);
    if (!reason) continue;
    parts.push(`vs ${d.peerId}: ${reason}`);
  }
  return parts.join(" | ");
}

/** Compact ontology block for classify `text` — per-id lines only (no shared family flags). */
export function formatCapabilityOntologyBlock(
  ontology: CapabilityOntology,
  opts?: { readonly onlyIds?: ReadonlySet<string>; readonly maxChars?: number }
): string {
  const max = opts?.maxChars ?? MAX_ONTOLOGY_CHARS;
  const index = indexCapabilityOntology(ontology);
  let caps: CapabilityEntry[] = [...ontology.capabilities];
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
    `Capability ontology (${ontology.ontologyId}${ontology.digestSha256 ? `; digest=${ontology.digestSha256.slice(0, 12)}` : ""}):`,
    ontology.description,
    "Prefer the candidate whose whenToUse best matches the task; respect distinguishFrom siblings.",
  ].join("\n");
  let body = header;
  for (const c of caps) {
    let line = formatEntryLine(c);
    const dist = formatDistinguish(c.distinguishFrom);
    if (dist) line += ` | ${dist}`;
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
 * Enrich a candidate description from its own catalog row (exact id).
 * Never packs requiresStructuredCorpus or shared STRUCTURED_CORPUS_PREFERRED.
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
    return truncate(base, MAX_LABEL_CHARS);
  }

  if (hit.kind === "anti_pattern") {
    const avoid =
      sanitizePackedHint(hit.whenNotToUse) ||
      "Prefer structured catalog tools when a schema or corpus path exists";
    const only = sanitizePackedHint(hit.whenToUse) || "only when no structured path exists";
    return truncate(
      [
        `ANTI_PATTERN:${hit.label}`,
        "role=dispreferred_unstructured_hunt",
        `DO_NOT_USE_WHEN=${avoid}`,
        `only_if_no_structured_path=${only}`,
      ].join(" | "),
      MAX_LABEL_CHARS
    );
  }

  const use = sanitizePackedHint(hit.whenToUse);
  const avoid = sanitizePackedHint(hit.whenNotToUse);
  const parts = [`id=${hit.capabilityId}`, `kind=${hit.kind}/${hit.ontologyRole}`];
  if (use) parts.push(`whenToUse=${use}`);
  if (avoid) parts.push(`whenNotToUse=${avoid}`);

  const origLabel = String(candidate.features.label ?? candidate.features.name ?? "").trim();
  const rawDesc = String(candidate.features._rawDescription ?? "").trim();
  const featureDesc = String(candidate.features.description ?? "").trim();
  const specific =
    rawDesc ||
    (featureDesc && !featureDesc.includes("whenToUse=") && !featureDesc.startsWith("ANTI_PATTERN")
      ? featureDesc
      : "");
  if (origLabel && !/^ANTI_PATTERN/i.test(origLabel)) {
    const safeLabel = sanitizePackedHint(origLabel) || origLabel.slice(0, 80);
    if (safeLabel) parts.push(`label=${safeLabel}`);
  }
  if (specific && specific !== origLabel) {
    const safe = sanitizePackedHint(specific);
    if (safe) parts.push(`detail=${safe.slice(0, 160)}`);
  }

  const dist = formatDistinguish(hit.distinguishFrom);
  if (dist) parts.push(dist);

  // Mirror distinguishFrom from peers that name this candidate.
  for (const peer of ontology.capabilities) {
    for (const d of peer.distinguishFrom ?? []) {
      if (d.peerId === candidate.candidateId || d.peerId === hit.capabilityId) {
        const reason = sanitizePackedHint(d.reason);
        if (reason) parts.push(`peer_vs ${peer.capabilityId}: ${reason}`);
      }
    }
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

/** True when two distinguishFrom siblings would pack to identical label text (harvey-008 guard). */
export function distinguishFromSiblingsHaveIdenticalPackedLabels(
  ontology: CapabilityOntology,
  aId: string,
  bId: string
): boolean {
  const a = enrichCandidateDescription({ candidateId: aId, features: { label: aId } }, ontology);
  const b = enrichCandidateDescription({ candidateId: bId, features: { label: bId } }, ontology);
  return a === b;
}

export type EnrichClassifyTextArgs = {
  readonly query: string;
  readonly taskFraming?: string;
  readonly ontology?: CapabilityOntology;
  readonly ctx?: FastDecisionContext;
  readonly candidateIds?: readonly string[];
};

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
  readonly ontologyDigest?: string;
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
    ontologyDigest: args.ontology?.digestSha256,
  };
}

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
        // Metadata only — scorer must not pack this into GLiNER labels.
        requiresStructuredCorpus: hit.requiresStructuredCorpus,
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
        ontologyDigest: args.ontology.digestSha256,
        ontologyBrief: formatCapabilityOntologyBlock(args.ontology, { onlyIds }),
      },
    },
    candidates,
  };
}
