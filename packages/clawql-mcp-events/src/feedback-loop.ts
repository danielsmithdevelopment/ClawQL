import { Effect } from "effect";

export type FeedbackFingerprint = {
  subscriptionId: string;
  eventName: string;
  /** Hash or id of a resulting action (tool call). */
  actionId?: string;
  at: number;
};

/**
 * Detect event → action → event cycles within a sliding window.
 * Returns true when a repeating cycle is likely (same sub+event within window after an action).
 */
export class FeedbackLoopDetector {
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly entries: FeedbackFingerprint[] = [];

  constructor(opts?: { windowMs?: number; maxEntries?: number }) {
    this.windowMs = opts?.windowMs ?? 60_000;
    this.maxEntries = opts?.maxEntries ?? 500;
  }

  record(fp: FeedbackFingerprint): Effect.Effect<void> {
    return Effect.sync(() => {
      const now = fp.at;
      this.entries.push(fp);
      while (this.entries.length > this.maxEntries) this.entries.shift();
      while (this.entries.length && now - this.entries[0]!.at > this.windowMs) {
        this.entries.shift();
      }
    });
  }

  /**
   * True when the same subscription+event appears ≥ threshold times in the window
   * and at least one action fingerprint was recorded between deliveries.
   */
  wouldLoop(subscriptionId: string, eventName: string, threshold = 3): Effect.Effect<boolean> {
    return Effect.sync(() => {
      const now = Date.now();
      const recent = this.entries.filter(
        (e) =>
          now - e.at <= this.windowMs &&
          e.subscriptionId === subscriptionId &&
          e.eventName === eventName
      );
      if (recent.length < threshold) return false;
      const hasAction = recent.some((e) => e.actionId != null && e.actionId.length > 0);
      return hasAction;
    });
  }
}

export const defaultFeedbackLoopDetector = new FeedbackLoopDetector();
