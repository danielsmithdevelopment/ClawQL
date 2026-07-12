import type { InferenceListQuery, InferenceRecord, InferenceStore, SpendRow } from "./types.js";

function matchesQuery(record: InferenceRecord, query: InferenceListQuery): boolean {
  if (query.modelId && record.modelId !== query.modelId) return false;
  if (query.provider && record.provider !== query.provider) return false;
  if (query.tier && record.tier !== query.tier) return false;
  if (query.correlationId && record.correlationId !== query.correlationId) return false;
  if (query.since && new Date(record.timestamp) < query.since) return false;
  return true;
}

function sortNewestFirst(records: InferenceRecord[]): InferenceRecord[] {
  return [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export class InMemoryInferenceStore implements InferenceStore {
  private readonly records: InferenceRecord[] = [];

  async append(record: InferenceRecord): Promise<void> {
    this.records.push(record);
  }

  async list(query: InferenceListQuery = {}): Promise<InferenceRecord[]> {
    const filtered = this.records.filter((r) => matchesQuery(r, query));
    const sorted = sortNewestFirst(filtered);
    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }

  async getByCorrelationId(correlationId: string): Promise<InferenceRecord[]> {
    return sortNewestFirst(this.records.filter((r) => r.correlationId === correlationId));
  }

  async spendRollup(
    options: {
      since?: Date;
      groupBy?: import("./types.js").SpendGroupBy;
    } = {}
  ): Promise<SpendRow[]> {
    const groupBy = options.groupBy ?? "model";
    const rows = new Map<string, SpendRow>();
    for (const record of this.records) {
      if (options.since && new Date(record.timestamp) < options.since) continue;
      const key =
        groupBy === "provider"
          ? record.provider
          : groupBy === "tier"
            ? (record.tier ?? "unknown")
            : groupBy === "team"
              ? (record.team ?? "unknown")
              : record.modelId;
      const row = rows.get(key) ?? { key, calls: 0, inputTokens: 0, outputTokens: 0 };
      row.calls += 1;
      row.inputTokens += record.usage?.inputTokens ?? 0;
      row.outputTokens += record.usage?.outputTokens ?? 0;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.calls - a.calls);
  }

  /** Test helper */
  snapshot(): InferenceRecord[] {
    return [...this.records];
  }
}
