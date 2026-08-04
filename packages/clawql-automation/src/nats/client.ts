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

export type DocumentConsumerHandler = (
  envelope: DocumentEventEnvelope
) => Promise<{ ok: boolean; error?: string }>;

const consumerAborts: AbortController[] = [];
const consumerLoops: Promise<void>[] = [];

async function ensureDurableConsumer(opts: {
  durable: string;
  filterSubject: string;
}): Promise<void> {
  if (!natsUrl() || !natsJetStreamEnabled()) {
    throw new Error("CLAWQL_NATS_URL and CLAWQL_NATS_JETSTREAM=1 are required");
  }
  await ensureWorkflowStream();
  const nc = await getConnection();
  const jsm = await nc.jetstreamManager();
  const streamName = natsStreamName();
  try {
    await jsm.consumers.info(streamName, opts.durable);
  } catch {
    await jsm.consumers.add(streamName, {
      durable_name: opts.durable,
      filter_subject: opts.filterSubject,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
    });
  }
}

export async function ensureHitlResumeConsumer(): Promise<void> {
  await ensureDurableConsumer({
    durable: natsHitlResumeConsumerDurable(),
    filterSubject: workflowEventSubject("hitl.completed"),
  });
}

export async function ensureIdpPipelineConsumer(): Promise<void> {
  // JetStream allows one filter_subject per durable — split inbox vs explicit pipeline requests.
  const base = natsIdpPipelineConsumerDurable();
  await ensureDurableConsumer({
    durable: base,
    filterSubject: documentEventSubject("inbox.arrived"),
  });
  await ensureDurableConsumer({
    durable: `${base}-requested`,
    filterSubject: documentEventSubject("pipeline.requested"),
  });
}

export async function ensureConeshareFollowupConsumer(): Promise<void> {
  await ensureDurableConsumer({
    durable: natsConeshareFollowupConsumerDurable(),
    filterSubject: documentEventSubject("coneshare.viewer"),
  });
}

async function startConsumerLoop(opts: {
  durable: string;
  onMessage: (data: Uint8Array) => Promise<{ ok: boolean; error?: string }>;
}): Promise<void> {
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
}

export async function startHitlCompletedConsumer(
  handler: HitlCompletedConsumerHandler
): Promise<void> {
  if (!natsHitlConsumerConfigured()) return;
  await ensureHitlResumeConsumer();
  await startConsumerLoop({
    durable: natsHitlResumeConsumerDurable(),
    onMessage: async (data) => {
      const envelope = JSON.parse(sc.decode(data)) as WorkflowEventEnvelope;
      return handler(envelope);
    },
  });
}

export async function startIdpPipelineConsumer(handler: DocumentConsumerHandler): Promise<void> {
  if (!natsConsumerIdpPipelineEnabled() || !natsDocumentConsumerConfigured()) return;
  await ensureIdpPipelineConsumer();
  const onMessage = async (data: Uint8Array) => {
    const envelope = JSON.parse(sc.decode(data)) as DocumentEventEnvelope;
    return handler(envelope);
  };
  const base = natsIdpPipelineConsumerDurable();
  await Promise.all([
    startConsumerLoop({ durable: base, onMessage }),
    startConsumerLoop({ durable: `${base}-requested`, onMessage }),
  ]);
}

export async function startConeshareFollowupConsumer(
  handler: DocumentConsumerHandler
): Promise<void> {
  if (!natsConsumerConeshareFollowupEnabled() || !natsDocumentConsumerConfigured()) return;
  await ensureConeshareFollowupConsumer();
  await startConsumerLoop({
    durable: natsConeshareFollowupConsumerDurable(),
    onMessage: async (data) => {
      const envelope = JSON.parse(sc.decode(data)) as DocumentEventEnvelope;
      return handler(envelope);
    },
  });
}

export async function stopNatsClient(): Promise<void> {
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
}

/** Test hook — reset module singletons. */
export function resetNatsClientForTests(): void {
  consumerAborts.length = 0;
  consumerLoops.length = 0;
  streamsEnsured = false;
  connectionPromise = undefined;
  jetStreamClient = undefined;
}
