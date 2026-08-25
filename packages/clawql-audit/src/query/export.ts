import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";

export type ExportFormat = "json" | "csv" | "qr";

export type ExportResult =
  | { format: "json"; body: string; entryCount: number }
  | { format: "csv"; body: string; entryCount: number }
  | {
      format: "qr";
      unavailable: true;
      reason: string;
      entryCount: number;
    };

const csvEscape = (v: string): string => `"${v.replace(/"/g, '""')}"`;

export const exportEntries = (
  entries: readonly WORMEntry[],
  format: ExportFormat
): Effect.Effect<ExportResult, AuditError> =>
  Effect.gen(function* () {
    if (format === "qr") {
      // Phase 2 — QR fountain / ChaCha20 / HMAC (keys from env/KMS only).
      return {
        format: "qr" as const,
        unavailable: true as const,
        reason:
          "QR air-gap export ships in Phase 2 (requires CLAWQL_AUDIT_QR_* keys and RaptorQ)",
        entryCount: entries.length,
      };
    }
    if (format === "json") {
      return {
        format: "json" as const,
        body: JSON.stringify(entries, null, 2),
        entryCount: entries.length,
      };
    }
    if (format === "csv") {
      const header = [
        "id",
        "chainIndex",
        "hash",
        "prevHash",
        "type",
        "timestamp",
        "sessionId",
        "agentName",
        "writtenAt",
      ];
      const lines = [header.join(",")];
      for (const e of entries) {
        lines.push(
          [
            e.id,
            String(e.chainIndex),
            e.hash,
            e.prevHash,
            e.type,
            e.timestamp,
            e.sessionId,
            e.agentName ?? "",
            e.writtenAt,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      return {
        format: "csv" as const,
        body: lines.join("\n"),
        entryCount: entries.length,
      };
    }
    return yield* Effect.fail(new AuditError({ reason: `Unknown export format: ${format}` }));
  });

export type { WORMFilter };
