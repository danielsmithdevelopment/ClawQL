/**
 * AWS Signature Version 4 for REST execute (bundled AWS OpenAPI providers).
 */

import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import {
  applyAwsQueryActionPath,
  awsSigningHost,
  isAwsSpecLabel,
  resolveAwsCredentials,
  resolveAwsRegion,
  resolveAwsServiceName,
} from "./aws-auth.js";
import type { OpenAPIDoc } from "./openapi-types.js";

export { isAwsSpecLabel, resolveAwsCredentials, resolveAwsRegion, resolveAwsServiceName };

export interface AwsSignableRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer | Uint8Array;
}

/**
 * When credentials are configured, returns a copy of `init` with SigV4 headers applied.
 * Returns `undefined` when label is not AWS or credentials are missing (caller may proceed unsigned).
 */
export async function maybeSignAwsRequest(
  url: URL,
  pathTemplate: string,
  init: AwsSignableRequestInit,
  openapi: OpenAPIDoc,
  specLabel?: string
): Promise<AwsSignableRequestInit | undefined> {
  const label = specLabel?.trim().toLowerCase();
  const effective = label || process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  if (!effective || !isAwsSpecLabel(effective)) return undefined;

  const credentials = resolveAwsCredentials();
  if (!credentials) return undefined;

  const signUrl = new URL(url.toString());
  applyAwsQueryActionPath(signUrl, pathTemplate);

  const region = resolveAwsRegion();
  const service = resolveAwsServiceName(label, openapi);

  const body =
    init.body === undefined
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : Buffer.from(init.body);

  const headerEntries: Record<string, string> = { ...init.headers };
  if (body !== undefined && body.length > 0 && !headerEntries["Content-Type"]) {
    headerEntries["Content-Type"] = "application/x-amz-json-1.1";
  }

  const request = new HttpRequest({
    protocol: signUrl.protocol,
    hostname: signUrl.hostname,
    port: signUrl.port ? Number(signUrl.port) : undefined,
    method: init.method.toUpperCase(),
    path: `${signUrl.pathname}${signUrl.search}`,
    headers: {
      host: awsSigningHost(signUrl),
      ...headerEntries,
    },
    body,
  });

  const signer = new SignatureV4({
    credentials,
    region,
    service,
    sha256: Sha256,
  });

  const signed = await signer.sign(request);
  const outHeaders: Record<string, string> = { ...init.headers };
  for (const [k, v] of Object.entries(signed.headers ?? {})) {
    if (typeof v === "string") outHeaders[k] = v;
    else if (Array.isArray(v)) outHeaders[k] = (v as string[]).join(", ");
  }
  outHeaders.host = awsSigningHost(signUrl);

  return {
    method: init.method,
    headers: outHeaders,
    body: init.body,
  };
}

/** Sync URL normalization for non-signing path (Action query param). */
export function normalizeAwsExecuteUrl(url: URL, pathTemplate: string, specLabel?: string): void {
  const label = specLabel?.trim().toLowerCase();
  const effective = label || process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  if (!effective || !isAwsSpecLabel(effective)) return;
  applyAwsQueryActionPath(url, pathTemplate);
}
