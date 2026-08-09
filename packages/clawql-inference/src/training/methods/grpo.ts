export const methodId = "grpo" as const;

export function describeGrpoMethod(): string {
  return "GRPO — group-relative policy optimization with verifiable rewards (Harvey rubric / matters_found).";
}

export type GrpoTrainerOptions = {
  numRollouts: number;
  rolloutServer: string;
  rolloutModel: string;
  rewardFunctionIds: string[];
};
