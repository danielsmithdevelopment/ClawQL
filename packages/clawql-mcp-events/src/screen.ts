import { Effect } from "effect";
import { timingSafeEqual } from "node:crypto";

/**
 * Screen event payloads so user-authored text is delivered as data, never instructions.
 * Strips common instruction wrappers; does not invent model directives.
 */
export function screenEventPayload(
  data: Record<string, unknown>
): Effect.Effect<Record<string, unknown>> {
  return Effect.sync(() => screenRecord(data));
}

function screenRecord(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") {
      out[k] = screenUserText(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = screenRecord(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === "string"
          ? screenUserText(item)
          : item && typeof item === "object"
            ? screenRecord(item as Record<string, unknown>)
            : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

const INSTRUCTION_PREFIX =
  /^\s*(system\s*:|assistant\s*:|ignore (all |previous )?instructions|you are now|do not follow|<\s*\/?\s*system\s*>)/i;

export function screenUserText(text: string): string {
  const trimmed = text.trimStart();
  if (INSTRUCTION_PREFIX.test(trimmed)) {
    return `[user-authored data] ${text}`;
  }
  return text;
}

export function constantTimeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Compare against self to keep timing roughly stable
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
