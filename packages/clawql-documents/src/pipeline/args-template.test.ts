import { describe, expect, it } from "vitest";

import { resolveArgsTemplate } from "./args-template.js";

describe("resolveArgsTemplate", () => {
  it("substitutes document_url from context", () => {
    const resolved = resolveArgsTemplate("${document_url}", {
      document_url: "https://files.example/idp/inbox/w2.pdf",
    });
    expect(resolved).toBe("https://files.example/idp/inbox/w2.pdf");
  });

  it("substitutes pdf_base64 and redact_list", () => {
    const resolved = resolveArgsTemplate(
      { fileInput: "${pdf_base64}", listOfText: "${redact_list}" },
      { pdf_base64: "JVBERi0x", redact_list: "SSN,EIN" }
    );
    expect(resolved).toEqual({ fileInput: "JVBERi0x", listOfText: "SSN,EIN" });
  });

  it("builds Nextcloud WebDAV url when base and user are set", () => {
    const prevBase = process.env.NEXTCLOUD_BASE_URL;
    const prevUser = process.env.NEXTCLOUD_USERNAME;
    process.env.NEXTCLOUD_BASE_URL = "http://nextcloud.local";
    process.env.NEXTCLOUD_USERNAME = "agent";
    try {
      const resolved = resolveArgsTemplate("${document_url}", {
        document_path: "IDP/inbox/document.pdf",
      });
      expect(resolved).toBe(
        "http://nextcloud.local/remote.php/dav/files/agent/IDP/inbox/document.pdf"
      );
    } finally {
      if (prevBase === undefined) delete process.env.NEXTCLOUD_BASE_URL;
      else process.env.NEXTCLOUD_BASE_URL = prevBase;
      if (prevUser === undefined) delete process.env.NEXTCLOUD_USERNAME;
      else process.env.NEXTCLOUD_USERNAME = prevUser;
    }
  });
});
