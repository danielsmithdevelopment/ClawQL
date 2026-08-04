export type ArgsTemplateContext = {
  document_path?: string;
  processed_path?: string;
  document_url?: string;
  /** Base64 PDF bytes from a prior hop (Gotenberg / Nextcloud / Stirling). */
  pdf_base64?: string;
  /** Stirling listOfText (comma-separated patterns). */
  redact_list?: string;
};

function envOrEmpty(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function defaultDocumentUrl(ctx: ArgsTemplateContext): string {
  const explicit = ctx.document_url?.trim() || envOrEmpty("IDP_DOCUMENT_URL");
  if (explicit) return explicit;
  const base = envOrEmpty("NEXTCLOUD_BASE_URL").replace(/\/$/, "");
  const user = envOrEmpty("NEXTCLOUD_USERNAME");
  const docPath = ctx.document_path?.trim() || "IDP/inbox/document.pdf";
  if (base && user) {
    return `${base}/remote.php/dav/files/${encodeURIComponent(user)}/${docPath.replace(/^\//, "")}`;
  }
  return "https://example.com/idp/inbox/document.pdf";
}

/** Resolve `${NEXTCLOUD_USERNAME}`, `${document_path}`, etc. in args templates. */
export function resolveArgsTemplate(value: unknown, ctx: ArgsTemplateContext): unknown {
  if (typeof value === "string") {
    const docPath = ctx.document_path?.trim() || "IDP/inbox/document.pdf";
    const processed =
      ctx.processed_path?.trim() ||
      docPath.replace(/\/inbox\//i, "/processed/").replace(/^inbox\//i, "processed/");
    const documentUrl = defaultDocumentUrl(ctx);
    const redactList =
      ctx.redact_list?.trim() ||
      envOrEmpty("CLAWQL_IDP_REDACT_LIST") ||
      envOrEmpty("CLAWQL_STIRLING_REDACT_LIST");
    return value
      .replace(/\$\{NEXTCLOUD_USERNAME\}/g, envOrEmpty("NEXTCLOUD_USERNAME"))
      .replace(/\$\{NEXTCLOUD_APP_PASSWORD\}/g, envOrEmpty("NEXTCLOUD_APP_PASSWORD"))
      .replace(/\$\{document_path\}/g, docPath)
      .replace(/\$\{source_path\}/g, docPath)
      .replace(/\$\{processed_path\}/g, processed)
      .replace(/\$\{document_url\}/g, documentUrl)
      .replace(/\$\{pdf_base64\}/g, ctx.pdf_base64 ?? "")
      .replace(/\$\{redact_list\}/g, redactList);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveArgsTemplate(v, ctx));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveArgsTemplate(v, ctx),
      ])
    );
  }
  return value;
}
