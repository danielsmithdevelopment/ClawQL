/**
 * Virtual-key memory scope helpers (shared by enrichment + REST façade).
 */

import type { VirtualKeyContext } from "../keys/types.js";

export function resolveMemoryScope(virtualKey?: VirtualKeyContext): string | undefined {
  if (!virtualKey) return undefined;
  const raw = (virtualKey.memoryScope || virtualKey.team || "").trim().toLowerCase();
  const scope = raw.replace(/[^a-z0-9_-]+/g, "").slice(0, 64);
  return scope || undefined;
}

export function pathInMemoryScope(path: string, scope: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `Memory/${scope}/`;
  return normalized === `Memory/${scope}` || normalized.startsWith(prefix);
}
