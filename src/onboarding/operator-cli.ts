import {
  collectOperatorStatus,
  formatOperatorStatus,
  verifyTierSpecConfigMaps,
} from "clawql-operator/status";

export async function runOperatorStatus(): Promise<number> {
  const report = await collectOperatorStatus();
  console.log(formatOperatorStatus(report));
  const cmNotes = await verifyTierSpecConfigMaps(report);
  for (const line of cmNotes) console.log(line);
  if (report.error && !report.crdInstalled) return 1;
  return 0;
}
