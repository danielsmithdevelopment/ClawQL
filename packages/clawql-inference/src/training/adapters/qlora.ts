export type QLoRAConfig = {
  rank: number;
  alpha: number;
  targetModules: string[];
  loadIn4bit: true;
  quantType: "nf4";
};

export function defaultQLoRAConfig(overrides?: Partial<QLoRAConfig>): QLoRAConfig {
  return {
    rank: overrides?.rank ?? 16,
    alpha: overrides?.alpha ?? 32,
    targetModules: overrides?.targetModules ?? ["q_proj", "v_proj"],
    loadIn4bit: true,
    quantType: "nf4",
  };
}
