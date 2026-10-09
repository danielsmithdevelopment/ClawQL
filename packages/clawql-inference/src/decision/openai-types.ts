/**
 * OpenAI Decisions API (public beta) wire shapes for POST /v1/decisions.
 * @see https://developers.openai.com/api/docs/guides/decisions
 */

export type OpenAiDecisionInputText = {
  readonly type: "input_text";
  readonly text: string;
};

export type OpenAiDecisionInputImage = {
  readonly type: "input_image";
  readonly image_url: string;
};

export type OpenAiDecisionInputPart = OpenAiDecisionInputText | OpenAiDecisionInputImage;

export type OpenAiDecisionInputMessage = {
  readonly role: "user";
  readonly content: string | readonly OpenAiDecisionInputPart[];
};

/** String or user messages (text + optional inline base64 images). */
export type OpenAiDecisionInput = string | readonly OpenAiDecisionInputMessage[];

export type OpenAiDecisionChoiceOption = {
  readonly value: string;
  readonly description?: string;
};

export type OpenAiDecisionScoreLevel = {
  readonly label: string;
  readonly description?: string;
};

export type OpenAiDecisionQuestion =
  | {
      readonly type: "predicate";
      readonly name: string;
      readonly instructions: string;
    }
  | {
      readonly type: "choice";
      readonly name: string;
      readonly instructions?: string;
      readonly choices: readonly OpenAiDecisionChoiceOption[];
    }
  | {
      readonly type: "score";
      readonly name: string;
      readonly instructions?: string;
      readonly levels: readonly OpenAiDecisionScoreLevel[];
    };

export type OpenAiDecisionCreateRequest = {
  readonly model: string;
  readonly input: OpenAiDecisionInput;
  readonly questions: readonly OpenAiDecisionQuestion[];
  /** ClawQL extension — decision site id for trust / calibration. */
  readonly use_site_id?: string;
  readonly useSiteId?: string;
  /** ClawQL extension — abstain vs escalate when local model is unsure. */
  readonly escalation?: {
    readonly mode?: "abstain" | "escalate";
    readonly model?: string;
  };
  readonly session_id?: string;
  readonly agent_id?: string;
};

export type OpenAiDecisionAnswerPredicate = {
  readonly type: "predicate";
  readonly name: string;
  readonly probability: number;
};

export type OpenAiDecisionAnswerChoice = {
  readonly type: "choice";
  readonly name: string;
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Array<{ value: string; probability: number }>;
};

export type OpenAiDecisionAnswerScore = {
  readonly type: "score";
  readonly name: string;
  readonly score: number;
  readonly confidence: number;
  readonly probabilities: Array<{ value: string; probability: number }>;
};

export type OpenAiDecisionAnswerRefusal = {
  readonly type: "refusal";
  readonly name: string;
  readonly refusal: string;
};

export type OpenAiDecisionAnswer =
  | OpenAiDecisionAnswerPredicate
  | OpenAiDecisionAnswerChoice
  | OpenAiDecisionAnswerScore
  | OpenAiDecisionAnswerRefusal;

export type OpenAiDecisionCreateResponse = {
  readonly id: string;
  readonly object: "decision";
  readonly model: string;
  readonly created: number;
  readonly answers: readonly OpenAiDecisionAnswer[];
  /** ClawQL extensions */
  readonly calibrated: boolean;
  readonly escalated: boolean;
  readonly use_site_id: string;
  readonly backend_id: string;
  readonly trace_id: string;
  readonly clawql?: {
    readonly object: "clawql.decision";
    readonly escalation_model?: string;
  };
};
