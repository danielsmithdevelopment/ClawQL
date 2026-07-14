import { describe, expect, it } from "vitest";
import { extractTypeScriptGraph } from "./extract-typescript.js";

describe("extractTypeScriptGraph", () => {
  it("extracts functions, imports, and contains edges", () => {
    const source = `
import { foo } from "./other.js";

/** Authenticates users. */
export function authenticate(user: string): boolean {
  return foo(user);
}

export class UserService {
  login() {
    authenticate("x");
  }
}
`;
    const result = extractTypeScriptGraph("/tmp/auth.ts", "src/auth.ts", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("authenticate");
    expect(names).toContain("UserService");
    expect(names).toContain("login");
    expect(result.edges.some((e) => e.kind === "imports" && e.confidence === "EXTRACTED")).toBe(true);
    expect(result.edges.some((e) => e.kind === "contains")).toBe(true);
    const authNode = result.nodes.find((n) => n.name === "authenticate");
    expect(authNode?.docComment).toContain("Authenticates");
  });
});
