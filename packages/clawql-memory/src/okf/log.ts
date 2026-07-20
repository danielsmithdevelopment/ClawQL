/**
 * OKF `log.md` — append-only changelog under the recall scan root.
 */

import { readVaultTextFile, writeVaultTextFileAtomic } from "../vault/utils.js";

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function logFileRel(scanRoot: string): string {
  const root = scanRoot.replace(/\\/g, "/").replace(/^\/+/, "");
  return root ? `${root}/log.md` : "log.md";
}

const LOG_HEADER = [
  "---",
  'type: "log"',
  'title: "Memory vault log"',
  'description: "Append-only OKF changelog of memory_ingest events"',
  "tags: [clawql-ingest, okf-log]",
  "clawql_generated: okf_log",
  "clawql_okf: true",
  "---",
  "",
  "# Memory vault log",
  "",
  "Append-only OKF `log.md`. Each successful `memory_ingest` adds a dated entry.",
  "",
].join("\n");

export type OkfLogEntry = {
  timestamp: string;
  title: string;
  path: string;
  type: string;
  correlationId?: string;
  skipped?: boolean;
};

/**
 * Append one ingest event to `Memory/log.md` (or scan-root equivalent).
 * Disabled when **`CLAWQL_MEMORY_OKF_LOG=0`**.
 */
export async function appendOkfMemoryLog(
  vaultRoot: string,
  entry: OkfLogEntry
): Promise<void> {
  if (process.env.CLAWQL_MEMORY_OKF_LOG?.trim() === "0") return;

  const rel = logFileRel(defaultScanRoot());
  let existing = "";
  try {
    existing = await readVaultTextFile(vaultRoot, rel);
  } catch {
    existing = LOG_HEADER;
  }

  if (!existing.trim()) existing = LOG_HEADER;

  const date = entry.timestamp.slice(0, 10);
  const corr = entry.correlationId?.trim()
    ? ` · correlation \`${entry.correlationId.trim().replace(/`/g, "'")}\``
    : "";
  const skip = entry.skipped ? " _(duplicate skipped)_" : "";
  const line = `- **${entry.timestamp}** — [[${entry.title.replace(/\]\]/g, "")}]] (\`${entry.path}\`) type=\`${entry.type}\`${corr}${skip}`;

  // Group under ## YYYY-MM-DD when possible
  const heading = `## ${date}`;
  let next: string;
  if (existing.includes(`\n${heading}\n`) || existing.startsWith(`${heading}\n`)) {
    // Insert after heading
    const idx = existing.indexOf(heading);
    const afterHeading = idx + heading.length;
    const rest = existing.slice(afterHeading);
    const nextHeading = rest.search(/\n## /);
    const before = existing.slice(0, afterHeading);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    const after = nextHeading === -1 ? "" : rest.slice(nextHeading);
    const sectionTrim = section.endsWith("\n") ? section : `${section}\n`;
    next = `${before}${sectionTrim}${line}\n${after}`.replace(/\n{3,}/g, "\n\n");
  } else {
    next = `${existing.trimEnd()}\n\n${heading}\n\n${line}\n`;
  }

  await writeVaultTextFileAtomic(vaultRoot, rel, next);
}
