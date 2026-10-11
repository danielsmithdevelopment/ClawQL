import {
  AckPolicy,
  connect,
  DeliverPolicy,
  RetentionPolicy,
  StringCodec,
  type JetStreamClient,
  type NatsConnection,
} from "nats";
import { Effect } from "effect";
import {
  natsConeshareFollowupConsumerDurable,
  natsDocumentSubjectRoot,
  natsHitlResumeConsumerDurable,
  natsIdpPipelineConsumerDurable,
  natsJetStreamEnabled,
  natsStreamName,
  natsUrl,
  natsWorkflowSubjectRoot,
  natsConfiguredForPublish,
  natsHitlConsumerConfigured,
  natsConsumerIdpPipelineEnabled,
  natsConsumerConeshareFollowupEnabled,
  natsDocumentConsumerConfigured,
} from "./env.js";
import type { DocumentEventEnvelope, WorkflowEventEnvelope } from "./envelope.js";
import { documentEventSubject, workflowEventSubject } from "./envelope.js";
import { automationFromPromise } from "../effect/automation-effect-utils.js";
import { AutomationError } from "../effect/automation-errors.js";

const sc = StringCodec();

let connectionPromise: Promise<NatsConnection> | undefined;
let jetStreamClient: JetStreamClient | undefined;
let streamsEnsured = false;

async function getConnection(): Promise<NatsConnection> {
  if (!connectionPromise) {
    const url = natsUrl();
    if (!url) throw new Error("CLAWQL_NATS_URL is not set");
    connectionPromise = connect({ servers: url });
  }
  return connectionPromise;
}

async function getJetStream(): Promise<JetStreamClient> {
  if (jetStreamClient) return jetStreamClient;
  const nc = await getConnection();
  jetStreamClient = nc.jetstream();
  return jetStreamClient;
}

export function ensureWorkflowStreamEffect(): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    if (streamsEnsured) return;
    const nc = yield* automationFromPromise(() => getConnection());
    const jsm = yield* automationFromPromise(() => nc.jetstreamManager());
    const streamName = natsStreamName();
    const subjects = [`${natsWorkflowSubjectRoot()}.>`, `${natsDocumentSubjectRoot()}.>`];
    const infoExit = yield* Effect.exit(automationFromPromise(() => jsm.streams.info(streamName)));
    if (infoExit._tag === "Failure") {
      yield* automationFromPromise(() =>
        jsm.streams.add({
          name: streamName,
          subjects,
          retention: RetentionPolicy.Limits,
          max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
        })
      );
    }
    streamsEnsured = true;
  });
}

/** Promise façade. */
export async function ensureWorkflowStream(): Promise<void> {
  return Effect.runPromise(ensureWorkflowStreamEffect());
}

export function publishWorkflowEventEffect(
  envelope: WorkflowEventEnvelope
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!natsConfiguredForPublish()) return false;
    yield* ensureWorkflowStreamEffect();
    const js = yield* automationFromPromise(() => getJetStream());
    yield* automationFromPromise(() =>
      js.publish(envelope.subject, sc.encode(JSON.stringify(envelope)))
    );
    return true;
  }).pipe(Effect.orElseSucceed(() => false));
}

/** Promise façade. */
export async function publishWorkflowEvent(envelope: WorkflowEventEnvelope): Promise<boolean> {
  return Effect.runPromise(publishWorkflowEventEffect(envelope));
}

export function publishDocumentEventEffect(
  envelope: DocumentEventEnvelope
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!natsConfiguredForPublish()) return false;
    yield* ensureWorkflowStreamEffect();
    const js = yield* automationFromPromise(() => getJetStream());
    yield* automationFromPromise(() =>
      js.publish(envelope.subject, sc.encode(JSON.stringify(envelope)))
    );
    return true;
  }).pipe(Effect.orElseSucceed(() => false));
}

/** Promise façade. */
export async function publishDocumentEvent(envelope: DocumentEventEnvelope): Promise<boolean> {
  return Effect.runPromise(publishDocumentEventEffect(envelope));
}

export type HitlCompletedConsumerHandler = (
  envelope: WorkflowEventEnvelope
) => Promise<{ ok: boolean; error?: string }>;

export type DocumentConsumerHandler = (
  envelope: DocumentEventEnvelope
) => Promise<{ ok: boolean; error?: string }>;

const consumerAborts: AbortController[] = [];
const consumerLoops: Promise<void>[] = [];

/** @internal Exported for agent-bridge / tests — prefer typed start* helpers. */
export function ensureDurableConsumerEffect(opts: {
  durable: string;
  filterSubject: string;
}): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    if (!natsUrl() || !natsJetStreamEnabled()) {
      return yield* Effect.fail(
        new AutomationError({
          reason: "CLAWQL_NATS_URL and CLAWQL_NATS_JETSTREAM=1 are required",
        })
      );
    }
    yield* ensureWorkflowStreamEffect();
    const nc = yield* automationFromPromise(() => getConnection());
    const jsm = yield* automationFromPromise(() => nc.jetstreamManager());
    const streamName = natsStreamName();
    const infoExit = yield* Effect.exit(
      automationFromPromise(() => jsm.consumers.info(streamName, opts.durable))
    );
    if (infoExit._tag === "Failure") {
      yield* automationFromPromise(() =>
        jsm.consumers.add(streamName, {
          durable_name: opts.durable,
          filter_subject: opts.filterSubject,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
        })
      );
    }
  });
}

/** Promise façade. */
export async function ensureDurableConsumer(opts: {
  durable: string;
  filterSubject: string;
}): Promise<void> {
  return Effect.runPromise(ensureDurableConsumerEffect(opts));
}

export function ensureHitlResumeConsumerEffect(): Effect.Effect<void, AutomationError> {
  return ensureDurableConsumerEffect({
    durable: natsHitlResumeConsumerDurable(),
    filterSubject: workflowEventSubject("hitl.completed"),
  });
}

/** Promise façade. */
export async function ensureHitlResumeConsumer(): Promise<void> {
  return Effect.runPromise(ensureHitlResumeConsumerEffect());
}

export function ensureIdpPipelineConsumerEffect(): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    // JetStream allows one filter_subject per durable — split inbox vs explicit pipeline requests.
    const base = natsIdpPipelineConsumerDurable();
    yield* ensureDurableConsumerEffect({
      durable: base,
      filterSubject: documentEventSubject("inbox.arrived"),
    });
    yield* ensureDurableConsumerEffect({
      durable: `${base}-requested`,
      filterSubject: documentEventSubject("pipeline.requested"),
    });
  });
}

/** Promise façade. */
export async function ensureIdpPipelineConsumer(): Promise<void> {
  return Effect.runPromise(ensureIdpPipelineConsumerEffect());
}

export function ensureConeshareFollowupConsumerEffect(): Effect.Effect<void, AutomationError> {
  return ensureDurableConsumerEffect({
    durable: natsConeshareFollowupConsumerDurable(),
    filterSubject: documentEventSubject("coneshare.viewer"),
  });
}

/** Promise façade. */
export async function ensureConeshareFollowupConsumer(): Promise<void> {
  return Effect.runPromise(ensureConeshareFollowupConsumerEffect());
}

/** @internal Exported for agent-bridge / tests — prefer typed start* helpers. */
export function startConsumerLoopEffect(opts: {
  durable: string;
  onMessage: (data: Uint8Array) => Promise<{ ok: boolean; error?: string }>;
}): Effect.Effect<void, AutomationError> {
  return automationFromPromise(async () => {
    const abort = new AbortController();
    consumerAborts.push(abort);

    const loop = (async () => {
      const streamName = natsStreamName();
      const js = await getJetStream();
      const consumer = await js.consumers.get(streamName, opts.durable);
      const messages = await consumer.consume({ max_messages: 1 });

      for await (const msg of messages) {
        if (abort.signal.aborted) break;
        try {
          const result = await opts.onMessage(msg.data);
          if (result.ok) {
            msg.ack();
          } else {
            msg.nak();
          }
        } catch {
          msg.nak();
        }
      }
    })().catch(() => {
      /* loop exits on connection loss; restart requires process recycle */
    });

    consumerLoops.push(loop);
    // Keep the worker/CLI alive until the consume loop ends (or abort).
    await loop;
  });
}

/** Promise façade. */
export async function startConsumerLoop(opts: {
  durable: string;
  onMessage: (data: Uint8Array) => Promise<{ ok: boolean; error?: string }>;
}): Promise<void> {
  return Effect.runPromise(startConsumerLoopEffect(opts));
}

export function startHitlCompletedConsumerEffect(
  handler: HitlCompletedConsumerHandler
): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    if (!natsHitlConsumerConfigured()) return;
    yield* ensureHitlResumeConsumerEffect();
    yield* startConsumerLoopEffect({
      durable: natsHitlResumeConsumerDurable(),
      onMessage: async (data) => {
        const envelope = JSON.parse(sc.decode(data)) as WorkflowEventEnvelope;
        return handler(envelope);
      },
    });
  });
}

/** Promise façade. */
export async function startHitlCompletedConsumer(
  handler: HitlCompletedConsumerHandler
): Promise<void> {
  return Effect.runPromise(startHitlCompletedConsumerEffect(handler));
}

export function startIdpPipelineConsumerEffect(
  handler: DocumentConsumerHandler
): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    if (!natsConsumerIdpPipelineEnabled() || !natsDocumentConsumerConfigured()) return;
    yield* ensureIdpPipelineConsumerEffect();
    const onMessage = async (data: Uint8Array) => {
      const envelope = JSON.parse(sc.decode(data)) as DocumentEventEnvelope;
      return handler(envelope);
    };
    const base = natsIdpPipelineConsumerDurable();
    yield* Effect.all(
      [
        startConsumerLoopEffect({ durable: base, onMessage }),
        startConsumerLoopEffect({ durable: `${base}-requested`, onMessage }),
      ],
      { concurrency: "unbounded" }
    );
  });
}

/** Promise façade. */
export async function startIdpPipelineConsumer(handler: DocumentConsumerHandler): Promise<void> {
  return Effect.runPromise(startIdpPipelineConsumerEffect(handler));
}

export function startConeshareFollowupConsumerEffect(
  handler: DocumentConsumerHandler
): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    if (!natsConsumerConeshareFollowupEnabled() || !natsDocumentConsumerConfigured()) return;
    yield* ensureConeshareFollowupConsumerEffect();
    yield* startConsumerLoopEffect({
      durable: natsConeshareFollowupConsumerDurable(),
      onMessage: async (data) => {
        const envelope = JSON.parse(sc.decode(data)) as DocumentEventEnvelope;
        return handler(envelope);
      },
    });
  });
}

/** Promise façade. */
export async function startConeshareFollowupConsumer(
  handler: DocumentConsumerHandler
): Promise<void> {
  return Effect.runPromise(startConeshareFollowupConsumerEffect(handler));
}

export function stopNatsClientEffect(): Effect.Effect<void, AutomationError> {
  return automationFromPromise(async () => {
    for (const abort of consumerAborts) abort.abort();
    const loops = [...consumerLoops];
    consumerAborts.length = 0;
    consumerLoops.length = 0;
    await Promise.allSettled(loops);
    streamsEnsured = false;
    if (connectionPromise) {
      const nc = await connectionPromise.catch(() => undefined);
      if (nc) {
        await nc.drain().catch(() => undefined);
        await nc.close().catch(() => undefined);
      }
    }
    connectionPromise = undefined;
    jetStreamClient = undefined;
  });
}

/** Promise façade. */
export async function stopNatsClient(): Promise<void> {
  return Effect.runPromise(stopNatsClientEffect());
}

/** Test hook — reset module singletons. */
export function resetNatsClientForTests(): void {
  consumerAborts.length = 0;
  consumerLoops.length = 0;
  streamsEnsured = false;
  connectionPromise = undefined;
  jetStreamClient = undefined;
}
