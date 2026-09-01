import { Data } from "effect";

export class WebMcpDraftNotFoundError extends Data.TaggedError("WebMcpDraftNotFoundError")<{
  readonly candidateId: string;
}> {}

export class WebMcpDraftInvalidStateError extends Data.TaggedError(
  "WebMcpDraftInvalidStateError"
)<{
  readonly candidateId: string;
  readonly status: string;
  readonly reason: string;
}> {}

export class WebMcpPublishVersionNotFoundError extends Data.TaggedError(
  "WebMcpPublishVersionNotFoundError"
)<{
  readonly versionId: string;
}> {}

export class WebMcpDraftEmptyPublishError extends Data.TaggedError(
  "WebMcpDraftEmptyPublishError"
)<{
  readonly reason: string;
}> {}
