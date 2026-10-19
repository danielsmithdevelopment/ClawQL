/**
 * Model-identity compliance report from inference store records.
 *
 * Proves: which resolved model ids/providers were served in a period, and that
 * none matched a prohibited vendor under the active policy.
 * Does NOT prove weight origin / training lineage — say that in the report limit.
 */

import { Effect } from "effect";
import type { InferenceRecord, InferenceStore } from "../store/types.js";
import { identifyModelEffect } from "./identity.js";
import { loadModelProvenancePolicyEffect, type ModelProvenancePolicy } from "./policy.js";

export type ProvenanceServedModel = {
  readonly resolvedId: string;
  readonly canonicalId: string;
  readonly vendor: string;
  readonly provider: string;
  readonly calls: number;
};

export type ModelProvenanceComplianceReport = {
  readonly generatedAt: string;
  readonly since: string | null;
  readonly until: string;
  readonly policyProfile: ModelProvenancePolicy["profile"];
  readonly policyMode: ModelProvenancePolicy["mode"];
  readonly deniedVendors: readonly string[];
  readonly served: readonly ProvenanceServedModel[];
  readonly prohibitedServed: readonly ProvenanceServedModel[];
  readonly deniedAttemptHints: readonly string[];
  /** Plain-language attestation + limit. */
  readonly attestation: string;
  readonly limit: string;
  readonly ok: boolean;
};

function isDeniedResponse(record: InferenceRecord): boolean {
  return record.response.startsWith("provenance_denied:") || record.evaluatorVerdict === "failed";
}

export function buildModelProvenanceComplianceReportEffect(input: {
  readonly store: InferenceStore;
  readonly since?: Date;
  readonly until?: Date;
  readonly env?: NodeJS.ProcessEnv;
  readonly policy?: ModelProvenancePolicy;
  /** Optional root the customer holds — echoed into attestation text only. */
  readonly customerHeldRoot?: string;
}): Effect.Effect<ModelProvenanceComplianceReport, Error> {
  return Effect.gen(function* () {
    const policy =
      input.policy ?? (yield* loadModelProvenancePolicyEffect(input.env ?? process.env));
    const until = input.until ?? new Date();
    const records = yield* Effect.tryPromise({
      try: () => input.store.list({ since: input.since, limit: 100_000 }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });

    const inWindow = records.filter((r) => {
      const ts = Date.parse(r.timestamp);
      if (Number.isNaN(ts)) return false;
      if (input.since && ts < input.since.getTime()) return false;
      if (ts > until.getTime()) return false;
      return true;
    });

    const servedMap = new Map<string, ProvenanceServedModel>();
    const deniedHints: string[] = [];

    for (const record of inWindow) {
      if (isDeniedResponse(record) || record.response.includes("provenance_denied:")) {
        deniedHints.push(`${record.timestamp} ${record.modelId}`);
        continue;
      }
      if (!record.response.trim()) {
        // Empty response — not counted as served.
        continue;
      }
      const identity = yield* identifyModelEffect(record.modelId);
      const key = `${identity.resolvedId}|${record.provider}|${identity.vendor}`;
      const prev = servedMap.get(key);
      if (prev) {
        servedMap.set(key, { ...prev, calls: prev.calls + 1 });
      } else {
        servedMap.set(key, {
          resolvedId: identity.resolvedId,
          canonicalId: identity.canonicalId,
          vendor: identity.vendor,
          provider: record.provider,
          calls: 1,
        });
      }
    }

    const served = [...servedMap.values()].sort((a, b) => a.resolvedId.localeCompare(b.resolvedId));
    const prohibitedServed = served.filter((s) => policy.deniedVendors.has(s.vendor.toLowerCase()));

    const ok = prohibitedServed.length === 0;
    const rootNote = input.customerHeldRoot
      ? ` Customer-held hash-chain root reference: ${input.customerHeldRoot}.`
      : "";

    return {
      generatedAt: new Date().toISOString(),
      since: input.since?.toISOString() ?? null,
      until: until.toISOString(),
      policyProfile: policy.profile,
      policyMode: policy.mode,
      deniedVendors: [...policy.deniedVendors].sort(),
      served,
      prohibitedServed,
      deniedAttemptHints: deniedHints,
      attestation: ok
        ? `No prohibited model vendor identifiers were present among served inference records in this period under policy profile=${policy.profile} mode=${policy.mode}.${rootNote}`
        : `Prohibited model vendor identifiers WERE served in this period under policy profile=${policy.profile} mode=${policy.mode}.${rootNote}`,
      limit:
        "This report attests to model identity as resolved at the ClawQL inference gateway (requested/alias → resolved id + vendor label). It does not attest to the geographic or organizational origin of model weights, training data, or fine-tune lineage. Weight-origin attestation requires a separate lineage registry.",
      ok,
    };
  });
}

export async function buildModelProvenanceComplianceReport(input: {
  readonly store: InferenceStore;
  readonly since?: Date;
  readonly until?: Date;
  readonly env?: NodeJS.ProcessEnv;
  readonly policy?: ModelProvenancePolicy;
  readonly customerHeldRoot?: string;
}): Promise<ModelProvenanceComplianceReport> {
  return Effect.runPromise(buildModelProvenanceComplianceReportEffect(input));
}
