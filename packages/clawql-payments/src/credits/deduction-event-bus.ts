/**
 * Post-deduction event bus: durable outbox first, optional NATS publish after.
 * DeductionService never waits on NATS for authorize/deny.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { resolveDeductionOutboxPath } from "../config/paths.js";
import { isDeductionNatsPublishEnabled, natsPaymentsSubjectRoot } from "./config.js";

export type DeductionEventType =
  "credits.held" | "credits.captured" | "credits.released" | "credits.debited";

export type DeductionEvent = {
  readonly schema_version: 1;
  readonly event_type: DeductionEventType;
  readonly subject: string;
  readonly tenant_id: string;
  readonly idempotency_key: string;
  readonly amount_cents: number;
  readonly balance_after_cents?: number;
  readonly correlation_id?: string;
  readonly resource?: string;
  readonly hold_id?: string;
  readonly source: string;
  readonly ts: string;
  readonly payload?: Record<string, unknown>;
};

export const deductionEventSubject = (
  eventType: DeductionEventType,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.map(natsPaymentsSubjectRoot(env), (root) => `${root}.${eventType}`);

export const buildDeductionEvent = (
  eventType: DeductionEventType,
  fields: {
    tenantId: string;
    idempotencyKey: string;
    amountCents: number;
    balanceAfterCents?: number;
    correlationId?: string;
    resource?: string;
    holdId?: string;
    payload?: Record<string, unknown>;
  },
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<DeductionEvent> =>
  Effect.gen(function* () {
    const subject = yield* deductionEventSubject(eventType, env);
    return {
      schema_version: 1,
      event_type: eventType,
      subject,
      tenant_id: fields.tenantId,
      idempotency_key: fields.idempotencyKey,
      amount_cents: fields.amountCents,
      balance_after_cents: fields.balanceAfterCents,
      correlation_id: fields.correlationId,
      resource: fields.resource,
      hold_id: fields.holdId,
      source: "clawql-payments/deduction",
      ts: new Date().toISOString(),
      payload: fields.payload,
    };
  });

async function appendOutbox(event: DeductionEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveDeductionOutboxPath(env);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

async function tryPublishNats(event: DeductionEvent, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!Effect.runSync(isDeductionNatsPublishEnabled(env))) return false;
  const url = env.CLAWQL_NATS_URL?.trim();
  if (!url) return false;
  try {
    const nats = await import("nats");
    const nc = await nats.connect({ servers: url });
    try {
      const js = nc.jetstream();
      const jsm = await nc.jetstreamManager();
      const streamName = env.CLAWQL_NATS_STREAM?.trim() || "CLAWQL";
      const root = Effect.runSync(natsPaymentsSubjectRoot(env));
      try {
        await jsm.streams.info(streamName);
      } catch {
        await jsm.streams.add({
          name: streamName,
          subjects: [`${root}.>`],
          retention: nats.RetentionPolicy.Limits,
          max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
        });
      }
      const sc = nats.StringCodec();
      await js.publish(event.subject, sc.encode(JSON.stringify(event)));
      return true;
    } finally {
      await nc.drain().catch(() => undefined);
    }
  } catch {
    return false;
  }
}

/** Effect service: emit deduction events after sync counter mutation. */
export class DeductionEventBus extends Context.Tag("clawql/DeductionEventBus")<
  DeductionEventBus,
  {
    readonly publish: (event: DeductionEvent) => Effect.Effect<void, never>;
  }
>() {}

export function deductionEventBusLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<DeductionEventBus> {
  return Layer.succeed(
    DeductionEventBus,
    DeductionEventBus.of({
      publish: (event) =>
        Effect.promise(async () => {
          try {
            await appendOutbox(event, env);
          } catch {
            /* outbox best-effort; deduction already committed */
          }
          await tryPublishNats(event, env);
        }).pipe(Effect.asVoid),
    })
  );
}

/** Test / offline: no I/O. */
export function deductionEventBusNoopLayer(): Layer.Layer<DeductionEventBus> {
  return Layer.succeed(
    DeductionEventBus,
    DeductionEventBus.of({
      publish: () => Effect.void,
    })
  );
}
