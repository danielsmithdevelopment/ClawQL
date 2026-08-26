import { StagnationPattern } from "./stagnation.js";

export type OuroborosPersona = {
  readonly name: string;
  readonly reframingPrompt: string;
};

export const PERSONAS: Record<StagnationPattern, OuroborosPersona> = {
  [StagnationPattern.NONE]: {
    name: "steady",
    reframingPrompt: "",
  },
  [StagnationPattern.STAGNATION]: {
    name: "wonder-architect",
    reframingPrompt:
      "You appear stuck repeating the same plan. Step back: list three alternative hypotheses, pick the most testable, and change one constraint before acting again.",
  },
  [StagnationPattern.SPINNING]: {
    name: "wonder-debugger",
    reframingPrompt:
      "Your last actions produced identical outputs. Inspect inputs and tool args; try a different tool or narrower scope instead of repeating the same call.",
  },
  [StagnationPattern.DIMINISHING_RETURNS]: {
    name: "wonder-evaluator",
    reframingPrompt:
      "Scores are flat or falling. Pause execution and write an explicit evaluation rubric; only continue if the next step improves a measurable criterion.",
  },
  [StagnationPattern.OSCILLATION]: {
    name: "wonder-mediator",
    reframingPrompt:
      "You are oscillating between two approaches. Name the tradeoff, pick one path for two turns, and defer the other until evidence arrives.",
  },
};

export const personaForPattern = (pattern: StagnationPattern): OuroborosPersona =>
  PERSONAS[pattern] ?? PERSONAS[StagnationPattern.NONE];
