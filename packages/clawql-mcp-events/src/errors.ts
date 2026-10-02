import { Data } from "effect";

/** JSON-RPC error code for callback endpoint failures (OpenAI MCP Events). */
export const CALLBACK_ENDPOINT_ERROR_CODE = -32015;

export class McpEventsError extends Data.TaggedError("McpEventsError")<{
  readonly message: string;
  readonly code: number;
  readonly reason?: string;
}> {}

export class CallbackEndpointError extends Data.TaggedError("CallbackEndpointError")<{
  readonly message: string;
  readonly reason: string;
}> {
  readonly code = CALLBACK_ENDPOINT_ERROR_CODE;
}

export class InvalidEventError extends Data.TaggedError("InvalidEventError")<{
  readonly message: string;
}> {}

export class UnauthorizedEventError extends Data.TaggedError("UnauthorizedEventError")<{
  readonly message: string;
}> {}
