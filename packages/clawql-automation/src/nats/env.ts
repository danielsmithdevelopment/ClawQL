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

/** Durable consumer runs `run_idp_pipeline` on `clawql.document.inbox.arrived` / `pipeline.requested`. */
export function natsConsumerIdpPipelineEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_CONSUMER_IDP_PIPELINE);
}

/** Durable consumer follows up on `clawql.document.coneshare.>` (resume + optional Slack). */
export function natsConsumerConeshareFollowupEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP);
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

export function natsIdpPipelineConsumerDurable(): string {
  return process.env.CLAWQL_NATS_CONSUMER_IDP_DURABLE?.trim() || "clawql-idp-pipeline";
}

export function natsConeshareFollowupConsumerDurable(): string {
  return process.env.CLAWQL_NATS_CONSUMER_CONESHARE_DURABLE?.trim() || "clawql-coneshare-followup";
}

export function natsConfiguredForPublish(): boolean {
  return Boolean(natsUrl()) && natsJetStreamEnabled() && natsPublishEnabled();
}

export function natsHitlConsumerConfigured(): boolean {
  return (
    Boolean(natsUrl()) &&
    natsJetStreamEnabled() &&
    natsConsumerEnabled() &&
    natsConsumerResumeWorkflowEnabled()
  );
}

export function natsDocumentConsumerConfigured(): boolean {
  return (
    Boolean(natsUrl()) &&
    natsJetStreamEnabled() &&
    natsConsumerEnabled() &&
    (natsConsumerIdpPipelineEnabled() || natsConsumerConeshareFollowupEnabled())
  );
}

/** Any JetStream consumer (HITL and/or document). */
export function natsConfiguredForConsumer(): boolean {
  return natsHitlConsumerConfigured() || natsDocumentConsumerConfigured();
}

/** Slack channel for Coneshare viewer follow-up notify (optional). */
export function natsConeshareNotifyChannel(): string | undefined {
  const v = process.env.CLAWQL_CONESHARE_NOTIFY_CHANNEL?.trim();
  return v || undefined;
}
