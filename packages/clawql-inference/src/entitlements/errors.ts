export class EntitlementLimitError extends Error {
  readonly code = "insufficient_quota" as const;

  constructor(message: string) {
    super(message);
    this.name = "EntitlementLimitError";
  }
}

export function isEntitlementLimitError(error: unknown): error is EntitlementLimitError {
  return error instanceof EntitlementLimitError;
}
