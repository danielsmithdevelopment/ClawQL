/**
 * `clawql resume <executionId>` — approve (or decline) a parked mandate execute.
 */

import { resumeClawqlExecution } from "clawql-api";

export async function runResume(options: {
  executionId?: string;
  decline?: boolean;
  home?: string;
}): Promise<number> {
  const executionId = options.executionId?.trim();
  if (!executionId) {
    console.error("Usage: clawql resume <executionId> | clawql resume --decline <executionId>");
    return 1;
  }

  if (options.home) {
    process.env.CLAWQL_HOME = options.home;
  }

  try {
    const content = await resumeClawqlExecution({
      executionId,
      decision: options.decline ? "decline" : "approve",
    });
    const text = content[0]?.text ?? "";
    console.log(text);
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; status?: string; error?: string };
      if (
        parsed.ok === false ||
        parsed.status === "blocked" ||
        parsed.status === "mandate_required"
      ) {
        return 1;
      }
      if (typeof parsed.error === "string" && parsed.ok !== true && parsed.status !== "declined") {
        return 1;
      }
    } catch {
      /* print raw */
    }
    return 0;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}
