/**
 * MCP tool `ingest_external_knowledge` — bulk import into the vault (GitHub #40).
 *
 * - **`source: "markdown"`** + **`documents[]`**: write vault-relative `.md` files (same pipeline as `memory_ingest`).
 * - **`source: "url"`** + **`url`**: fetch HTTPS content when **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** (opt-in network).
 * - No payload: legacy **stub** roadmap JSON (still no writes).
 */

import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { buildUrlIngestNote, formatUrlResponseAsMarkdown } from "./external-ingest-url-format.js";
import { slugifyTitle } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";
import { resolveVaultPath, withVaultWriteLock, writeVaultTextFileAtomic } from "./vault-utils.js";
import { logMcpToolShape } from "./mcp-tool-log.js";

const MAX_DOCUMENTS = 50;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_URL_RESPONSE_BYTES = 2 * 1024 * 1024;

export type ExternalIngestDocumentInput = {
  /** Vault-relative path (must end with `.md`; no `..`). */
  path: string;
  /** Markdown body UTF-8. */
  markdown: string;
};

export type ExternalIngestInput = {
  /** `markdown` (default when `documents` set) | `url` | other — reserved for future providers. */
  source?: string;
  /** Default **true**: validate only; no vault writes. Set **false** to import. */
  dryRun?: boolean;
  /** Reserved for future provider scoping. */
  scope?: string;
  /** Bulk Markdown files ( **`source`** defaults to **`markdown`** ). */
  documents?: ExternalIngestDocumentInput[];
  /** HTTPS URL to fetch when **`source`** is **`url`**. */
  url?: string;
};

export type ExternalIngestResult = {
  ok: boolean;
  /** Present for the legacy no-payload preview. */
  stub?: boolean;
  /** `CLAWQL_EXTERNAL_INGEST=1` — tool enabled. */
  enabled: boolean;
  vaultConfigured: boolean;
  hint?: string;
  message: string;
  roadmap?: string[];
  relatedIssues?: number[];
  /** When **`CLAWQL_MERKLE_ENABLED=1`** and **`memory.db`** is available: current vault Merkle row. */
  merkleSnapshot?: {
    rootHex: string;
    leafCount: number;
    treeHeight: number;
    builtAt: string;
  } | null;
  /** When **`CLAWQL_CUCKOO_ENABLED=1`** and the sidecar is on. */
  cuckooMembershipReady?: boolean;
  dryRun?: boolean;
  /** Paths written (or that would be written). */
  importedPaths?: string[];
  /** Validation failures for individual documents (import still succeeds for others when partial). */
  documentErrors?: { path: string; error: string }[];
  error?: string;
};

/** Opt-in for this tool + non-stub imports. */
export function externalIngestFeatureEnabled(): boolean {
  return getClawqlOptionalToolFlags().externalIngestPreview;
}

function envFetchAllowed(): boolean {
  return process.env.CLAWQL_EXTERNAL_INGEST_FETCH?.trim() === "1";
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function validateMarkdownPath(rel: string): string | null {
  const n = normalizeRelPath(rel);
  if (!n.toLowerCase().endsWith(".md")) {
    return "path must end with .md";
  }
  if (n.split("/").some((x) => x === "..")) {
    return "path must not contain ..";
  }
  return null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function defaultPathForUrl(urlStr: string): string {
  let pathname = "/fetched";
  try {
    pathname = new URL(urlStr).pathname || "/";
  } catch {
    /* use default */
  }
  const seg = pathname.split("/").filter(Boolean).pop() || "page";
  const base = seg.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "page";
  const safe = base.toLowerCase().endsWith(".md") ? base.slice(0, -3) : base;
  const slug = slugifyTitle(safe).slice(0, 80) || "fetched";
  return `Memory/external/${slug}.md`;
}

async function loadOptionalArtifactHints(
  vault: string
): Promise<Pick<ExternalIngestResult, "merkleSnapshot" | "cuckooMembershipReady">> {
  let merkleSnapshot: ExternalIngestResult["merkleSnapshot"];
  let cuckooMembershipReady: boolean | undefined;
  try {
    const { loadVaultMerkleSnapshotFromDb, memoryDbSyncEnabled } = await import("./memory-db.js");
    if (memoryDbSyncEnabled()) {
      if (process.env.CLAWQL_MERKLE_ENABLED === "1") {
        merkleSnapshot = await loadVaultMerkleSnapshotFromDb(vault);
      }
      if (process.env.CLAWQL_CUCKOO_ENABLED === "1") {
        cuckooMembershipReady = true;
      }
    }
  } catch {
    /* ignore */
  }
  return {
    ...(merkleSnapshot !== undefined ? { merkleSnapshot } : {}),
    ...(cuckooMembershipReady !== undefined ? { cuckooMembershipReady } : {}),
  };
}

async function afterImportSync(vault: string): Promise<void> {
  try {
    const { syncMemoryDbForVaultScanRoot } = await import("./memory-db.js");
    await syncMemoryDbForVaultScanRoot(vault);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] memory.db sync after external ingest failed: ${msg}`);
  }
  try {
    const { updateProviderIndexPage } = await import("./memory-provider-index.js");
    await updateProviderIndexPage(vault);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] provider index update after external ingest failed: ${msg}`);
  }
}

async function fetchUrlResource(urlStr: string): Promise<{
  body: string;
  contentType: string | null;
  finalUrl: string;
}> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("only http and https URLs are allowed");
  }
  if (u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error("http is only allowed for localhost; use https");
  }
  const res = await fetch(urlStr, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; clawql-mcp-external-ingest/1.0; +https://github.com/danielsmithdevelopment/ClawQL)",
      Accept: "*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const len = res.headers.get("content-length");
  if (len && Number.parseInt(len, 10) > MAX_URL_RESPONSE_BYTES) {
    throw new Error("Content-Length exceeds cap");
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_URL_RESPONSE_BYTES) {
    throw new Error("response body exceeds cap");
  }
  const rawCt = res.headers.get("content-type");
  const contentType = rawCt?.split(";")[0]?.trim() ?? null;
  const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { body, contentType, finalUrl: res.url };
}

/**
 * Run external ingest: Markdown documents and/or (opt-in) URL fetch.
 */
export async function runIngestExternalKnowledge(
  input: ExternalIngestInput
): Promise<ExternalIngestResult> {
  const vaultConfigured = getObsidianVaultPath() !== null;
  const enabled = externalIngestFeatureEnabled();
  const dryRun = input.dryRun !== false;
  const vault = getObsidianVaultPath();

  if (!enabled) {
    return {
      ok: false,
      stub: true,
      enabled: false,
      vaultConfigured,
      hint: "External bulk ingest is not enabled. Set CLAWQL_EXTERNAL_INGEST=1. See docs/external-ingest.md.",
      message:
        "Feature disabled. Set CLAWQL_EXTERNAL_INGEST=1 to import Markdown or (with CLAWQL_EXTERNAL_INGEST_FETCH=1) fetch a URL.",
      roadmap: [],
      relatedIssues: [40, 24, 25, 27],
    };
  }

  const documents = input.documents;
  const urlRaw = input.url?.trim();
  const src = (input.source ?? "").trim().toLowerCase();

  const hasImportPayload =
    (documents !== undefined && documents.length > 0) ||
    Boolean(urlRaw) ||
    src === "url";

  if (hasImportPayload && (!vaultConfigured || !vault)) {
    return {
      ok: false,
      enabled: true,
      vaultConfigured: false,
      message: "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH.",
      error: "vault_missing",
    };
  }

  if (!vault) {
    return {
      ok: true,
      stub: true,
      enabled: true,
      vaultConfigured: false,
      message:
        "No import payload. Configure CLAWQL_OBSIDIAN_VAULT_PATH to import Markdown or fetch URLs. " +
        "Pass documents[] or url + source url (with CLAWQL_EXTERNAL_INGEST_FETCH=1).",
      roadmap: [
        "Markdown: pass documents[] with vault-relative .md paths (dryRun defaults true).",
        "URL: set source to \"url\", pass url (https), scope as optional target path, and CLAWQL_EXTERNAL_INGEST_FETCH=1.",
        "Secrets: per-provider env vars for future Notion/Confluence/GitHub plugins; never logged.",
        "Orchestration: writes use the vault lock; syncMemoryDbForVaultScanRoot + _INDEX_ page after import.",
      ],
      relatedIssues: [40, 24, 25, 27],
    };
  }

  if (documents?.length && urlRaw) {
    return {
      ok: false,
      enabled: true,
      vaultConfigured: true,
      message: "Pass only one of documents[] or url, not both.",
      error: "conflicting_payload",
    };
  }

  if (urlRaw || src === "url") {
    if (!urlRaw) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: 'source "url" requires a non-empty url string.',
        error: "url_required",
      };
    }
    if (!envFetchAllowed()) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message:
          "URL fetch is disabled. Set CLAWQL_EXTERNAL_INGEST_FETCH=1 to allow HTTPS fetch from this tool.",
        error: "fetch_disabled",
      };
    }
    const targetRel = input.scope?.trim()
      ? normalizeRelPath(input.scope)
      : defaultPathForUrl(urlRaw);
    const pathErr = validateMarkdownPath(targetRel);
    if (pathErr) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: `Invalid target path: ${pathErr}`,
        error: "invalid_path",
      };
    }
    try {
      resolveVaultPath(vault, targetRel);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: msg,
        error: "invalid_path",
      };
    }

    if (dryRun) {
      return {
        ok: true,
        enabled: true,
        vaultConfigured: true,
        dryRun: true,
        message: `Would fetch ${JSON.stringify(urlRaw)} → ${JSON.stringify(targetRel)}`,
        importedPaths: [targetRel],
        ...(await loadOptionalArtifactHints(vault)),
      };
    }

    let resource: { body: string; contentType: string | null; finalUrl: string };
    try {
      resource = await fetchUrlResource(urlRaw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: `Fetch failed: ${msg}`,
        error: "fetch_failed",
      };
    }

    const formatted = formatUrlResponseAsMarkdown(
      resource.body,
      resource.contentType,
      resource.finalUrl
    );
    const note = buildUrlIngestNote(resource.finalUrl, formatted, isoNow());
    await withVaultWriteLock(vault, async () => {
      await writeVaultTextFileAtomic(vault, targetRel, note);
    });
    await afterImportSync(vault);

    const hints = await loadOptionalArtifactHints(vault);
    return {
      ok: true,
      enabled: true,
      vaultConfigured: true,
      dryRun: false,
      message: `Fetched and wrote ${targetRel}`,
      importedPaths: [targetRel],
      ...hints,
    };
  }

  if (documents !== undefined && documents.length > 0) {
    if (documents.length > MAX_DOCUMENTS) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: `At most ${MAX_DOCUMENTS} documents per call.`,
        error: "too_many_documents",
      };
    }

    const docErrors: { path: string; error: string }[] = [];
    const planned: { rel: string; markdown: string }[] = [];

    for (const d of documents) {
      const rel = normalizeRelPath(d.path);
      const pe = validateMarkdownPath(rel);
      if (pe) {
        docErrors.push({ path: d.path, error: pe });
        continue;
      }
      if (Buffer.byteLength(d.markdown ?? "", "utf8") > MAX_MARKDOWN_BYTES) {
        docErrors.push({ path: d.path, error: "markdown exceeds size cap" });
        continue;
      }
      try {
        resolveVaultPath(vault, rel);
      } catch (e: unknown) {
        docErrors.push({ path: d.path, error: e instanceof Error ? e.message : String(e) });
        continue;
      }
      planned.push({ rel, markdown: d.markdown ?? "" });
    }

    if (planned.length === 0) {
      return {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: "No valid documents to import.",
        documentErrors: docErrors,
        error: "no_valid_documents",
      };
    }

    if (dryRun) {
      return {
        ok: true,
        enabled: true,
        vaultConfigured: true,
        dryRun: true,
        message: `Would import ${planned.length} Markdown file(s).`,
        importedPaths: planned.map((p) => p.rel),
        documentErrors: docErrors.length > 0 ? docErrors : undefined,
        ...(await loadOptionalArtifactHints(vault)),
      };
    }

    await withVaultWriteLock(vault, async () => {
      for (const p of planned) {
        await writeVaultTextFileAtomic(vault, p.rel, p.markdown);
      }
    });
    await afterImportSync(vault);

    const hints = await loadOptionalArtifactHints(vault);
    return {
      ok: true,
      enabled: true,
      vaultConfigured: true,
      dryRun: false,
      message: `Imported ${planned.length} Markdown file(s).`,
      importedPaths: planned.map((p) => p.rel),
      documentErrors: docErrors.length > 0 ? docErrors : undefined,
      ...hints,
    };
  }

  const srcLabel = input.source?.trim() || "unspecified";
  const hints = await loadOptionalArtifactHints(vault);
  return {
    ok: true,
    stub: true,
    enabled: true,
    vaultConfigured: true,
    message:
      `No import payload. Pass documents: [{ path, markdown }] for Markdown import, or url + source "url" with CLAWQL_EXTERNAL_INGEST_FETCH=1. ` +
      `Preview: source=${JSON.stringify(srcLabel)}, dryRun=${dryRun}.`,
    roadmap: [
      "Markdown: pass documents[] with vault-relative .md paths (dryRun defaults true).",
      "URL: set source to \"url\", pass url (https), scope as optional target path, and CLAWQL_EXTERNAL_INGEST_FETCH=1.",
      "Secrets: per-provider env vars for future Notion/Confluence/GitHub plugins; never logged.",
      "Orchestration: writes use the vault lock; syncMemoryDbForVaultScanRoot + _INDEX_ page after import.",
    ],
    relatedIssues: [40, 24, 25, 27],
    ...hints,
  };
}

export async function handleIngestExternalKnowledgeToolInput(
  params: ExternalIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("ingest_external_knowledge", {
    sourceChars: params.source?.length ?? 0,
    dryRun: params.dryRun !== false,
    hasScope: Boolean(params.scope?.trim()),
    documentCount: params.documents?.length ?? 0,
    urlChars: params.url?.length ?? 0,
  });
  const result = await runIngestExternalKnowledge(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
