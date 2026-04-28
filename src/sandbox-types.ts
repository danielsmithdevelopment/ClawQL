export type SandboxLanguage = "python" | "javascript" | "shell";
export type SandboxPersistenceMode = "ephemeral" | "session" | "persistent";

export type SandboxCodeToolInput = {
  code: string;
  language: SandboxLanguage;
  sessionId?: string;
  persistenceMode?: SandboxPersistenceMode;
  timeoutMs?: number;
};

/** Which **`sandbox_exec`** path handled the run (JSON visibility for ops / audits). */
export type SandboxExecBackendKind = "bridge" | "macos-seatbelt" | "docker";

export type SandboxBridgeResponse = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  sandboxId?: string;
  error?: string;
  backend?: SandboxExecBackendKind;
};
