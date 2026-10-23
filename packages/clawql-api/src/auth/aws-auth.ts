/** Re-export AWS auth helpers from the thin clawql-auth/provider surface. */
export {
  AwsAuthError,
  isAwsSpecLabelEffect,
  resolveAwsCredentialsEffect,
  resolveAwsRegionEffect,
  resolveAwsServiceNameEffect,
  resolveAwsApiBaseUrlEffect,
  applyAwsQueryActionPathEffect,
  awsSigningHostEffect,
  AwsAuthHelpers,
  AwsAuthHelpersLive,
  type AwsCredentials,
} from "clawql-auth/provider";
