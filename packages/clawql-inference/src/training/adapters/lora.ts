export type LoRAConfig = {
  rank: number;
  alpha: number;
  targetModules: string[];
  loadIn4bit: false;
};

/** Multi-GPU LoRA without quantization. */
export function defaultLoRAConfig(overrides?: Partial<LoRAConfig>): LoRAConfig {
  return {
    rank: overrides?.rank ?? 16,
    alpha: overrides?.alpha ?? 32,
    targetModules: overrides?.targetModules ?? ["q_proj", "v_proj"],
    loadIn4bit: false,
  };
}
