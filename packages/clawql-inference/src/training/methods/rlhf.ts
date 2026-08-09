export const methodId = "rlhf" as const;

export function describeRlhfMethod(): string {
  return "RLHF — reward model + PPO; prefer DPO/GRPO when Harvey rubric scores are available.";
}
