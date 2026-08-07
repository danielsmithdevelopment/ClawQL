export type WebAuditEventType =
  | "WEB_SEARCH"
  | "WEB_SEARCH_FALLBACK"
  | "WEB_FETCH"
  | "WEB_SCREENSHOT"
  | "WEB_INTERACT"
  | "WEB_ERROR";

export type WebAuditEvent = {
  type: WebAuditEventType;
  ts: string;
  provider?: string;
  query?: string;
  url?: string;
  reason?: string;
  fallback?: string;
  correlationId?: string;
  ok?: boolean;
  detail?: string;
};

export type WebAuditSink = (event: WebAuditEvent) => void | Promise<void>;
