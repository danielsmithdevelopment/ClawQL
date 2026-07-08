import { describe, expect, it } from "vitest";
import {
  applyAwsQueryActionPath,
  isAwsSpecLabel,
  resolveAwsApiBaseUrl,
  resolveAwsRegion,
  resolveAwsServiceName,
} from "clawql-api";

describe("aws-auth helpers", () => {
  it("moves #Action= into query string", () => {
    const url = new URL("https://sts.us-east-1.amazonaws.com/#Action=AssumeRole");
    applyAwsQueryActionPath(url, "#Action=AssumeRole");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("Action")).toBe("AssumeRole");
    expect(url.hash).toBe("");
  });

  it("resolves regional HTTPS base URL from OpenAPI servers", () => {
    process.env.AWS_REGION = "eu-west-1";
    const base = resolveAwsApiBaseUrl({
      openapi: "3.0.0",
      info: { title: "EC2", version: "2016-11-15", "x-serviceName": "ec2" },
      servers: [
        { url: "http://ec2.{region}.amazonaws.com" },
        { url: "https://ec2.{region}.amazonaws.com" },
      ],
    });
    expect(base).toBe("https://ec2.eu-west-1.amazonaws.com");
    delete process.env.AWS_REGION;
  });

  it("derives service name from slug or x-serviceName", () => {
    expect(
      resolveAwsServiceName("ec2-2016-11-15", {
        openapi: "3.0.0",
        info: { title: "EC2", version: "1" },
      })
    ).toBe("ec2");
    expect(
      resolveAwsServiceName(undefined, {
        openapi: "3.0.0",
        info: { title: "STS", version: "1", "x-serviceName": "sts" },
      })
    ).toBe("sts");
  });

  it("defaults region to us-east-1", () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.CLAWQL_AWS_REGION;
    expect(resolveAwsRegion()).toBe("us-east-1");
  });

  it("isAwsSpecLabel distinguishes AWS date-version slugs from GCP", () => {
    expect(isAwsSpecLabel("lambda-2015-03-31")).toBe(true);
    expect(isAwsSpecLabel("run-v2")).toBe(false);
  });
});
