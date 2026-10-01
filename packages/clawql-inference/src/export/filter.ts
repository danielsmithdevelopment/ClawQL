import { createHash } from "node:crypto";
import type { InferenceRecord } from "../store/types.js";
import type { ExportFilter } from "./types.js";

export type OkfTrustLookup = Map<
  string,
  {
    path: string;
    status?: string;
    verifiedBy?: string;
    staleAfter?: string;
  }
>;

export type ExportFilterOptions = {
  okfByCorrelation?: OkfTrustLookup;
  /**
   * SHA-256 hex digests of erased vault plaintext (from `.clawql/erasure-deny.json`).
   * Records whose message/response content hashes match are excluded so erased
   * content never reappears in a future training set.
   */
  erasedContentHashes?: ReadonlySet<string>;
};

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** True when any message/response body hashes to an erased content digest. */
export function recordHitsErasureDenyList(
  record: InferenceRecord,
  erasedContentHashes: ReadonlySet<string>
): boolean {
  if (erasedContentHashes.size === 0) return false;
  const blobs: string[] = [];
  for (const m of record.messages) {
    if (typeof m.content === "string" && m.content.length > 0) blobs.push(m.content);
  }
  if (record.response) blobs.push(record.response);
  for (const blob of blobs) {
    if (erasedContentHashes.has(sha256Hex(blob))) return true;
    // Manifest / lineage references may embed `sha256:<hash>` without the body.
    for (const hash of erasedContentHashes) {
      if (blob.includes(hash) || blob.includes(`sha256:${hash}`)) return true;
    }
  }
  return false;
}

export function matchesExportFilter(
  record: InferenceRecord,
  filter: ExportFilter,
  okfByCorrelationOrOpts?: OkfTrustLookup | ExportFilterOptions
): boolean {
  const opts: ExportFilterOptions =
    okfByCorrelationOrOpts instanceof Map
      ? { okfByCorrelation: okfByCorrelationOrOpts }
      : (okfByCorrelationOrOpts ?? {});
  const okfByCorrelation = opts.okfByCorrelation;

  if (opts.erasedContentHashes && recordHitsErasureDenyList(record, opts.erasedContentHashes)) {
    return false;
  }

  if (filter.modelId && record.modelId !== filter.modelId) return false;
  if (filter.provider && record.provider !== filter.provider) return false;
  if (filter.tier && record.tier !== filter.tier) return false;
  if (filter.verdict && record.evaluatorVerdict !== filter.verdict) return false;
  if (filter.minScore !== undefined) {
    const score = record.evaluatorScore ?? 0;
    if (score < filter.minScore) return false;
  }
  const ts = new Date(record.timestamp);
  if (filter.dateFrom && ts < filter.dateFrom) return false;
  if (filter.dateTo && ts > filter.dateTo) return false;
  if (filter.maxLatencyMs !== undefined && record.latencyMs > filter.maxLatencyMs) return false;
  if (filter.excludeCacheHits && record.cacheHit) return false;
  if (filter.minTokenEfficiency !== undefined) {
    const input = record.usage?.inputTokens ?? 0;
    const output = record.usage?.outputTokens ?? 0;
    if (input <= 0) return false;
    const efficiency = output / input;
    if (efficiency < filter.minTokenEfficiency) return false;
  }

  if (filter.okfVerified || filter.okfStatus) {
    const cid = record.correlationId?.trim();
    if (!cid || !okfByCorrelation) return false;
    const trust = okfByCorrelation.get(cid);
    if (!trust) return false;
    if (filter.okfVerified && (trust.verifiedBy ?? "") !== filter.okfVerified) return false;
    if (filter.okfStatus && (trust.status ?? "current") !== filter.okfStatus) return false;
  }

  return true;
}

export function filterRecordsForExport(
  records: InferenceRecord[],
  filter: ExportFilter,
  okfByCorrelationOrOpts?: OkfTrustLookup | ExportFilterOptions
): InferenceRecord[] {
  return records.filter((r) => matchesExportFilter(r, filter, okfByCorrelationOrOpts));
}
