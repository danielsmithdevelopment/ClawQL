import { readFile, realpath, stat } from "node:fs/promises";
import { cwd } from "node:process";
import { isAbsolute, resolve } from "node:path";
import { anydocFileRootsEnv } from "./env.js";

function isPathInsideRoot(root: string, file: string): boolean {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file === root || file.startsWith(prefix);
}

async function resolveAllowRoots(): Promise<string[]> {
  const raw = anydocFileRootsEnv();
  const parts = raw
    ? raw
        .split(/[:,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [cwd()];
  const out: string[] = [];
  for (const p of parts) {
    try {
      out.push(await realpath(resolve(p)));
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
export async function readAnydocPathAllowlisted(pathInput: string): Promise<Buffer> {
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
      "No valid CLAWQL_ANYDOC_FILE_ROOTS (or CLAWQL_PDF_INSPECTOR_FILE_ROOTS) could be resolved; set absolute directory prefixes."
    );
  }
  if (!roots.some((root) => isPathInsideRoot(root, realFile))) {
    const show = anydocFileRootsEnv()
      ? "CLAWQL_ANYDOC_FILE_ROOTS / CLAWQL_PDF_INSPECTOR_FILE_ROOTS"
      : "the default process working directory (set CLAWQL_ANYDOC_FILE_ROOTS to allow more trees)";
    throw new Error(`document path escapes allowlist (${show}): ${pathInput}`);
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
