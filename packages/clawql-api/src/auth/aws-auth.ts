/**
 * AWS bundled-provider helpers: spec label detection, region/credentials, base URL, request normalization.
 *
 * OpenAPI specs come from APIs.guru (aws2openapi). Execute uses SigV4 signing — not Bearer headers.
 */

import type { OpenAPIDoc } from "../spec/spec-loader.js";

const AWS_SPEC_LABEL_RE = /^[a-z0-9][a-z0-9-]*-\d{4}-\d{2}-\d{2}$/;

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

function tryParseHost(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const withProto = url.includes("://") ? url : `https://${url}`;
    return new URL(withProto.replace(/\{[^}]+\}/g, "us-east-1")).hostname;
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
  const urls = servers
    .map((s) => (typeof s?.url === "string" ? s.url : ""))
    .filter(Boolean);

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
