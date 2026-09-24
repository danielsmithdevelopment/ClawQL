/**
 * Pre-registered §7 held-out suite (synthetic — adjudicated=false).
 * JSON twin: ./fixtures/fast-decision-held-out-v0.1.json
 */

import type { HeldOutSuiteManifest } from "./types.js";

export const FAST_DECISION_HELD_OUT_V01: HeldOutSuiteManifest = {
  suiteId: "fast-decision-held-out-v0.1",
  description:
    "Pre-registered synthetic held-out shapes for §7 harness wiring. adjudicated=false until frontier-judge labels land — do not cite as productionTrusted.",
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
          features: {
            label: "slack notify",
            description: "Post a Slack message",
          },
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
          features: {
            label: "github pull requests",
            description: "List open GitHub PRs",
          },
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
          features: {
            label: "deed of trust",
            description: "Security instrument / deed of trust",
          },
        },
        {
          candidateId: "invoice",
          features: { label: "invoice", description: "Accounts payable invoice" },
        },
        {
          candidateId: "engagement_letter",
          features: {
            label: "engagement letter",
            description: "Legal engagement letter",
          },
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
          features: {
            label: "novel local field",
            description: "Project-local novel field name",
          },
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
          features: {
            label: "borrower_name",
            description: "Primary borrower legal name",
          },
        },
      ],
      groundTruthCandidateId: "has_springing_lien",
      adjudicated: false,
    },
  ],
};
