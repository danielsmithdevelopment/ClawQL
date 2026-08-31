/** LGTM+ core components: Loki, Grafana, Tempo, Mimir, plus Pyroscope. */
export type LgtmPlusComponent = "loki" | "grafana" | "tempo" | "mimir" | "pyroscope";

export interface LgtmPlusComponentConfig {
  readonly enabled: boolean;
}

export interface LokiConfig extends LgtmPlusComponentConfig {
  /** Must match maxLookBackPeriod exactly — shorter look-back silently returns empty results. */
  readonly retentionPeriod: string;
}

export interface MimirConfig extends LgtmPlusComponentConfig {
  readonly ingestionRate: number;
}

export interface LgtmPlusHelmValues {
  readonly lgtmPlus: {
    readonly loki: LokiConfig;
    readonly grafana: LgtmPlusComponentConfig;
    readonly tempo: LgtmPlusComponentConfig;
    readonly mimir: MimirConfig;
    readonly pyroscope: LgtmPlusComponentConfig;
  };
}

/** Local / bundled docker-compose endpoints (defaults match docker/docker-compose.yaml). */
export interface LgtmPlusLocalEndpoints {
  readonly grafanaUrl: string;
  readonly alloyOtlpGrpc: string;
  readonly alloyOtlpHttp: string;
  readonly lokiPushUrl: string;
  readonly tempoOtlpHttp: string;
  readonly mimirPrometheusUrl: string;
  readonly pyroscopeUrl: string;
}

export interface ObservabilityProfileConfig {
  readonly profile: "bundled" | "external" | "minimal";
  readonly enableOtelTracing: boolean;
  readonly enableLokiPush: boolean;
  readonly enableLangfuse: boolean;
  readonly otelCollectorUrl: string | undefined;
  readonly lokiPushUrl: string | undefined;
}
