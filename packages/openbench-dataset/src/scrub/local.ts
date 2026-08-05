import { createHash } from "node:crypto";

export const LOCAL_REDACTION_POLICY_ID = "openbench-local-v1";

const PATTERNS: Array<{ name: string; re: RegExp; repl: string }> = [
  { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/g, repl: "[REDACTED_AWS_KEY]" },
  { name: "openai_key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, repl: "[REDACTED_API_KEY]" },
  { name: "openrouter_key", re: /\bsk-or-[A-Za-z0-9_-]{20,}\b/g, repl: "[REDACTED_API_KEY]" },
  { name: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, repl: "[REDACTED_SLACK_TOKEN]" },
  { name: "github_pat", re: /\bghp_[A-Za-z0-9]{20,}\b/g, repl: "[REDACTED_GITHUB_PAT]" },
  {
    name: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    repl: "[REDACTED_EMAIL]",
  },
];

export function redactionPolicyHash(): string {
  const blob = LOCAL_REDACTION_POLICY_ID + "|" + PATTERNS.map((p) => p.name).join("|");
  return createHash("sha256").update(blob).digest("hex").slice(0, 32);
}

export function scrubTextLocal(text: string, fields: Set<string>): string {
  let out = text;
  for (const { name, re, repl } of PATTERNS) {
    const next = out.replace(re, repl);
    if (next !== out) fields.add(name);
    out = next;
  }
  return out;
}

export function scrubJsonValue(value: unknown, fields: Set<string> = new Set()): unknown {
  if (typeof value === "string") return scrubTextLocal(value, fields);
  if (Array.isArray(value)) return value.map((v) => scrubJsonValue(v, fields));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubJsonValue(v, fields);
    }
    return out;
  }
  return value;
}
