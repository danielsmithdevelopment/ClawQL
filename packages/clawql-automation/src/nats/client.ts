import {
  AckPolicy,
  connect,
  DeliverPolicy,
  RetentionPolicy,
  StringCodec,
  type JetStreamClient,
  type NatsConnection,
} from "nats";
import {
  natsConfiguredForConsumer,
  natsConfiguredForPublish,
  natsDocumentSubjectRoot,
  natsHitlResumeConsumerDurable,
  natsJetStreamEnabled,
  natsStreamName,
  natsUrl,
  natsWorkflowSubjectRoot,
} from "./env.js";
import type { DocumentEventEnvelope, WorkflowEventEnvelope } from "./envelope.js";
import { workflowEventSubject } from "./envelope.js";

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

export async function ensureWorkflowStream(): Promise<void> {
  if (streamsEnsured) return;
  const nc = await getConnection();
  const jsm = await nc.jetstreamManager();
  const streamName = natsStreamName();
  const subjects = [`${natsWorkflowSubjectRoot()}.>`, `${natsDocumentSubjectRoot()}.>`];
  try {
    await jsm.streams.info(streamName);
  } catch {
    await jsm.streams.add({
      name: streamName,
      subjects,
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
    });
  }
  streamsEnsured = true;
}

export async function publishWorkflowEvent(envelope: WorkflowEventEnvelope): Promise<boolean> {
  if (!natsConfiguredForPublish()) return false;
  try {
    await ensureWorkflowStream();
    const js = await getJetStream();
    await js.publish(envelope.subject, sc.encode(JSON.stringify(envelope)));
    return true;
  } catch {
    return false;
  }
}

export async function publishDocumentEvent(envelope: DocumentEventEnvelope): Promise<boolean> {
  if (!natsConfiguredForPublish()) return false;
  try {
    await ensureWorkflowStream();
    const js = await getJetStream();
    await js.publish(envelope.subject, sc.encode(JSON.stringify(envelope)));
    return true;
  } catch {
    return false;
  }
}

export type HitlCompletedConsumerHandler = (
  envelope: WorkflowEventEnvelope
) => Promise<{ ok: boolean; error?: string }>;

let consumerAbort: AbortController | undefined;
let consumerLoopPromise: Promise<void> | undefined;

export async function ensureHitlResumeConsumer(): Promise<void> {
  if (!natsUrl() || !natsJetStreamEnabled()) {
    throw new Error("CLAWQL_NATS_URL and CLAWQL_NATS_JETSTREAM=1 are required");
  }
  await ensureWorkflowStream();
  const nc = await getConnection();
  const jsm = await nc.jetstreamManager();
  const streamName = natsStreamName();
  const durable = natsHitlResumeConsumerDurable();
  const filterSubject = workflowEventSubject("hitl.completed");

  try {
    await jsm.consumers.info(streamName, durable);
  } catch {
    await jsm.consumers.add(streamName, {
      durable_name: durable,
      filter_subject: filterSubject,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
    });
  }
}

export async function startHitlCompletedConsumer(
  handler: HitlCompletedConsumerHandler
): Promise<void> {
  if (!natsConfiguredForConsumer()) return;
  if (consumerLoopPromise) return;

  const abort = new AbortController();
  consumerAbort = abort;

  consumerLoopPromise = (async () => {
    await ensureHitlResumeConsumer();

    const streamName = natsStreamName();
    const durable = natsHitlResumeConsumerDurable();

    const js = await getJetStream();
    const consumer = await js.consumers.get(streamName, durable);
    const messages = await consumer.consume({ max_messages: 1 });

    for await (const msg of messages) {
      if (abort.signal.aborted) break;
      const envelope = JSON.parse(sc.decode(msg.data)) as WorkflowEventEnvelope;
      try {
        const result = await handler(envelope);
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

  return consumerLoopPromise;
}

export async function stopNatsClient(): Promise<void> {
  consumerAbort?.abort();
  consumerAbort = undefined;
  consumerLoopPromise = undefined;
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
}

/** Test hook — reset module singletons. */
export function resetNatsClientForTests(): void {
  consumerAbort = undefined;
  consumerLoopPromise = undefined;
  streamsEnsured = false;
  connectionPromise = undefined;
  jetStreamClient = undefined;
}
