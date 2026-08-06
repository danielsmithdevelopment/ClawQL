import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { maybeSignAwsRequestEffect } from "./aws-sigv4.js";
import type { OpenAPIDoc } from "./openapi-types.js";

const maybeSignAwsRequest = (
  url: URL,
  pathTemplate: string,
  init: { method: string; headers: Record<string, string>; body?: string | Buffer | Uint8Array },
  openapi: OpenAPIDoc,
  specLabel?: string
) => Effect.runPromise(maybeSignAwsRequestEffect(url, pathTemplate, init, openapi, specLabel));

const emptyDoc = { openapi: "3.0.0", paths: {} } as OpenAPIDoc;

describe("maybeSignAwsRequest adversarial", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    saved.AWS_ACCESS_KEY_ID = undefined;
    saved.AWS_SECRET_ACCESS_KEY = undefined;
    saved.AWS_REGION = undefined;
    saved.CLAWQL_PROVIDER = undefined;
  });

  function pinEnv(key: string, value: string | undefined): void {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("returns undefined without credentials or for non-AWS labels", async () => {
    pinEnv("AWS_ACCESS_KEY_ID", undefined);
    pinEnv("AWS_SECRET_ACCESS_KEY", undefined);
    const url = new URL("https://sts.us-east-1.amazonaws.com/");
    const unsigned = await maybeSignAwsRequest(
      url,
      "/",
      { method: "POST", headers: {} },
      emptyDoc,
      "aws"
    );
    expect(unsigned).toBeUndefined();

    pinEnv("AWS_ACCESS_KEY_ID", "AKIATEST");
    pinEnv("AWS_SECRET_ACCESS_KEY", "secret");
    const gcp = await maybeSignAwsRequest(
      url,
      "/",
      { method: "POST", headers: {} },
      emptyDoc,
      "google"
    );
    expect(gcp).toBeUndefined();
  });

  it("signs AWS requests with Authorization and host including non-default port", async () => {
    pinEnv("AWS_ACCESS_KEY_ID", "AKIATEST");
    pinEnv("AWS_SECRET_ACCESS_KEY", "secretsecret");
    pinEnv("AWS_REGION", "us-west-2");
    const url = new URL("https://sts.us-west-2.amazonaws.com:8443/");
    const signed = await maybeSignAwsRequest(
      url,
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "Action=GetCallerIdentity",
      },
      emptyDoc,
      "aws"
    );
    expect(signed).toBeDefined();
    expect(signed!.headers.Authorization ?? signed!.headers.authorization).toMatch(
      /AWS4-HMAC-SHA256/
    );
    expect(signed!.headers.host).toBe("sts.us-west-2.amazonaws.com:8443");
    expect(Object.keys(signed!.headers).some((k) => k.toLowerCase().startsWith("x-amz-"))).toBe(
      true
    );
  });
});
