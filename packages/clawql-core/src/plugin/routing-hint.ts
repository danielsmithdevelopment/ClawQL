/**
 * Optional Fast Decision / routing hints on tools and skills
 * (parameterNotes pattern — additive; see capability-ontology-from-catalog-v0.1).
 */

export type DistinguishFromEntry = {
  /** Peer tool id, skill id, or anti-pattern id. */
  readonly peerId: string;
  /** One-line reason this entry must not be confused with that peer. */
  readonly reason: string;
};

/** Optional Fast Decision / routing hints (additive; existing plugins valid). */
export type ToolRoutingHint = {
  /** When this tool is the right Fast Decision / agent choice. */
  readonly whenToUse?: string;
  /** When this tool must not win (anti-pattern or wrong framing). */
  readonly whenNotToUse?: string;
  /**
   * Sibling disambiguation: named peers this entry must not be confused with.
   * One line per peer — lives with the plugin author, not the eval author.
   */
  readonly distinguishFrom?: ReadonlyArray<DistinguishFromEntry>;
};
