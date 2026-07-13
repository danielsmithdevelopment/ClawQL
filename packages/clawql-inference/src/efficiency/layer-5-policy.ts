import type { CacheIntent } from "./types.js";

const WRITE_VERBS =
  /\b(DELETE|PUT|PATCH|POST)\b|(?:\bdelete\b|\bupdate\b|\bcreate\b|\binsert\b|\bremove\b|\bwrite\b|\bmutate\b)/i;

const RESOURCE_RE =
  /\b(?:issue|ticket|pr|pull|cluster|deployment|service|record|resource|user|project)[-_ ]?(?:id|#)?\s*[:=]?\s*([A-Za-z0-9._/-]{2,64})/gi;

/** Infer read vs write intent for semantic cache safety (Layer 5). */
export function resolveCacheIntent(input: {
  cacheIntent?: CacheIntent;
  messages: Array<{ content: string }>;
}): "read" | "write" {
  if (input.cacheIntent === "read") return "read";
  if (input.cacheIntent === "write") return "write";

  const text = input.messages.map((message) => message.content).join("\n");
  if (WRITE_VERBS.test(text)) return "write";
  return "read";
}

/** Extract coarse resource tags for cache invalidation on writes. */
export function extractResourceTags(messages: Array<{ content: string }>): string[] {
  const text = messages.map((message) => message.content).join("\n");
  const tags = new Set<string>();
  for (const match of text.matchAll(RESOURCE_RE)) {
    const tag = match[0]?.trim().toLowerCase();
    if (tag) tags.add(tag);
  }
  return [...tags];
}

export function shouldInvalidateEntry(entryTags: string[] | undefined, writeTags: string[]): boolean {
  if (!writeTags.length || !entryTags?.length) return false;
  const writeSet = new Set(writeTags);
  return entryTags.some((tag) => writeSet.has(tag));
}
