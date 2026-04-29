import { describe, expect, it } from "vitest";
import { extractWikilinkTargets, stripVaultFrontmatter } from "./vault-markdown.js";

describe("vault-markdown", () => {
  it("stripVaultFrontmatter removes leading YAML block", () => {
    const body = stripVaultFrontmatter("---\ntags: [a]\n---\n\n# Title\n\nHello");
    expect(body).toBe("# Title\n\nHello");
  });

  it("stripVaultFrontmatter leaves content without frontmatter unchanged", () => {
    expect(stripVaultFrontmatter("# Only")).toBe("# Only");
  });

  it("stripVaultFrontmatter does not strip incomplete frontmatter", () => {
    const s = "---\nno closing";
    expect(stripVaultFrontmatter(s)).toBe(s);
  });

  it("extractWikilinkTargets collects left-hand targets and ignores aliases", () => {
    expect(extractWikilinkTargets("See [[Note One]] and [[Other|display]]")).toEqual([
      "Note One",
      "Other",
    ]);
  });

  it("extractWikilinkTargets returns empty when no wikilinks", () => {
    expect(extractWikilinkTargets("plain text")).toEqual([]);
  });
});
