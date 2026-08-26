/**
 * HTTP route handlers for the optional audit REST API.
 * Authentication: Authorization: ApiKey <key> on every request.
 */

import { Effect, type Context } from "effect";
import type { WORMAppendInput, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import type { WORMAuditTrailService } from "../trail.js";

export type AuditHttpDeps = {
  trail: Context.Tag.Service<typeof WORMAuditTrailService>;
  apiKey: string;
};

export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type HttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

const json = (status: number, body: unknown): HttpResponse => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
  body,
});

export const authorizeApiKey = (
  headers: HttpRequest["headers"],
  expected: string
): Effect.Effect<void, AuditError> =>
  Effect.gen(function* () {
    const raw = headers.authorization ?? headers.Authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || !value.startsWith("ApiKey ")) {
      return yield* Effect.fail(new AuditError({ reason: "Missing Authorization: ApiKey …" }));
    }
    const presented = value.slice("ApiKey ".length).trim();
    if (presented !== expected) {
      return yield* Effect.fail(new AuditError({ reason: "Invalid API key" }));
    }
  });

function parseUrl(url: string): { pathname: string; searchParams: URLSearchParams } {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function filterFromSearch(sp: URLSearchParams): WORMFilter {
  const filter: WORMFilter = {};
  const sessionId = sp.get("sessionId");
  const type = sp.get("type");
  const since = sp.get("since");
  const until = sp.get("until");
  const limit = sp.get("limit");
  const offset = sp.get("offset");
  if (sessionId) filter.sessionId = sessionId;
  if (type) filter.type = type;
  if (since) filter.since = since;
  if (until) filter.until = until;
  if (limit) filter.limit = Number(limit);
  if (offset) filter.offset = Number(offset);
  return filter;
}

export const handleAuditHttpRequest = (
  req: HttpRequest,
  deps: AuditHttpDeps
): Effect.Effect<HttpResponse> =>
  Effect.gen(function* () {
    const authErr = yield* authorizeApiKey(req.headers, deps.apiKey).pipe(
      Effect.as(null as string | null),
      Effect.catchTag("AuditError", (err) => Effect.succeed(err.reason))
    );
    if (authErr) return json(401, { error: authErr });

    const { pathname, searchParams } = parseUrl(req.url);
    const trail = deps.trail;

    if (req.method === "POST" && pathname === "/entries") {
      const outcome = yield* trail.append(req.body as WORMAppendInput).pipe(
        Effect.map((written) => ({ ok: true as const, written })),
        Effect.catchTag("AuditError", (err) =>
          Effect.succeed({ ok: false as const, reason: err.reason })
        )
      );
      return outcome.ok ? json(201, outcome.written) : json(400, { error: outcome.reason });
    }

    if (req.method === "GET" && pathname === "/entries") {
      const filter = filterFromSearch(searchParams);
      const outcome = yield* trail.query(filter).pipe(
        Effect.map((entries) => ({ ok: true as const, entries })),
        Effect.catchTag("AuditError", (err) =>
          Effect.succeed({ ok: false as const, reason: err.reason })
        )
      );
      return outcome.ok
        ? json(200, { entries: outcome.entries, total: outcome.entries.length })
        : json(500, { error: outcome.reason });
    }

    if (req.method === "GET" && pathname.startsWith("/entries/")) {
      const id = decodeURIComponent(pathname.slice("/entries/".length));
      const entries = yield* trail.query({});
      const found = entries.find((e) => e.id === id);
      if (!found) return json(404, { error: "Entry not found" });
      return json(200, found);
    }

    if (req.method === "GET" && pathname === "/chain/verify") {
      const sessionId = searchParams.get("sessionId") ?? undefined;
      const entries = yield* trail.query(sessionId ? { sessionId } : {});
      const result = yield* trail.verify(entries);
      return json(200, { ...result, entriesChecked: entries.length });
    }

    if (req.method === "GET" && pathname === "/chain/latest") {
      const all = yield* trail.query({});
      return json(200, all.length ? all[all.length - 1]! : null);
    }

    if (req.method === "POST" && pathname === "/export/qr") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (
        "encryptionKey" in body ||
        "hmacKey" in body ||
        "CLAWQL_AUDIT_QR_ENCRYPTION_KEY" in body ||
        "CLAWQL_AUDIT_QR_HMAC_KEY" in body
      ) {
        return json(400, {
          error: "QR keys must not be supplied in the request body",
        });
      }
      if (!process.env.CLAWQL_AUDIT_QR_ENCRYPTION_KEY || !process.env.CLAWQL_AUDIT_QR_HMAC_KEY) {
        return json(503, {
          error:
            "CLAWQL_AUDIT_QR_ENCRYPTION_KEY and CLAWQL_AUDIT_QR_HMAC_KEY must be set",
        });
      }
      const filter = (body.filter as WORMFilter | undefined) ?? {};
      const outcome = yield* trail.exportEntries(filter, "qr").pipe(
        Effect.map((result) => ({ ok: true as const, result })),
        Effect.catchTag("AuditError", (err) =>
          Effect.succeed({ ok: false as const, reason: err.reason })
        )
      );
      if (!outcome.ok) return json(500, { error: outcome.reason });
      const qr = outcome.result as { chunkCount?: number };
      return json(200, {
        chunkCount: qr.chunkCount ?? 0,
        downloadUrl: null,
        result: outcome.result,
      });
    }

    return json(404, { error: "Not found" });
  }).pipe(
    Effect.catchAll((err) =>
      Effect.succeed(
        json(500, {
          error: err instanceof Error ? err.message : "Internal error",
        })
      )
    )
  );
