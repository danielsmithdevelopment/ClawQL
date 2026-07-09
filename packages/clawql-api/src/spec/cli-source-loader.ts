/**
 * Load CLI command wrappers as single execute operations (CLI-as-source).
 */

import type { Operation } from "./operation-types.js";
import { normalizeOperationId } from "./spec-kind.js";
import type { CustomSourceEntry } from "./custom-sources-types.js";

export async function loadCliSourceOperations(
  entries: CustomSourceEntry[]
): Promise<Operation[]> {
  const ops: Operation[] = [];

  for (const entry of entries.filter((e) => e.kind === "cli")) {
    if (!entry.cliCommand?.trim()) {
      console.error(`[spec-loader] CLI source "${entry.id}" skipped: missing cliCommand`);
      continue;
    }
    const id = normalizeOperationId("cli", entry.id, "run");
    ops.push({
      id,
      method: "CLI",
      path: `/cli/${entry.id}`,
      flatPath: `cli/${entry.id}`,
      description:
        entry.cliDescription?.trim() ||
        `Run CLI: ${[entry.cliCommand, ...(entry.cliArgs ?? [])].join(" ")}`,
      resource: entry.id,
      parameters: {
        args: {
          type: "array",
          location: "query",
          required: false,
          description: "Extra CLI arguments (strings) appended after configured args",
        },
        stdin: {
          type: "string",
          location: "query",
          required: false,
          description: "Optional stdin text for the subprocess",
        },
      },
      scopes: [],
      specLabel: entry.id,
      protocolKind: "cli",
      nativeCli: {
        sourceId: entry.id,
        command: entry.cliCommand.trim(),
        args: entry.cliArgs ?? [],
        env: entry.cliEnv ?? {},
      },
    });
    console.error(`[spec-loader] CLI source "${entry.id}": ${entry.cliCommand}`);
  }

  return ops;
}
