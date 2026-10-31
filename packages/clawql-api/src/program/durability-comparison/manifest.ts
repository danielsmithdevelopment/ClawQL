/**
 * Regenerable tip package manifest for the durability comparison board.
 */

import {
  COMPARISON_PACKAGE_ID,
  TIP_RUNTIME,
  TIP_RUNTIME_VERSION,
} from "./constants.js";
import type { ComparisonEvidence, ComparisonPackageManifest } from "./types.js";

const COLUMNS = [
  "arm",
  "runtime",
  "runtimeVersion",
  "harnessCommit",
  "crashPhase",
  "upstreamMode",
  "duplicates",
  "outcomeUnknown",
  "completedExactlyOnce",
  "intentPresentOnResume",
  "callVerifiedSent",
  "n",
  "status",
] as const;

const ORDER = [
  "1. Rerun ClawQL arms on stock celld 0.6.3 at N=50; mark 0.4.0 rows superseded",
  "2. Add runtime/version, intentPresentOnResume, callVerifiedSent; every arm has column values (peers: null until adapter)",
  "3. Keep wedged-owner (and stale-owner) as separate rows from during_call",
  "4. Run N=50 expansion pilots on this tip harness commit (include peers when adapters exist)",
  "5. Send package + pilot results for maintainer configuration review",
  "6. Final N=1000 after review",
] as const;

export function buildComparisonPackageManifest(
  evidence: ComparisonEvidence
): ComparisonPackageManifest {
  return {
    kind: "durability-comparison-package",
    schemaVersion: 2,
    packageId: evidence.packageId || COMPARISON_PACKAGE_ID,
    tipRuntime: evidence.tipRuntime || TIP_RUNTIME,
    tipRuntimeVersion: evidence.tipRuntimeVersion || TIP_RUNTIME_VERSION,
    harnessCommit: evidence.harnessCommit,
    defaultN: evidence.defaultN,
    generatedAt: new Date().toISOString(),
    order: [...ORDER],
    columns: [...COLUMNS],
    boardEvidence: "docs/benchmarks/durability-proof/comparison/evidence.json",
    fleetTipEvidence: [
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n1000-v3-correctness-availability.json",
        role: "during_call outside-write tip (v3; partial until measured) — NOT wedge",
        celldBinaryVersion: "0.6.3",
        status: "partial",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json",
        role: "wedged_owner tip N=100 (own row)",
        celldBinaryVersion: "0.6.3",
        status: "measured",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json",
        role: "stale_owner tip N=40 (own row)",
        celldBinaryVersion: "0.6.3",
        status: "measured",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-evidence.json",
        role: "published Tier C N=1000 (pre-tip pin era — superseded)",
        celldBinaryVersion: null,
        status: "superseded",
      },
    ],
    superseded: [
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-evidence.json",
        reason: "Measured under pre-0.6.3 pin; package must match shipped runtime celld 0.6.3",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n1000-claim-path.json",
        reason: "0.4.0-era claim-path board; superseded by tip 0.6.3 v3",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n1000-correctness-availability.json",
        reason: "v2 board on older binary; tip package uses stock 0.6.3",
      },
      {
        path: "docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-during-call-fenced.json",
        reason: "clawql.2 fork fence board; tip stock 0.6.3 closes the path without fork",
      },
      {
        path: "docs/benchmarks/durability-proof/comparison/evidence.json@N=20",
        reason: "Prior tip remasure used N=20; not comparable to peer N=50 pilots — superseded by N=50 remasure",
      },
    ],
    expansionPilots: [
      {
        id: "peer-four-phases",
        status: "planned",
        arms: ["pi-durable", "golem", "clawql-program-celld"],
        nPilot: 50,
        note: "Real peer adapters still during_call-only when wired. Model sims cover during_call today. Add before_intent, after_intent_before_call, after_call_before_journal, idle on real adapters.",
      },
      {
        id: "wedged-owner",
        status: "partial",
        arms: ["clawql-program-celld", "pi-durable", "golem"],
        nPilot: 50,
        note: "Own row (not folded into during_call). ClawQL tip N=100 measured; peer adapters still pending_adapter — pilot N=50 when wired.",
      },
      {
        id: "stale-owner",
        status: "partial",
        arms: ["clawql-program-celld", "golem"],
        nPilot: 50,
        note: "Own row. ClawQL tip N=40 measured; Pi Durable N/A. Golem pilot N=50 on tip harness when adapter lands.",
      },
      {
        id: "lost-ack",
        status: "pilot_n50",
        arms: ["clawql-file-journal", "clawql-program-celld", "pi-durable", "golem"],
        nPilot: 50,
        note: "ClawQL file-journal lost_ack row measured at N=50 (idempotent / lookup_by_reference / neither). Program-celld + real peers still planned.",
      },
      {
        id: "neither-keys-nor-lookup",
        status: "pilot_n50",
        arms: ["clawql-file-journal", "clawql-program-celld", "pi-durable", "golem"],
        nPilot: 50,
        note: "Covered as non_idempotent mode on clawql-file-journal lost_ack row (no idempotency key). Peer/program-celld pending.",
      },
      {
        id: "peer-model-sims",
        status: "planned",
        arms: ["golem-at-least-once-sim", "pi-interrupt-sim"],
        nPilot: 50,
        note: "Internal harness only (DURABILITY_COMPARISON_INCLUDE_PEER_SIMS=1). Never publish as peer rows. Live Golem/Pi N=50 exists on PR #1432 — rewire reference-pr1432 adapters to schema v2; archive evidence-pr1432-live-peers-n50.json.",
      },
      {
        id: "pi-real-model",
        status: "planned",
        arms: ["pi-durable"],
        nPilot: 50,
        note: "Live Pi Durable adapter + real model; needs API key and maintainer config review before any public numbers.",
      },
    ],
  };
}
