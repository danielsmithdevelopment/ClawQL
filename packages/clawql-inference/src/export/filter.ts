import type { InferenceRecord } from "../store/types.js";
import type { ExportFilter } from "./types.js";

export function matchesExportFilter(record: InferenceRecord, filter: ExportFilter): boolean {
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
  return true;
}

export function filterRecordsForExport(
  records: InferenceRecord[],
  filter: ExportFilter
): InferenceRecord[] {
  return records.filter((r) => matchesExportFilter(r, filter));
}
