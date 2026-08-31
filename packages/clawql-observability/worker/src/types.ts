/** Cloudflare Worker bindings for the Faro ingest proxy (Phase 2). */
export interface FaroProxyEnv {
  readonly JWT_SIGNING_KEY: string;
  readonly ALLOY_INGEST_URL: string;
  readonly ALLOWED_ORIGINS: string;
  readonly PROJECT_ID: string;
  readonly RATE_LIMIT_PER_MINUTE?: string;
  readonly MAX_BODY_BYTES?: string;
  /** Optional R2 binding for release source maps (Phase 2+). */
  readonly SOURCEMAPS?: unknown;
}

export interface JwtClaims {
  readonly sub: string;
  readonly project: string;
  readonly origin: string;
  readonly iat: number;
  readonly exp: number;
}

export interface StackFrame {
  readonly function?: string;
  readonly filename?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly abs_path?: string;
}

export interface ExceptionPayload {
  readonly type?: string;
  readonly value?: string;
  readonly stacktrace?: { readonly frames?: readonly StackFrame[] };
}

export interface ExceptionEvent {
  readonly type: "exception";
  readonly payload: {
    readonly exceptions?: readonly ExceptionPayload[];
  };
  readonly meta?: {
    readonly labels?: Record<string, string>;
    readonly app?: { readonly name?: string; readonly version?: string };
  };
}

export type FaroEvent = ExceptionEvent | { readonly type: string; readonly [key: string]: unknown };
