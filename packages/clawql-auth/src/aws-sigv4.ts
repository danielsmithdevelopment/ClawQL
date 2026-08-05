/**
 * AWS Signature Version 4 for REST execute (bundled AWS OpenAPI providers).
 */

import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { Context, Data, Effect, Layer } from "effect";
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

/** Typed failure for SigV4 signing (Effect failure channel). */
export class AwsSigV4Error extends Data.TaggedError("AwsSigV4Error")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * When credentials are configured, yields a copy of `init` with SigV4 headers applied.
 * Yields `undefined` when label is not AWS or credentials are missing (caller may proceed unsigned).
 * The only IO edge — `signer.sign` — runs inside the Effect.
 */
export function maybeSignAwsRequestEffect(
  url: URL,
  pathTemplate: string,
  init: AwsSignableRequestInit,
  openapi: OpenAPIDoc,
  specLabel?: string
): Effect.Effect<AwsSignableRequestInit | undefined, AwsSigV4Error> {
  const label = specLabel?.trim().toLowerCase();
  const effective = label || process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  if (!effective || !isAwsSpecLabel(effective)) return Effect.succeed(undefined);

  const credentials = resolveAwsCredentials();
  if (!credentials) return Effect.succeed(undefined);

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

  return Effect.tryPromise({
    try: () => signer.sign(request),
    catch: (cause) =>
      new AwsSigV4Error({
        reason: cause instanceof Error ? cause.message : "AWS SigV4 signing failed",
        cause,
      }),
  }).pipe(
    Effect.map((signed) => {
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
      } satisfies AwsSignableRequestInit;
    })
  );
}

/**
 * Promise façade over {@link maybeSignAwsRequestEffect} for forced edges
 * (execute path bridges) that consume a Promise.
 */
export async function maybeSignAwsRequest(
  url: URL,
  pathTemplate: string,
  init: AwsSignableRequestInit,
  openapi: OpenAPIDoc,
  specLabel?: string
): Promise<AwsSignableRequestInit | undefined> {
  return Effect.runPromise(maybeSignAwsRequestEffect(url, pathTemplate, init, openapi, specLabel));
}

export class AwsSigV4Service extends Context.Tag("clawql/AwsSigV4Service")<
  AwsSigV4Service,
  {
    readonly maybeSign: (
      url: URL,
      pathTemplate: string,
      init: AwsSignableRequestInit,
      openapi: OpenAPIDoc,
      specLabel?: string
    ) => Effect.Effect<AwsSignableRequestInit | undefined, AwsSigV4Error>;
  }
>() {}

/** Live SigV4 service backed by `process.env` AWS credentials/region. */
export const AwsSigV4ServiceLive = Layer.succeed(
  AwsSigV4Service,
  AwsSigV4Service.of({
    maybeSign: (url, pathTemplate, init, openapi, specLabel) =>
      maybeSignAwsRequestEffect(url, pathTemplate, init, openapi, specLabel),
  })
);

/** Sync URL normalization for non-signing path (Action query param). */
export function normalizeAwsExecuteUrl(url: URL, pathTemplate: string, specLabel?: string): void {
  const label = specLabel?.trim().toLowerCase();
  const effective = label || process.env.CLAWQL_PROVIDER?.trim().toLowerCase();
  if (!effective || !isAwsSpecLabel(effective)) return;
  applyAwsQueryActionPath(url, pathTemplate);
}
