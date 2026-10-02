import type { McpUiTemplate } from "./types.js";

/**
 * One-off product templates. Loaded for matching tools, not listed as starters.
 */
export const EXAMPLE_TEMPLATES: Record<string, McpUiTemplate> = {
  list_ranked_meals: {
    id: "list_ranked_meals",
    kind: "example",
    primary: ["date", "min_rating", "min_calories", "limit"],
    hints: {
      date: "CookUnity delivery date (YYYY-MM-DD). Defaults to your next editable delivery.",
      limit: "Max cards per protein group (1–100).",
    },
    resultKind: "json",
  },
};
