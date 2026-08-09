export type FullFinetuneConfig = {
  mode: "full";
  /** Full weight updates — high VRAM; not the default path. */
  warning: string;
};

export function defaultFullFinetuneConfig(): FullFinetuneConfig {
  return {
    mode: "full",
    warning: "Full fine-tune requires multi-GPU class hardware; prefer QLoRA on single GPU.",
  };
}
