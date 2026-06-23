/**
 * MCP `schedule` tool — transport handler; core logic in `clawql-automation/schedule/schedule`.
 */

export {
  getScheduleDatabasePath,
  getScheduleHistoryLimit,
  registerScheduleWorkerShutdownHooks,
  resetScheduleSqlJsForTests,
  runScheduleWorkerTick,
  scheduleToolSchema,
  startScheduleWorker,
  stopScheduleWorker,
  __scheduleTestUtils,
} from "clawql-automation/schedule/schedule";

import { handleScheduleToolInput as runScheduleTool } from "clawql-automation/schedule/schedule";
import { logMcpToolShape } from "./mcp-tool-log.js";

export async function handleScheduleToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const p = params as {
    operation?: string;
    job_id?: string;
    include_runs?: boolean;
    dry_run?: boolean;
  };
  logMcpToolShape("schedule", {
    operation: p.operation,
    jobIdLen: p.job_id?.length,
    includeRuns: p.include_runs,
    dryRun: p.dry_run,
  });
  return runScheduleTool(params);
}
