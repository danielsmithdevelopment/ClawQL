import type { ProviderConfig, SignalType } from "../providers/types.js";

/** Flat registry entry for Alloy generation — no live provider object required. */
export type AlloyProviderEntry = {
  readonly id: string;
  readonly signalType: SignalType;
  readonly config: ProviderConfig;
  readonly enabled: boolean;
};

export type AlloyGenerationInput = {
  readonly logs: readonly AlloyProviderEntry[];
  readonly metrics: readonly AlloyProviderEntry[];
  readonly traces: readonly AlloyProviderEntry[];
  readonly profiles?: readonly AlloyProviderEntry[];
  /** Include Faro receiver + loki.write wiring (default true when any log provider is enabled). */
  readonly includeFaro?: boolean;
  /** Faro listen port (default 8027). */
  readonly faroPort?: number;
};

export type AlloyGeneratedConfig = {
  readonly river: string;
  readonly exporterRefs: {
    readonly logs: readonly string[];
    readonly metrics: readonly string[];
    readonly traces: readonly string[];
  };
  readonly providerIds: readonly string[];
};

/** Alloy-specific config keys on ProviderConfig (optional). */
export type AlloyProviderConfigKeys = {
  /** OTLP HTTP exporter endpoint (logs/traces). */
  readonly otlpEndpoint?: string;
  /** Prometheus remote_write / Loki push URL. */
  readonly pushUrl?: string;
  /** Exporter strategy override. */
  readonly alloyExporter?: "otlphttp" | "prometheus_remote_write" | "loki_write";
};
