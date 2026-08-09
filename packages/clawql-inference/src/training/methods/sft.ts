/** SFT via Unsloth/TRL — trainer wiring staged. */
export const methodId = "sft" as const;

export type SftTrainerOptions = {
  datasetPath: string;
  outputPath: string;
  baseModel: string;
};

export function describeSftMethod(): string {
  return "Supervised fine-tuning on (prompt, response) pairs via next-token prediction.";
}
