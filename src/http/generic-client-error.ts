/**
 * Generic client-facing errors with a correlation id (audit 2.16).
 * Log the real error server-side; never echo raw messages that may quote tokens.
 */

import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { Effect } from "effect";

export type GenericClientErrorBody = {
  readonly ok: false;
  readonly error: string;
  readonly correlationId: string;
};

export function newCorrelationId(): string {
  return randomUUID();
}

export function newCorrelationIdEffect(): Effect.Effect<string> {
  return Effect.sync(() => newCorrelationId());
}

/** Log `err` with a correlation id; return a safe JSON body for the client. */
export function genericClientError(
  logLabel: string,
  err: unknown,
  publicMessage = "request failed"
): GenericClientErrorBody {
  const correlationId = newCorrelationId();
  console.error(`[${logLabel}] correlationId=${correlationId}`, err);
  return { ok: false, error: publicMessage, correlationId };
}

export function sendGenericClientError(
  res: Response,
  status: number,
  logLabel: string,
  err: unknown,
  publicMessage = "request failed"
): void {
  if (res.headersSent) return;
  res.status(status).json(genericClientError(logLabel, err, publicMessage));
}

export function sendGenericClientErrorEffect(
  res: Response,
  status: number,
  logLabel: string,
  err: unknown,
  publicMessage = "request failed"
): Effect.Effect<void> {
  return Effect.sync(() =>
    sendGenericClientError(res, status, logLabel, err, publicMessage)
  );
}
