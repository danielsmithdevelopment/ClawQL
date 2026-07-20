/**
 * Apply ontology `pii_fields` (dotted paths) — redact string leaves for LLM exposure.
 */
import { maybePresidioRedactText, presidioEnabled } from "clawql-api";

const REDACTED = "[REDACTED]";

function getAtPath(root: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (Array.isArray(next)) {
      // Apply to each element for paths like parties.contact_email
      const rest = parts.slice(i + 1).join(".");
      for (const item of next) {
        if (item && typeof item === "object") {
          setAtPath(item as Record<string, unknown>, rest, value);
        }
      }
      return;
    }
    if (next == null || typeof next !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/**
 * Deep-clone JSON and redact listed dotted paths (supports one array segment).
 * When Presidio is enabled, string values are run through Presidio first then replaced.
 */
export async function redactOntologyPiiFields<T>(
  value: T,
  piiFields: string[] | undefined
): Promise<T> {
  if (!piiFields?.length || value == null || typeof value !== "object") {
    return value;
  }
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const path of piiFields) {
    const current = getAtPath(clone, path);
    if (typeof current === "string" && current.length > 0) {
      if (presidioEnabled()) {
        await maybePresidioRedactText(current);
      }
      setAtPath(clone, path, REDACTED);
      continue;
    }
    // Array of objects: parties.contact_email style already handled in setAtPath walk
    const parts = path.split(".");
    if (parts.length >= 2) {
      const head = parts[0]!;
      const arr = clone[head];
      if (Array.isArray(arr)) {
        const rest = parts.slice(1).join(".");
        for (const item of arr) {
          if (item && typeof item === "object") {
            const leaf = getAtPath(item, rest);
            if (typeof leaf === "string" && leaf.length > 0) {
              if (presidioEnabled()) await maybePresidioRedactText(leaf);
              setAtPath(item as Record<string, unknown>, rest, REDACTED);
            }
          }
        }
      }
    }
  }
  return clone as T;
}
