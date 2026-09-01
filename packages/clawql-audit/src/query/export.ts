import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import { exportToQR, type QRExportResult } from "./qr-export.js";

export type ExportFormat = "json" | "csv" | "qr";

export type ExportResult =
  | { format: "json"; body: string; entryCount: number }
  | { format: "csv"; body: string; entryCount: number }
  | ({ format: "qr" } & QRExportResult & { entryCount: number });

const csvEscape = (v: string): string => `"${v.replace(/"/g, '""')}"`;

export type ExportOptions = {
  qr?: {
    chunkSizeBytes?: number;
    redundancy?: number;
    qrVersion?: number;
    encryptionKeyHex?: string;
    hmacKeyHex?: string;
  };
};

export const exportEntries = (
  entries: readonly WORMEntry[],
  format: ExportFormat,
  options: ExportOptions = {}
): Effect.Effect<ExportResult, AuditError> =>
  Effect.gen(function* () {
    if (format === "qr") {
      const qr = yield* exportToQR(entries, options.qr ?? {});
      return { format: "qr" as const, entryCount: entries.length, ...qr };
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
