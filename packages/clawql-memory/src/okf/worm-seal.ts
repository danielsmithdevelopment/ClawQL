/**
 * Seal vault note content into a content-addressed worm_ref (sha256:…).
 * Used when memory_ingest does not receive an explicit wormRef from the caller.
 */

import { createHash } from "node:crypto";

/** Default on. Set CLAWQL_MEMORY_WORM_SEAL=0 to leave worm_ref unset/null. */
export function wormSealEnabled(): boolean {
  const v = process.env.CLAWQL_MEMORY_WORM_SEAL?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

/**
 * Content-addressed seal: sha256 of UTF-8 body (frontmatter + markdown).
 * Returns `sha256:<hex>` suitable for OKF `worm_ref`.
 */
export function sealWormRefFromContent(content: string): string {
  const hex = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${hex}`;
}

/**
 * Resolve worm_ref for an ingest: explicit input wins; else seal content when enabled.
 */
export function resolveWormRefForIngest(input: {
  wormRef?: string | null;
  sealedContent: string;
}): string | null {
  const explicit = input.wormRef?.trim();
  if (explicit) return explicit;
  if (input.wormRef === null) return null; // caller explicitly cleared
  if (!wormSealEnabled()) return null;
  return sealWormRefFromContent(input.sealedContent);
}
