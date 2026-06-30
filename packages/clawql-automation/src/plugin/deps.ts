import type { NotifyExecuteFn } from "../notify/notify.js";
import { configureNotifyDeps } from "../notify/notify.js";

export type AutomationPluginDeps = {
  execute: NotifyExecuteFn;
};

export function configureAutomationPluginDeps(deps: AutomationPluginDeps): void {
  configureNotifyDeps(deps);
}

/** @internal Test helper */
export function resetAutomationPluginDepsForTests(): void {
  configureNotifyDeps({ execute: async () => ({ content: [{ type: "text", text: "{}" }] }) });
}
