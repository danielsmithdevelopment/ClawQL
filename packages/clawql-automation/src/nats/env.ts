/** NATS JetStream env ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127), [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)). */

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function natsUrl(): string | undefined {
  const v = process.env.CLAWQL_NATS_URL?.trim();
  return v || undefined;
}

export function natsJetStreamEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_JETSTREAM);
}

export function natsPublishEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_ENABLE_PUBLISH);
}

export function natsConsumerEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_ENABLE_CONSUMER);
}

/** Consumer calls `resumeWorkflow` on `clawql.workflow.hitl.completed` events. */
export function natsConsumerResumeWorkflowEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW);
}

export function natsWorkflowSubjectRoot(): string {
  return process.env.CLAWQL_NATS_SUBJECT_WORKFLOW?.trim() || "clawql.workflow";
}

export function natsDocumentSubjectRoot(): string {
  return process.env.CLAWQL_NATS_SUBJECT_DOCUMENT?.trim() || "clawql.document";
}

export function natsStreamName(): string {
  return process.env.CLAWQL_NATS_STREAM_WORKFLOW?.trim() || "CLAWQL_WORKFLOW";
}

export function natsHitlResumeConsumerDurable(): string {
  return process.env.CLAWQL_NATS_CONSUMER_DURABLE?.trim() || "clawql-hitl-resume";
}

export function natsConfiguredForPublish(): boolean {
  return Boolean(natsUrl()) && natsJetStreamEnabled() && natsPublishEnabled();
}

export function natsConfiguredForConsumer(): boolean {
  return (
    Boolean(natsUrl()) &&
    natsJetStreamEnabled() &&
    natsConsumerEnabled() &&
    natsConsumerResumeWorkflowEnabled()
  );
}
