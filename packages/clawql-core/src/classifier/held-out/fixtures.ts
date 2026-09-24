/**
 * Pre-registered §7 held-out suite (synthetic — adjudicated=false).
 * JSON twin: ./fixtures/fast-decision-held-out-v0.1.json
 * Keep in sync with the JSON file (all 9 builtin use sites).
 */

import type { HeldOutSuiteManifest } from "./types.js";

export const FAST_DECISION_HELD_OUT_V01: HeldOutSuiteManifest = {
  suiteId: "fast-decision-held-out-v0.1",
  description:
    "Pre-registered synthetic held-out shapes covering all 9 builtin use sites for §7 harness wiring. adjudicated=false until frontier-judge labels land — do not cite as productionTrusted.",
  cases: [
    {
      caseId: "skill-fp-001",
      useSiteId: "skill_fast_path_match",
      query: "extract springing lien fields from the closing package",
      candidates: [
        {
          candidateId: "skill.extract.springing_lien",
          features: {
            label: "extract springing lien",
            description: "Committed skill for springing lien extraction from closing packages",
          },
        },
        {
          candidateId: "skill.slack.notify",
          features: { label: "slack notify", description: "Post a Slack message" },
        },
        {
          candidateId: "skill.generic.search",
          features: {
            label: "generic search",
            description: "Broad provider search without domain skill",
          },
        },
      ],
      groundTruthCandidateId: "skill.extract.springing_lien",
      adjudicated: false,
      notes: "Ambiguous vs generic search — hard case for §7",
    },
    {
      caseId: "skill-fp-002",
      useSiteId: "skill_fast_path_match",
      query: "list open Linear issues assigned to me",
      candidates: [
        {
          candidateId: "skill.linear.list_assigned",
          features: {
            label: "linear list assigned",
            description: "List Linear issues assigned to the current user",
          },
        },
        {
          candidateId: "skill.github.prs",
          features: { label: "github pull requests", description: "List open GitHub PRs" },
        },
      ],
      groundTruthCandidateId: "skill.linear.list_assigned",
      adjudicated: false,
    },
    {
      caseId: "doc-type-001",
      useSiteId: "document_entity_type_classification",
      query:
        "This Deed of Trust secures the Note with a power of sale and springing lien language.",
      candidates: [
        {
          candidateId: "deed_of_trust",
          features: { label: "deed of trust", description: "Security instrument / deed of trust" },
        },
        {
          candidateId: "invoice",
          features: { label: "invoice", description: "Accounts payable invoice" },
        },
        {
          candidateId: "engagement_letter",
          features: { label: "engagement letter", description: "Legal engagement letter" },
        },
      ],
      groundTruthCandidateId: "deed_of_trust",
      adjudicated: false,
    },
    {
      caseId: "vocab-001",
      useSiteId: "ontology_vocabulary_term_match",
      query: "promotion candidate field: has_springing_lien on mortgage security instruments",
      candidates: [
        {
          candidateId: "fibo:SpringingLien",
          features: {
            label: "FIBO SpringingLien",
            description: "FIBO term for springing lien on security instruments",
          },
        },
        {
          candidateId: "schema:PaymentMethod",
          features: {
            label: "Schema.org PaymentMethod",
            description: "General payment method entity",
          },
        },
        {
          candidateId: "novel:has_springing_lien",
          features: { label: "novel local field", description: "Project-local novel field name" },
        },
      ],
      groundTruthCandidateId: "fibo:SpringingLien",
      adjudicated: false,
    },
    {
      caseId: "field-map-001",
      useSiteId: "field_to_schema_mapping",
      query: "extracted value: 'yes — lien springs on default of the mezzanine note'",
      candidates: [
        {
          candidateId: "has_springing_lien",
          features: {
            label: "has_springing_lien",
            description: "Layer 1 boolean: springing lien present",
          },
        },
        {
          candidateId: "maturity_date",
          features: { label: "maturity_date", description: "Note maturity date" },
        },
        {
          candidateId: "borrower_name",
          features: { label: "borrower_name", description: "Primary borrower legal name" },
        },
      ],
      groundTruthCandidateId: "has_springing_lien",
      adjudicated: false,
    },
    {
      caseId: "search-route-001",
      useSiteId: "search_provider_tool_routing",
      query: "find the OpenAPI operation that creates a Linear issue comment",
      candidates: [
        {
          candidateId: "linear.create_comment",
          features: { label: "linear create comment", description: "POST Linear issue comment" },
        },
        {
          candidateId: "github.create_issue_comment",
          features: {
            label: "github create issue comment",
            description: "POST GitHub issue comment",
          },
        },
        {
          candidateId: "slack.chat_postMessage",
          features: { label: "slack post message", description: "Slack chat.postMessage" },
        },
      ],
      groundTruthCandidateId: "linear.create_comment",
      adjudicated: false,
      notes: "Near-duplicate GitHub vs Linear comment tools",
    },
    {
      caseId: "pattern-001",
      useSiteId: "pattern_consistency_check",
      query:
        "occurrence resembles a mezzanine springing-lien clause; maturity field is blank (required)",
      candidates: [
        {
          candidateId: "match",
          features: {
            label: "match",
            description: "Select match only when maturity and other required fields are filled",
          },
        },
        {
          candidateId: "mismatch",
          features: {
            label: "mismatch",
            description: "Select mismatch only when filled fields contradict the pattern",
          },
        },
        {
          candidateId: "uncertain",
          features: {
            label: "uncertain",
            description: "Select uncertain when maturity is blank (required field missing)",
          },
        },
      ],
      groundTruthCandidateId: "uncertain",
      adjudicated: false,
      notes: "Blank maturity should not force a false-positive match",
    },
    {
      caseId: "rel-edge-001",
      useSiteId: "relationship_edge_classification",
      query: "Borrower LLC is guarantor on the mezzanine note secured by the Deed of Trust",
      candidates: [
        {
          candidateId: "guarantees",
          features: { label: "guarantees", description: "Entity guarantees an obligation" },
        },
        {
          candidateId: "owns",
          features: { label: "owns", description: "Equity ownership edge" },
        },
        {
          candidateId: "secures",
          features: { label: "secures", description: "Collateral secures a note" },
        },
      ],
      groundTruthCandidateId: "guarantees",
      adjudicated: false,
    },
    {
      caseId: "sgdop-pre-001",
      useSiteId: "sgdop_peer_prefilter",
      query:
        "pending work: write ontology cache blocks for promotion; peers available: ontology-cache-writer, slack-notifier, pdf-ocr-sidecar",
      candidates: [
        {
          candidateId: "ontology-cache-writer",
          features: {
            label: "ontology-cache-writer",
            description: "Writes ontology cache blocks for promotion",
          },
        },
        {
          candidateId: "slack-notifier",
          features: { label: "slack-notifier", description: "Posts Slack notifications" },
        },
        {
          candidateId: "pdf-ocr-sidecar",
          features: { label: "pdf-ocr-sidecar", description: "OCR for scanned PDFs" },
        },
      ],
      groundTruthCandidateId: "ontology-cache-writer",
      adjudicated: false,
      notes: "Coarse prefilter — false_negative is costly; query must state pending work",
    },
    {
      caseId: "precompact-001",
      useSiteId: "pre_compaction_ontology_cache_check",
      query:
        "tool result: extracted has_springing_lien=true with FIBO SpringingLien match and prior WORM audit",
      candidates: [
        {
          candidateId: "cache_this",
          features: {
            label: "cache_this",
            description:
              "Keep in ontology/stable cache across compaction when FIBO match and WORM audit exist",
          },
        },
        {
          candidateId: "dont_cache_this",
          features: {
            label: "dont_cache_this",
            description: "Drop before compaction when extraction is unstable or unaudited",
          },
        },
      ],
      groundTruthCandidateId: "cache_this",
      adjudicated: false,
    },
  ],
};
