/** Token-efficiency layer identifiers (see docs/architecture/clawql-token-efficiency.md). */
export type EfficiencyLayerId =
  | "code-mode"
  | "response-trim"
  | "terse"
  | "prompt-cache"
  | "semantic-cache"
  | "history-compress"
  | "prompt-compress"
  | "model-routing"
  | "structured-output"
  | "token-budget"
  | "prefill"
  | "flywheel";

/** Whether a request may be semantically cached (Layer 5 safety). */
export type CacheIntent = "read" | "write" | "auto";

export type EfficiencyLayerStatus = {
  id: EfficiencyLayerId;
  enabled: boolean;
  scope: "mcp" | "inference" | "ouroboros" | "export";
  note?: string;
};
