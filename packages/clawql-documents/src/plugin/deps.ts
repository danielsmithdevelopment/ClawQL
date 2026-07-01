import type { McpToolResult } from "clawql-core";
import type { PipelineHopHookEvent } from "../pipeline/runner.js";

export type DocumentsPluginExecuteParams = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: string[];
};

export type DocumentsPluginDeps = {
  execute: (params: DocumentsPluginExecuteParams) => Promise<McpToolResult>;
  /** Optional lifecycle hook after each pipeline hop (audit, NATS, etc.). */
  onPipelineHop?: (event: PipelineHopHookEvent) => void | Promise<void>;
};

let deps: DocumentsPluginDeps | undefined;

export function configureDocumentsPluginDeps(next: DocumentsPluginDeps): void {
  deps = next;
}

export function getDocumentsPluginDeps(): DocumentsPluginDeps {
  if (!deps) {
    throw new Error(
      "DocumentsPlugin execute dependency not configured — call configureDocumentsPluginDeps from clawql-mcp startup"
    );
  }
  return deps;
}

/** @internal Test helper */
export function resetDocumentsPluginDepsForTests(): void {
  deps = undefined;
}
