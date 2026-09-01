import { createErrorFingerprint } from "../../src/fingerprint.js";
import type { ExceptionEvent } from "./types.js";

const enrichOne = async (event: Record<string, unknown>): Promise<Record<string, unknown>> => {
  if (event.type !== "exception") return event;

  const exceptionEvent = event as unknown as ExceptionEvent;
  const fingerprint = await createErrorFingerprint(exceptionEvent);
  const labels: Record<string, string> = {
    ...(exceptionEvent.meta?.labels ?? {}),
    error_fingerprint: fingerprint,
  };

  return {
    ...exceptionEvent,
    meta: { ...exceptionEvent.meta, labels },
  };
};

/** Attach error_fingerprint labels to exception events before Alloy forward. */
export const enrichExceptions = async (body: unknown): Promise<unknown> => {
  if (Array.isArray(body)) {
    return Promise.all(body.map((e) => enrichOne(e as Record<string, unknown>)));
  }
  if (body && typeof body === "object" && Array.isArray((body as { events?: unknown[] }).events)) {
    const envelope = body as { events: Record<string, unknown>[] };
    return {
      ...envelope,
      events: await Promise.all(envelope.events.map((e) => enrichOne(e))),
    };
  }
  return enrichOne(body as Record<string, unknown>);
};
