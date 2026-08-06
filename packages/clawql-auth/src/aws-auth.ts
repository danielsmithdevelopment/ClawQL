/**
 * AWS bundled-provider helpers: spec label detection, region/credentials, base URL, request normalization.
 *
 * OpenAPI specs come from APIs.guru (aws2openapi). Execute uses SigV4 signing — not Bearer headers.
 *
 * Effect is the only public surface via the `*Effect` wrappers and {@link AwsAuthHelpers} service.
 * The plain sync functions are module-internal implementation detail (used by the Effect wrappers
 * and the SigV4 signer) and are not re-exported from the package entry.
 */

import { Context, Data, Effect, Layer } from "effect";

import type { OpenAPIDoc } from "./openapi-types.js";

const AWS_SPEC_LABEL_RE = /^[a-z0-9][a-z0-9-]*-\d{4}-\d{2}-\d{2}$/;

/** Typed failure for AWS helper resolution (Effect failure channel). */
export class AwsAuthError extends Data.TaggedError("AwsAuthError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** True for merged preset `aws` or bundled manifest slugs (e.g. `ec2-2016-11-15`). */
export function isAwsSpecLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  if (s === "aws") return true;
  return AWS_SPEC_LABEL_RE.test(s);
}

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/** Returns credentials when both access key id and secret are set. */
export function resolveAwsCredentials(): AwsCredentials | undefined {
  const accessKeyId = trimEnv("CLAWQL_AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = trimEnv("CLAWQL_AWS_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return undefined;
  const sessionToken = trimEnv("CLAWQL_AWS_SESSION_TOKEN", "AWS_SESSION_TOKEN");
  return { accessKeyId, secretAccessKey, sessionToken };
}

export function resolveAwsRegion(): string {
  return trimEnv("CLAWQL_AWS_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") ?? "us-east-1";
}

/** Service id from bundled slug (`ec2-2016-11-15` → `ec2`) or OpenAPI `info.x-serviceName`. */
export function resolveAwsServiceName(specLabel: string | undefined, openapi: OpenAPIDoc): string {
  const fromInfo = (openapi.info as { "x-serviceName"?: string } | undefined)?.["x-serviceName"];
  if (typeof fromInfo === "string" && fromInfo.trim()) {
    return fromInfo.trim().toLowerCase();
  }
  const label = specLabel?.trim().toLowerCase();
  if (label && label !== "aws") {
    const service = label.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    if (service) return service;
  }
  const serverHost = tryParseHost(openapi.servers?.[0]?.url);
  if (serverHost) {
    const fromHost = serverHost.split(".")[0];
    if (fromHost && fromHost !== "amazonaws") return fromHost;
  }
  return "aws";
}

function substituteUrlTemplatePlaceholders(template: string, placeholderValue: string): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = template.indexOf("}", open + 1);
    if (close === -1) {
      out += template.slice(open);
      break;
    }
    out += placeholderValue;
    i = close + 1;
  }
  return out;
}

function tryParseHost(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const withProto = url.includes("://") ? url : `https://${url}`;
    return new URL(substituteUrlTemplatePlaceholders(withProto, "us-east-1")).hostname;
  } catch {
    return undefined;
  }
}

function substituteServerVariables(template: string, region: string): string {
  return template.replace(/\{region\}/gi, region);
}

/**
 * Pick an HTTPS server URL and substitute `{region}` from env.
 * Prefers regional endpoints when the template contains `{region}`.
 */
export function resolveAwsApiBaseUrl(openapi: OpenAPIDoc): string {
  const region = resolveAwsRegion();
  const servers = openapi.servers ?? [];
  const urls = servers.map((s) => (typeof s?.url === "string" ? s.url : "")).filter(Boolean);

  const preferred =
    urls.find((u) => u.startsWith("https://") && u.includes("{region}")) ??
    urls.find((u) => u.startsWith("https://")) ??
    urls.find((u) => u.includes("{region}")) ??
    urls[0];

  if (!preferred) {
    throw new Error("AWS OpenAPI spec has no servers[].url");
  }

  let resolved = substituteServerVariables(preferred, region);
  if (resolved.startsWith("http://")) {
    resolved = `https://${resolved.slice("http://".length)}`;
  }
  return resolved.replace(/\/$/, "");
}

/**
 * AWS query-protocol paths use `/#Action=OperationName`. Move Action into the query string.
 */
export function applyAwsQueryActionPath(url: URL, pathTemplate: string): void {
  const match = pathTemplate.match(/#Action=([^/?#&]+)/);
  if (!match) return;
  if (!url.searchParams.has("Action")) {
    url.searchParams.set("Action", match[1]);
  }
  url.pathname = "/";
  url.hash = "";
}

/** Hostname for SigV4 signing (without port). */
export function awsSigningHost(url: URL): string {
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

/** Effect: true for merged preset `aws` or bundled manifest slugs. */
export const isAwsSpecLabelEffect = (label: string): Effect.Effect<boolean> =>
  Effect.sync(() => isAwsSpecLabel(label));

/** Effect: resolve AWS credentials from env (undefined when unset). */
export const resolveAwsCredentialsEffect = (): Effect.Effect<AwsCredentials | undefined> =>
  Effect.sync(() => resolveAwsCredentials());

/** Effect: resolve AWS region from env (defaults to us-east-1). */
export const resolveAwsRegionEffect = (): Effect.Effect<string> =>
  Effect.sync(() => resolveAwsRegion());

/** Effect: resolve the AWS service id for signing. */
export const resolveAwsServiceNameEffect = (
  specLabel: string | undefined,
  openapi: OpenAPIDoc
): Effect.Effect<string> => Effect.sync(() => resolveAwsServiceName(specLabel, openapi));

/** Effect: resolve an HTTPS base URL; fails with {@link AwsAuthError} when no server URL exists. */
export const resolveAwsApiBaseUrlEffect = (
  openapi: OpenAPIDoc
): Effect.Effect<string, AwsAuthError> =>
  Effect.try({
    try: () => resolveAwsApiBaseUrl(openapi),
    catch: (cause) =>
      new AwsAuthError({
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

/** Effect: move AWS query-protocol `#Action=` into the URL query string (mutates `url`). */
export const applyAwsQueryActionPathEffect = (
  url: URL,
  pathTemplate: string
): Effect.Effect<void> => Effect.sync(() => applyAwsQueryActionPath(url, pathTemplate));

/** Effect: hostname for SigV4 signing (without port). */
export const awsSigningHostEffect = (url: URL): Effect.Effect<string> =>
  Effect.sync(() => awsSigningHost(url));

/** Effect service exposing AWS bundled-provider helpers for DI in execute hosts. */
export class AwsAuthHelpers extends Context.Tag("clawql/AwsAuthHelpers")<
  AwsAuthHelpers,
  {
    readonly isAwsSpecLabel: (label: string) => Effect.Effect<boolean>;
    readonly resolveCredentials: () => Effect.Effect<AwsCredentials | undefined>;
    readonly resolveRegion: () => Effect.Effect<string>;
    readonly resolveServiceName: (
      specLabel: string | undefined,
      openapi: OpenAPIDoc
    ) => Effect.Effect<string>;
    readonly resolveApiBaseUrl: (openapi: OpenAPIDoc) => Effect.Effect<string, AwsAuthError>;
    readonly applyQueryActionPath: (url: URL, pathTemplate: string) => Effect.Effect<void>;
    readonly signingHost: (url: URL) => Effect.Effect<string>;
  }
>() {}

/** Live AWS helpers service backed by `process.env`. */
export const AwsAuthHelpersLive = Layer.succeed(
  AwsAuthHelpers,
  AwsAuthHelpers.of({
    isAwsSpecLabel: isAwsSpecLabelEffect,
    resolveCredentials: resolveAwsCredentialsEffect,
    resolveRegion: resolveAwsRegionEffect,
    resolveServiceName: resolveAwsServiceNameEffect,
    resolveApiBaseUrl: resolveAwsApiBaseUrlEffect,
    applyQueryActionPath: applyAwsQueryActionPathEffect,
    signingHost: awsSigningHostEffect,
  })
);
