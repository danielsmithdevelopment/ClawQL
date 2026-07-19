export {
  isRampAgenticEnabled,
  isRampConfigured,
  isRampDryRun,
  isRampEnabled,
  rampAgenticCredsPath,
  rampAgenticIssuePath,
  rampAgenticReadPath,
  rampApiBase,
  rampClientId,
  rampClientSecret,
  rampEnvironment,
  rampOAuthScopes,
  rampVaultApiBase,
} from "./config.js";
export {
  RampError,
  RampService,
  rampLiveLayer,
  type RampCardIssuancePath,
  type RampCardResult,
  type RampFundResult,
} from "./ramp-service.js";
