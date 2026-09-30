const ALLOWED_EXT = new Set([".cqe", ".cqk"]);

export type OpenFileInput = {
  readonly file: {
    readonly name: string;
    readonly resourceUri: string;
  };
  /** Absolute path from host — never returned to app or model. */
  readonly absolutePath?: string;
};

export type OpenFileResult = {
  readonly kind: "cqe" | "cqk";
  readonly name: string;
  readonly resourceUri: string;
  readonly editor: "ontology-schema" | "memory-note";
  readonly validation: { readonly ok: boolean; readonly errors: string[] };
  readonly trustFields?: {
    readonly generatedBy?: string;
    readonly verifiedBy?: string;
    readonly staleAfter?: string;
  };
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isAllowedFileExtension(name: string): boolean {
  return ALLOWED_EXT.has(extensionOf(name));
}

/** Validate .cqe ontology schema JSON or .cqk memory note YAML frontmatter-ish text. */
export function validateFileContent(name: string, text: string): { ok: boolean; errors: string[] } {
  const ext = extensionOf(name);
  if (ext === ".cqe") {
    try {
      const parsed = JSON.parse(text) as { type?: string; entities?: unknown };
      const errors: string[] = [];
      if (!parsed || typeof parsed !== "object") errors.push("schema must be an object");
      if (!parsed.type && !parsed.entities) {
        errors.push("schema requires type or entities");
      }
      return { ok: errors.length === 0, errors };
    } catch (e) {
      return { ok: false, errors: [e instanceof Error ? e.message : "invalid JSON"] };
    }
  }
  if (ext === ".cqk") {
    const errors: string[] = [];
    if (!text.trim()) errors.push("empty note");
    return { ok: errors.length === 0, errors };
  }
  return { ok: false, errors: [`unsupported extension ${ext}`] };
}

/**
 * Build open-file result. Absolute path is accepted for IO but **never** included
 * in the returned payload (security: host `_meta["openai/resource"].path`).
 */
export function openClawqlFile(
  input: OpenFileInput,
  contentText: string
): OpenFileResult | { error: string } {
  if (!isAllowedFileExtension(input.file.name)) {
    return { error: "only .cqe and .cqk are supported" };
  }
  void input.absolutePath; // used only by caller for disk IO — never echo
  const ext = extensionOf(input.file.name);
  const validation = validateFileContent(input.file.name, contentText);
  if (ext === ".cqe") {
    return {
      kind: "cqe",
      name: input.file.name,
      resourceUri: input.file.resourceUri,
      editor: "ontology-schema",
      validation,
    };
  }
  return {
    kind: "cqk",
    name: input.file.name,
    resourceUri: input.file.resourceUri,
    editor: "memory-note",
    validation,
    trustFields: {
      generatedBy: undefined,
      verifiedBy: undefined,
      staleAfter: undefined,
    },
  };
}

export type WriteFileOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "conflict" | "too-large"; readonly message: string };

export function evaluateWritePreconditions(opts: {
  readonly ifMatch?: string;
  readonly currentEtag?: string;
  readonly byteLength: number;
  readonly maxBytes?: number;
}): WriteFileOutcome {
  const max = opts.maxBytes ?? 512_000;
  if (opts.byteLength > max) {
    return { ok: false, code: "too-large", message: `content exceeds ${max} bytes` };
  }
  if (opts.ifMatch && opts.currentEtag && opts.ifMatch !== opts.currentEtag) {
    return { ok: false, code: "conflict", message: "stale ETag; retry with diff" };
  }
  return { ok: true };
}

/** Ensure absolute path never appears in app-visible JSON. */
export function scrubAbsolutePaths(payload: unknown): unknown {
  if (payload == null) return payload;
  if (typeof payload === "string") {
    if (payload.startsWith("/") && payload.includes("/")) {
      return "[redacted-path]";
    }
    return payload;
  }
  if (Array.isArray(payload)) return payload.map(scrubAbsolutePaths);
  if (typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (k === "path" || k === "absolutePath" || k === "filePath") continue;
      out[k] = scrubAbsolutePaths(v);
    }
    return out;
  }
  return payload;
}
