/**
 * MCP tool `ingest_external_knowledge` — bulk import into the vault (GitHub #40).
 *
 * - **`source: "markdown"`** + **`documents[]`**: write vault-relative `.md` files (same pipeline as `memory_ingest`).
 * - **`source: "url"`** + **`url`**: fetch HTTPS content when **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** (opt-in network).
 * - No payload: legacy **stub** roadmap JSON (still no writes).
 *
 * Orchestration: native Effect.gen in {@link executeExternalIngestCoreEffect}.
 */

import { getClawqlOptionalToolFlags, isPrivateOrLoopbackIp } from "clawql-api";
import { gatewayRedactionEnabled, maybeGatewayRedactText } from "clawql-api";
import { Effect } from "effect";
import { memoryDbLiveLayer } from "clawql-memory/plugin";
import { buildUrlIngestNote, formatUrlResponseAsMarkdown } from "./url-format.js";
import { slugifyTitle } from "clawql-memory/ingest/slug";
import {
  resolveVaultPath,
  withVaultWriteLock,
  writeVaultTextFileAtomic,
} from "clawql-memory/vault/utils";

const MAX_DOCUMENTS = 50;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_URL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_URL_REDIRECTS = 5;
const BLOCKED_INGEST_HOSTNAMES = new Set(["metadata.google.internal", "metadata.google"]);

/**
 * SSRF gate for URL ingest. Allows loopback only for explicit localhost / 127.0.0.1 / ::1
 * (local dry-run servers); blocks other private/link-local and cloud metadata hostnames.
 */
export function assertSafeExternalIngestUrl(urlStr: string): URL {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("only http and https URLs are allowed");
  }
  const host = u.hostname.trim().toLowerCase();
  const isLoopbackHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (u.protocol === "http:" && !isLoopbackHost) {
    throw new Error("http is only allowed for localhost; use https");
  }
  if (BLOCKED_INGEST_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("URL host is not allowed");
  }
  if (!isLoopbackHost && isPrivateOrLoopbackIp(host)) {
    throw new Error("URL must not target private or link-local addresses");
  }
  return u;
}

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

export function envFetchAllowed(): boolean {
  return process.env.CLAWQL_EXTERNAL_INGEST_FETCH?.trim() === "1";
}

export function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function validateMarkdownPath(rel: string): string | null {
  const n = normalizeRelPath(rel);
  if (!n.toLowerCase().endsWith(".md")) {
    return "path must end with .md";
  }
  if (n.split("/").some((x) => x === "..")) {
    return "path must not contain ..";
  }
  return null;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function defaultPathForUrl(urlStr: string): string {
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

export async function fetchUrlResource(urlStr: string): Promise<{
  body: string;
  contentType: string | null;
  finalUrl: string;
}> {
  let current = assertSafeExternalIngestUrl(urlStr).href;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (compatible; clawql-mcp-external-ingest/1.0; +https://github.com/danielsmithdevelopment/ClawQL)",
    Accept: "*/*",
  };

  for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
      headers,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc?.trim()) {
        throw new Error(`HTTP ${res.status} redirect without Location`);
      }
      current = assertSafeExternalIngestUrl(new URL(loc, current).href).href;
      continue;
    }
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
    return { body, contentType, finalUrl: current };
  }
  throw new Error("too many redirects");
}

export type PlannedMarkdownDoc = { rel: string; markdown: string };

/** Validate + optional Presidio redact for Markdown documents. */
export async function prepareMarkdownDocuments(
  documents: ExternalIngestDocumentInput[],
  vault: string
): Promise<{
  planned: PlannedMarkdownDoc[];
  docErrors: { path: string; error: string }[];
}> {
  const docErrors: { path: string; error: string }[] = [];
  const planned: PlannedMarkdownDoc[] = [];

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
    let markdown = d.markdown ?? "";
    if (gatewayRedactionEnabled()) {
      markdown = await maybeGatewayRedactText(markdown);
    }
    planned.push({ rel, markdown });
  }

  return { planned, docErrors };
}

export async function writePlannedMarkdownDocuments(
  vault: string,
  planned: PlannedMarkdownDoc[]
): Promise<void> {
  await withVaultWriteLock(vault, async () => {
    for (const p of planned) {
      await writeVaultTextFileAtomic(vault, p.rel, p.markdown);
    }
  });
}

export async function writeUrlIngestNote(
  vault: string,
  targetRel: string,
  finalUrl: string,
  body: string,
  contentType: string | null
): Promise<void> {
  const formatted = formatUrlResponseAsMarkdown(body, contentType, finalUrl);
  const note = buildUrlIngestNote(finalUrl, formatted, isoNow());
  await withVaultWriteLock(vault, async () => {
    await writeVaultTextFileAtomic(vault, targetRel, note);
  });
}

/**
 * Sync gate / payload classification (no IO). Early {@link ExternalIngestResult}
 * or a plan for Effect stages.
 */
export type ExternalIngestPrelude =
  | { kind: "result"; result: ExternalIngestResult }
  | {
      kind: "url";
      vault: string;
      url: string;
      targetRel: string;
      dryRun: boolean;
    }
  | {
      kind: "markdown";
      vault: string;
      documents: ExternalIngestDocumentInput[];
      dryRun: boolean;
    }
  | {
      kind: "stub";
      vault: string;
      dryRun: boolean;
      srcLabel: string;
    };

export function evaluateExternalIngestPrelude(
  vault: string | null,
  input: ExternalIngestInput
): ExternalIngestPrelude {
  const vaultConfigured = vault !== null;
  if (!getClawqlOptionalToolFlags().enableDocuments) {
    return {
      kind: "result",
      result: {
        ok: false,
        stub: true,
        enabled: false,
        vaultConfigured,
        hint: "Set CLAWQL_ENABLE_DOCUMENTS=1 (or unset) for document tools. See docs/mcp/mcp-tools.md.",
        message: "Document tools are disabled (CLAWQL_ENABLE_DOCUMENTS=0).",
        roadmap: [],
        relatedIssues: [40],
      },
    };
  }
  const enabled = externalIngestFeatureEnabled();
  const dryRun = input.dryRun !== false;

  if (!enabled) {
    return {
      kind: "result",
      result: {
        ok: false,
        stub: true,
        enabled: false,
        vaultConfigured,
        hint: "External bulk ingest is not enabled. Set CLAWQL_EXTERNAL_INGEST=1. See docs/mcp/external-ingest.md.",
        message:
          "Feature disabled. Set CLAWQL_EXTERNAL_INGEST=1 to import Markdown or (with CLAWQL_EXTERNAL_INGEST_FETCH=1) fetch a URL.",
        roadmap: [],
        relatedIssues: [40, 24, 25, 27],
      },
    };
  }

  const documents = input.documents;
  const urlRaw = input.url?.trim();
  const src = (input.source ?? "").trim().toLowerCase();

  const hasImportPayload =
    (documents !== undefined && documents.length > 0) || Boolean(urlRaw) || src === "url";

  if (hasImportPayload && (!vaultConfigured || !vault)) {
    return {
      kind: "result",
      result: {
        ok: false,
        enabled: true,
        vaultConfigured: false,
        message: "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH.",
        error: "vault_missing",
      },
    };
  }

  if (!vault) {
    return {
      kind: "result",
      result: {
        ok: true,
        stub: true,
        enabled: true,
        vaultConfigured: false,
        message:
          "No import payload. Configure CLAWQL_OBSIDIAN_VAULT_PATH to import Markdown or fetch URLs. " +
          "Pass documents[] or url + source url (with CLAWQL_EXTERNAL_INGEST_FETCH=1).",
        roadmap: [
          "Markdown: pass documents[] with vault-relative .md paths (dryRun defaults true).",
          'URL: set source to "url", pass url (https), scope as optional target path, and CLAWQL_EXTERNAL_INGEST_FETCH=1.',
          "Secrets: per-provider env vars for future Notion/Confluence/GitHub plugins; never logged.",
          "Orchestration: writes use the vault lock; syncMemoryDbForVaultScanRoot + _INDEX_ page after import.",
        ],
        relatedIssues: [40, 24, 25, 27],
      },
    };
  }

  if (documents?.length && urlRaw) {
    return {
      kind: "result",
      result: {
        ok: false,
        enabled: true,
        vaultConfigured: true,
        message: "Pass only one of documents[] or url, not both.",
        error: "conflicting_payload",
      },
    };
  }

  if (urlRaw || src === "url") {
    if (!urlRaw) {
      return {
        kind: "result",
        result: {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message: 'source "url" requires a non-empty url string.',
          error: "url_required",
        },
      };
    }
    if (!envFetchAllowed()) {
      return {
        kind: "result",
        result: {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message:
            "URL fetch is disabled. Set CLAWQL_EXTERNAL_INGEST_FETCH=1 to allow HTTPS fetch from this tool.",
          error: "fetch_disabled",
        },
      };
    }
    const targetRel = input.scope?.trim()
      ? normalizeRelPath(input.scope)
      : defaultPathForUrl(urlRaw);
    const pathErr = validateMarkdownPath(targetRel);
    if (pathErr) {
      return {
        kind: "result",
        result: {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message: `Invalid target path: ${pathErr}`,
          error: "invalid_path",
        },
      };
    }
    try {
      resolveVaultPath(vault, targetRel);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        kind: "result",
        result: {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message: msg,
          error: "invalid_path",
        },
      };
    }
    return { kind: "url", vault, url: urlRaw, targetRel, dryRun };
  }

  if (documents !== undefined && documents.length > 0) {
    if (documents.length > MAX_DOCUMENTS) {
      return {
        kind: "result",
        result: {
          ok: false,
          enabled: true,
          vaultConfigured: true,
          message: `At most ${MAX_DOCUMENTS} documents per call.`,
          error: "too_many_documents",
        },
      };
    }
    return { kind: "markdown", vault, documents, dryRun };
  }

  return {
    kind: "stub",
    vault,
    dryRun,
    srcLabel: input.source?.trim() || "unspecified",
  };
}

/**
 * Run external ingest: Markdown documents and/or (opt-in) URL fetch.
 * Promise façade over native Effect.gen staging (dynamic import avoids cycle).
 */
export async function executeExternalIngestCore(
  vault: string | null,
  input: ExternalIngestInput
): Promise<ExternalIngestResult> {
  const { executeExternalIngestCoreEffect } = await import("../effect/external-ingest-effect.js");
  return Effect.runPromise(
    executeExternalIngestCoreEffect(vault, input).pipe(Effect.provide(memoryDbLiveLayer()))
  );
}

/** Public async facade for external ingest (MCP tools, scripts). */
export async function runIngestExternalKnowledge(
  input: ExternalIngestInput
): Promise<ExternalIngestResult> {
  const { runDocumentsEffect, documentsIngestProgram } =
    await import("../effect/documents-effect-runtime.js");
  return runDocumentsEffect(documentsIngestProgram(input));
}
