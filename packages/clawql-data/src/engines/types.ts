export type DataEngineId = string;

export type DataQueryOk = {
  readonly ok: true;
  readonly engine: DataEngineId;
  readonly sql: string;
  readonly columns: string[];
  readonly rows: Record<string, unknown>[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly hint: string;
};

export type DataQueryErr = {
  readonly ok: false;
  readonly engine?: DataEngineId;
  readonly sql?: string;
  readonly error: string;
};

export type DataQueryResult = DataQueryOk | DataQueryErr;

export type OpenFactRow = {
  matter_id?: string;
  rel_doc?: string;
  fact_key?: string;
  fact_value?: string;
  evidence_snippet?: string;
  extractor?: string;
};

export type IngestPayload = {
  matters?: readonly Record<string, unknown>[];
  documents?: readonly Record<string, unknown>[];
  openFacts?: readonly OpenFactRow[];
  mattersRoot?: string;
  replace?: boolean;
};

export type IngestResult = {
  ok: true;
  engine: DataEngineId;
  path: string;
  matterCount: number;
  documentCount: number;
  openFactCount: number;
};

export type DataStatus = {
  ok: true;
  engine: DataEngineId;
  path: string;
  enabled: true;
};

/** Pluggable structured-data backend (DuckDB today; more engines register here). */
export interface DataEnginePlugin {
  readonly id: DataEngineId;
  readonly path: string;
  query(sql: string): Promise<DataQueryResult>;
  ingest(payload: IngestPayload): Promise<IngestResult>;
  status(): DataStatus;
  close(): Promise<void>;
}

export type DataEngineFactory = (env: NodeJS.ProcessEnv) => DataEnginePlugin;
