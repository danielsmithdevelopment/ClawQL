import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveArgsTemplate } from "./args-template.js";

describe("resolveArgsTemplate", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("substitutes document_path and nextcloud env vars", () => {
    process.env.NEXTCLOUD_USERNAME = "alice";
    process.env.NEXTCLOUD_APP_PASSWORD = "secret";
    const resolved = resolveArgsTemplate(
      {
        username: "${NEXTCLOUD_USERNAME}",
        filePath: "${document_path}",
      },
      { document_path: "IDP/inbox/loan.pdf" }
    ) as Record<string, string>;
    expect(resolved.username).toBe("alice");
    expect(resolved.filePath).toBe("IDP/inbox/loan.pdf");
  });

  it("derives processed_path from document_path when omitted", () => {
    const resolved = resolveArgsTemplate("${processed_path}", {
      document_path: "IDP/inbox/loan.pdf",
    });
    expect(resolved).toBe("IDP/processed/loan.pdf");
  });

  it("recurses into nested arrays and objects", () => {
    const resolved = resolveArgsTemplate(
      { tags: ["${source_path}"], meta: { path: "${document_path}" } },
      { document_path: "inbox/x.pdf" }
    ) as { tags: string[]; meta: { path: string } };
    expect(resolved.tags[0]).toBe("inbox/x.pdf");
    expect(resolved.meta.path).toBe("inbox/x.pdf");
  });
});
