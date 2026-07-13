import { describe, expect, it } from "vitest";
import { extractWithTreeSitter } from "./extract-tree-sitter.js";

describe("extractWithTreeSitter", () => {
  it("extracts Python functions and imports", async () => {
    const source = `
import os

def authenticate(user: str) -> bool:
    return os.path.exists(user)

class UserService:
    def login(self):
        authenticate("x")
`;
    const result = await extractWithTreeSitter("python", "auth.py", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("authenticate");
    expect(names).toContain("UserService");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });

  it("extracts Go functions and imports", async () => {
    const source = `
package main

import "fmt"

func Authenticate(user string) bool {
    fmt.Println(user)
    return true
}
`;
    const result = await extractWithTreeSitter("go", "auth.go", source);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("Authenticate");
    expect(result.edges.some((e) => e.kind === "imports")).toBe(true);
  });
});
