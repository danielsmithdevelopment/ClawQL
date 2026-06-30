export {
  configureAutomationPluginDeps,
  resetAutomationPluginDepsForTests,
  type AutomationPluginDeps,
} from "./deps.js";
export {
  AUTOMATION_PLUGIN_ID,
  createAutomationPlugin,
  handleNotifyToolInput,
  handleScheduleToolInput,
  notifyToolSchema,
  SLACK_NOTIFY_OPERATION_ID,
  type CreateAutomationPluginOptions,
} from "./automation-plugin.js";
