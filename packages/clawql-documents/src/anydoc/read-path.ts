import { readFile, realpath, stat } from "node:fs/promises";
import { cwd } from "node:process";
import { isAbsolute, resolve } from "node:path";
import {
  filterConfiguredFileRoots,
  isForbiddenAllowlistedFile,
  isForbiddenFileRoot,
} from "../shared/file-roots.js";
import { anydocFileRootsEnv } from "./env.js";
import { Effect } from "effect";

function isPathInsideRoot(root: string, file: string): boolean {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file === root || file.startsWith(prefix);
}

/**
 * Audit 4.03: no cwd default. Roots must be set; `/`, `$HOME`, `$CLAWQL_HOME` refused.
 */
async function resolveAllowRoots(): Promise<string[]> {
  const raw = anydocFileRootsEnv();
  const parts = raw
    ? raw
        .split(/[:,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const candidates = filterConfiguredFileRoots(parts, process.env);
  const out: string[] = [];
  for (const p of candidates) {
    try {
      const real = await realpath(resolve(p));
      if (!isForbiddenFileRoot(real, process.env)) out.push(real);
    } catch {
      /* skip missing roots */
    }
  }
  return out;
}

/**
 * Read a document from an allowlisted filesystem path.
 * Throws a clear Error when the path is outside roots or not a regular file.
 */
async function readAnydocPathAllowlistedImpl(pathInput: string): Promise<Buffer> {
  const abs = isAbsolute(pathInput) ? pathInput : resolve(cwd(), pathInput);
  let realFile: string;
  try {
    realFile = await realpath(abs);
  } catch {
    throw new Error(`document path not found: ${pathInput}`);
  }
  const roots = await resolveAllowRoots();
  if (roots.length === 0) {
    throw new Error(
      "convert_document requires CLAWQL_ANYDOC_FILE_ROOTS or CLAWQL_PDF_INSPECTOR_FILE_ROOTS " +
        "(absolute dirs; `/`, `$HOME`, and `$CLAWQL_HOME` are refused)."
    );
  }
  const matched = roots.find((root) => isPathInsideRoot(root, realFile));
  if (!matched) {
    throw new Error(
      `document path escapes allowlist (CLAWQL_ANYDOC_FILE_ROOTS / CLAWQL_PDF_INSPECTOR_FILE_ROOTS): ${pathInput}`
    );
  }
  if (isForbiddenAllowlistedFile(realFile, matched)) {
    throw new Error(`document path looks like a secret or credential file: ${pathInput}`);
  }
  const st = await stat(realFile);
  if (!st.isFile()) {
    throw new Error(`document path is not a regular file: ${pathInput}`);
  }
  if (st.size > 100 * 1024 * 1024) {
    throw new Error(`document exceeds 100 MiB limit (${st.size} bytes)`);
  }
  return readFile(realFile);
}

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Read a document from an allowlisted filesystem path (Effect-primary). */
export function readAnydocPathAllowlistedEffect(pathInput: string): Effect.Effect<Buffer, Error> {
  return Effect.tryPromise({ try: () => readAnydocPathAllowlistedImpl(pathInput), catch: fsError });
}

/** Promise façade for callers that still await allowlisted document reads. */
export async function readAnydocPathAllowlisted(pathInput: string): Promise<Buffer> {
  return Effect.runPromise(readAnydocPathAllowlistedEffect(pathInput));
}
