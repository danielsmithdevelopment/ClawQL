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
  handleWorkflowToolInput,
  handleArgocdToolInput,
  notifyToolSchema,
  SLACK_NOTIFY_OPERATION_ID,
  type CreateAutomationPluginOptions,
} from "./automation-plugin.js";
export { workflowToolSchema } from "../workflow/workflow.js";
export { argocdToolSchema } from "../argocd/argocd.js";
export { runVaultDailyDigest } from "../workflow/vault-digest/run-vault-digest.js";
