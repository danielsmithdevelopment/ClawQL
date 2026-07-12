import type { ModelTier } from "../routing/types.js";

export type FallbackChainMap = {
  byTier: Partial<Record<ModelTier, string[]>>;
  byModel: Record<string, string[]>;
};

export type FallbackConfig = {
  enabled: boolean;
  chains: FallbackChainMap;
};

export type FallbackAttempt = {
  attempted: string[];
  succeeded: string;
};
