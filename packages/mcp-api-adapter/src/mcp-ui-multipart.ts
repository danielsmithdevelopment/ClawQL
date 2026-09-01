import Busboy from "busboy";
import type { Request } from "express";

export type ParsedMultipart = {
  fields: Record<string, string>;
  files: Record<string, { filename: string; mimeType: string; buffer: Buffer }>;
};

/**
 * Parse multipart/form-data from an Express request into fields + in-memory files.
 */
export function parseMultipartRequest(
  req: Request,
  options?: { maxFileBytes?: number }
): Promise<ParsedMultipart> {
  const maxFileBytes = options?.maxFileBytes ?? 25 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: ParsedMultipart["files"] = {};
    let settled = false;

    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: maxFileBytes, files: 8, fields: 64 },
    });

    bb.on("file", (name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("end", () => {
        if (truncated) {
          if (!settled) {
            settled = true;
            reject(new Error(`File too large (max ${maxFileBytes} bytes)`));
          }
          return;
        }
        files[name] = {
          filename: info.filename || "upload.bin",
          mimeType: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        };
      });
      stream.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    bb.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve({ fields, files });
      }
    });

    req.pipe(bb);
  });
}

export function isMultipartRequest(req: Request): boolean {
  const ct = req.headers["content-type"];
  return typeof ct === "string" && ct.toLowerCase().includes("multipart/form-data");
}

/** Map uploaded files into MCP tool args (pdf_base64 / base64 / field name). */
export function mergeFilesIntoArgs(
  fields: Record<string, string>,
  files: ParsedMultipart["files"],
  preferredBase64Field?: string
): Record<string, unknown> {
  const args: Record<string, unknown> = { ...fields };
  const entries = Object.entries(files);
  if (entries.length === 0) return args;

  const [firstName, firstFile] = entries[0]!;
  const b64 = firstFile.buffer.toString("base64");

  let target = preferredBase64Field;
  if (!target) {
    if (firstName === "pdf_base64" || firstName === "base64") {
      target = firstName;
    } else if (firstName === "file" || firstName === "upload") {
      target = "pdf_base64" in args || "pdf_base64" in fields ? "pdf_base64" : "pdf_base64";
    } else if (/base64|pdf|file|upload/i.test(firstName)) {
      target = firstName;
    } else {
      target = "pdf_base64";
    }
  }

  args[target] = b64;
  args.__upload_filename = firstFile.filename;
  args.__upload_mime = firstFile.mimeType;

  for (const [name, file] of entries.slice(1)) {
    args[name] = file.buffer.toString("base64");
    args[`${name}_filename`] = file.filename;
  }

  return args;
}
