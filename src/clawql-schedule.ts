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

export { handleScheduleToolInput } from "clawql-automation/plugin";
