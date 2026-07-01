import type { McpToolResult } from "clawql-core";

export type OuroborosPluginSearchParams = {
  readonly query: string;
  readonly limit: number;
};

export type OuroborosPluginExecuteParams = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: string[];
};

export type OuroborosPluginDeps = {
  search: (params: OuroborosPluginSearchParams) => Promise<McpToolResult>;
  execute: (params: OuroborosPluginExecuteParams) => Promise<McpToolResult>;
};

let deps: OuroborosPluginDeps | undefined;

export function configureOuroborosPluginDeps(next: OuroborosPluginDeps): void {
  deps = next;
}

export function getOuroborosPluginDeps(): OuroborosPluginDeps {
  if (!deps) {
    throw new Error(
      "OuroborosPlugin deps not configured — call configureOuroborosPluginDeps from clawql-mcp startup"
    );
  }
  return deps;
}

/** @internal Test helper */
export function resetOuroborosPluginDepsForTests(): void {
  deps = undefined;
}
