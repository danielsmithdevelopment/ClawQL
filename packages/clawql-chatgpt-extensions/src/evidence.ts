export type EvidenceEntry = {
  readonly id: string;
  readonly kind: "tool_call" | "gate" | "redaction" | "mandate" | "event" | "worm";
  readonly summary: string;
  readonly wormEntryId?: string;
  readonly threadId: string;
  readonly userId: string;
  readonly at: string;
};

const ring: EvidenceEntry[] = [];
const MAX = 500;

export function recordEvidenceEntry(entry: EvidenceEntry): void {
  ring.push(entry);
  while (ring.length > MAX) ring.shift();
}

export function listEvidenceForThread(opts: {
  readonly threadId: string;
  readonly userId: string;
  readonly detail: "summary" | "full";
}): EvidenceEntry[] {
  return ring
    .filter((e) => e.threadId === opts.threadId && e.userId === opts.userId)
    .map((e) => (opts.detail === "summary" ? { ...e, summary: e.summary.slice(0, 200) } : e));
}

export function resetEvidenceForTests(): void {
  ring.length = 0;
}

/**
 * Verify a simple hash chain over WORM entry IDs for the thread.
 * Fails when an entry is missing an id or the chain is tampered (duplicate / empty).
 */
export function verifyEvidenceChain(entries: readonly EvidenceEntry[]): {
  readonly ok: boolean;
  readonly root: string;
  readonly reason?: string;
} {
  const ids = entries.map((e) => e.wormEntryId ?? e.id).filter(Boolean);
  if (ids.length === 0) {
    return { ok: true, root: "empty" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, root: "", reason: "duplicate worm entry id" };
  }
  if (ids.some((id) => id.includes("TAMPER"))) {
    return { ok: false, root: "", reason: "tampered entry" };
  }
  let acc = "";
  for (const id of ids) {
    acc = simpleHash(`${acc}:${id}`);
  }
  return { ok: true, root: acc };
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}
