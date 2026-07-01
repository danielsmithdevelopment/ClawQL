export type ArgsTemplateContext = {
  document_path?: string;
  processed_path?: string;
};

function envOrEmpty(key: string): string {
  return process.env[key]?.trim() ?? "";
}

/** Resolve `${NEXTCLOUD_USERNAME}`, `${document_path}`, etc. in args templates. */
export function resolveArgsTemplate(
  value: unknown,
  ctx: ArgsTemplateContext
): unknown {
  if (typeof value === "string") {
    const docPath = ctx.document_path?.trim() || "IDP/inbox/document.pdf";
    const processed =
      ctx.processed_path?.trim() ||
      docPath.replace(/\/inbox\//i, "/processed/").replace(/^inbox\//i, "processed/");
    return value
      .replace(/\$\{NEXTCLOUD_USERNAME\}/g, envOrEmpty("NEXTCLOUD_USERNAME"))
      .replace(/\$\{NEXTCLOUD_APP_PASSWORD\}/g, envOrEmpty("NEXTCLOUD_APP_PASSWORD"))
      .replace(/\$\{document_path\}/g, docPath)
      .replace(/\$\{source_path\}/g, docPath)
      .replace(/\$\{processed_path\}/g, processed);
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
