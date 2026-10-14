import { Effect } from "effect";

import {
  SETTINGS_NETWORK,
  SETTINGS_ORG,
  SETTINGS_PRIVACY,
} from "@/lib/managed/fixtures-ops";

export const getManagedSettingsEffect = (): Effect.Effect<{
  readonly org: typeof SETTINGS_ORG;
  readonly webhookHosts: typeof SETTINGS_NETWORK.webhookHosts;
  readonly egressDomains: typeof SETTINGS_NETWORK.egressDomains;
  readonly retention: typeof SETTINGS_PRIVACY.retention;
  readonly source: "fixture";
}> =>
  Effect.succeed({
    org: SETTINGS_ORG,
    webhookHosts: SETTINGS_NETWORK.webhookHosts,
    egressDomains: SETTINGS_NETWORK.egressDomains,
    retention: SETTINGS_PRIVACY.retention,
    source: "fixture",
  });
