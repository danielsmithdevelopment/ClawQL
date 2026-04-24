/**
 * Server-side reads for `memory_ingest.toolOutputsFile` — large bodies without
 * multi‑100KB tool JSON from the client.
 */
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { cwd } from "node:process";

const DEFAULT_MAX_BYTES = 10_000_000;

/** `root` and `file` must be realpath-resolved. */
function isPathUnderRootDir(root: string, file: string): boolean {
  const r = root.endsWith(sep) ? root : root + sep;
  return file === root || file.startsWith(r);
}

export function isMemoryIngestFileReadEnabled(): boolean {
  const v = process.env.CLAWQL_MEMORY_INGEST_FILE?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

export function getMemoryIngestFileMaxBytes(): number {
  const raw = process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/**
 * Comma- or newline-separated absolute directory prefixes. If unset, the only
 * allowed root is the process current working directory (resolved).
 */
export async function getMemoryIngestFileRootsReal(): Promise<string[]> {
  const raw = process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS?.trim();
  const parts = raw
    ? raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  if (parts.length > 0) {
    const out: string[] = [];
    for (const p of parts) {
      try {
        out.push(await realpath(resolve(p)));
      } catch {
        // ignore invalid roots; still enforce others
      }
    }
    return out;
  }
  try {
    return [await realpath(cwd())];
  } catch {
    return [cwd()];
  }
}

/**
 * Resolves @param userPath (absolute or relative to `process.cwd()`), checks it is
 * a regular file under an allowed root, and returns UTF-8 text.
 */
export async function readToolOutputsFileForIngest(
  userPath: string
): Promise<
  { ok: true; text: string; displayPath: string; absolutePath: string } | { ok: false; error: string }
> {
  if (!isMemoryIngestFileReadEnabled()) {
    return {
      ok: false,
      error:
        "Server-side file read for `toolOutputsFile` is disabled (`CLAWQL_MEMORY_INGEST_FILE=0` / `false` / `off` / `no`); unset to allow reads under allowed roots.",
    };
  }

  const t = userPath?.trim() ?? "";
  if (!t) {
    return { ok: false, error: "toolOutputsFile is empty" };
  }
  if (t.length > 4096) {
    return { ok: false, error: "toolOutputsFile path is too long" };
  }
  if (t.includes("\0")) {
    return { ok: false, error: "toolOutputsFile contains a null byte" };
  }

  const maxBytes = getMemoryIngestFileMaxBytes();
  let abs: string;
  try {
    abs = isAbsolute(t) ? resolve(t) : resolve(cwd(), t);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `path resolution failed: ${msg}` };
  }

  let realFile: string;
  try {
    realFile = await realpath(abs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `file not found or not accessible: ${msg}` };
  }

  const st = await stat(realFile);
  if (!st.isFile()) {
    return { ok: false, error: "toolOutputsFile path is not a regular file" };
  }
  if (st.size > maxBytes) {
    return {
      ok: false,
      error: `file size ${st.size} bytes exceeds CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES (${maxBytes})`,
    };
  }

  const roots = await getMemoryIngestFileRootsReal();
  if (roots.length === 0) {
    return {
      ok: false,
      error:
        "No valid CLAWQL_MEMORY_INGEST_FILE_ROOTS could be resolved; set absolute directory prefixes in CLAWQL_MEMORY_INGEST_FILE_ROOTS.",
    };
  }

  let allowed = false;
  for (const root of roots) {
    if (isPathUnderRootDir(root, realFile)) {
      allowed = true;
      break;
    }
  }

  if (!allowed) {
    const show = process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS?.trim()
      ? "CLAWQL_MEMORY_INGEST_FILE_ROOTS"
      : "the default process working directory (set CLAWQL_MEMORY_INGEST_FILE_ROOTS to allow more trees)";
    return { ok: false, error: `path is outside allowed roots from ${show}` };
  }

  const text = await readFile(realFile, "utf8");
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, error: `decoded UTF-8 content exceeds max bytes (${maxBytes})` };
  }

  const displayPath = t;
  return { ok: true, text, displayPath, absolutePath: realFile };
}
